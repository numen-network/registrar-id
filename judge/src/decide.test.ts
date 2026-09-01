import { describe, expect, it } from 'vitest'
import { UNIT } from '@numen-id/shared'
import { decide, type Open } from './decide.js'

const record = (over: Record<string, string> = {}): Record<string, string> => ({
  display: 'Alice',
  avatar: '',
  bio: '',
  web: '',
  email: '',
  github: '',
  matrix: '',
  x: '',
  telegram: '',
  discord: '',
  ...over,
})

const open = (id: number, channel: string, handle: string): Open => ({ id, channel, handle })

const PRICE = 10n * UNIT

describe('decide', () => {
  it('judges one paid channel and spends its sign in', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1] })
  })

  it('judges both channels when the transfer covers both', () => {
    const verdict = decide(
      record({ telegram: 'alice', discord: 'alice_dc' }),
      [open(1, 'telegram', 'alice'), open(2, 'discord', 'alice_dc')],
      {},
      2n * PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1, 2] })
  })

  it('leaves two channels paid as one alone', () => {
    const verdict = decide(
      record({ telegram: 'alice', discord: 'alice_dc' }),
      [open(1, 'telegram', 'alice'), open(2, 'discord', 'alice_dc')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: null, why: expect.stringContaining('paid') })
  })

  it('leaves a record that paid nothing alone', () => {
    const verdict = decide(record({ telegram: 'alice' }), [open(1, 'telegram', 'alice')], {}, 0n, PRICE)
    expect(verdict).toMatchObject({ stamp: null, why: expect.stringContaining('paid') })
  })

  it('takes an overpayment without complaint', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      3n * PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1] })
  })

  it('marks a channel nobody signed in for', () => {
    const verdict = decide(record({ telegram: 'alice' }), [], {}, PRICE, PRICE)
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'no sign in stands behind telegram' })
  })

  it('marks a handle that does not match the login', () => {
    const verdict = decide(
      record({ telegram: 'somebody_else' }),
      [open(1, 'telegram', 'alice')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'no sign in stands behind telegram' })
  })

  it('marks a record that goes by no name', () => {
    for (const display of ['', '   ', '\u200b']) {
      const verdict = decide(
        record({ display, telegram: 'alice' }),
        [open(1, 'telegram', 'alice')],
        {},
        PRICE,
        PRICE,
      )
      expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'the record goes by no name' })
    }
  })

  it('marks a record with no channel at all', () => {
    const verdict = decide(record(), [open(1, 'telegram', 'alice')], {}, PRICE, PRICE)
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'no channel on the record' })
  })

  it('takes an avatar every wallet can render', () => {
    for (const avatar of [
      'https://example.com/alice.png',
      'https://example.com/alice.jpg',
      'https://example.com/alice.jpeg',
      'https://example.com/alice.gif',
      'https://example.com/alice.webp',
    ]) {
      const verdict = decide(
        record({ avatar, telegram: 'alice' }),
        [open(1, 'telegram', 'alice')],
        {},
        PRICE,
        PRICE,
      )
      expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1] })
    }
  })

  // The extension has to land at the end, so a query string puts it out of reach
  it('marks an avatar that shows no picture', () => {
    for (const avatar of [
      'http://example.com/alice.png',
      'example.com/alice.png',
      'https://example.com/alice',
      'https://example.com/alice.svg',
      'https://example.com/alice.png?size=64',
    ]) {
      const verdict = decide(
        record({ avatar, telegram: 'alice' }),
        [open(1, 'telegram', 'alice')],
        {},
        PRICE,
        PRICE,
      )
      expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'the avatar shows no picture' })
    }
  })

  it('takes a record wearing no avatar', () => {
    const verdict = decide(
      record({ avatar: '', telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1] })
  })

  it('takes a profile nobody can prove', () => {
    const verdict = decide(
      record({
        telegram: 'alice',
        avatar: 'https://example.com/alice.png',
        bio: 'Runs a validator.',
      }),
      [open(1, 'telegram', 'alice')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1] })
  })

  it('marks a field filled past the profile and the channels', () => {
    const verdict = decide(
      record({ telegram: 'alice', email: 'alice@example.com' }),
      [open(1, 'telegram', 'alice')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: expect.stringContaining('email') })
  })

  it('marks x, no bot signs into it', () => {
    const verdict = decide(
      record({ telegram: 'alice', x: '@alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: expect.stringContaining('x') })
  })

  it('calls an unprovable channel out ahead of an unprovable field', () => {
    const verdict = decide(
      record({ telegram: 'alice', email: 'alice@example.com' }),
      [],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'no sign in stands behind telegram' })
  })

  it('spends only what the record wears', () => {
    const verdict = decide(
      record({ discord: 'alice_dc' }),
      [open(1, 'telegram', 'alice'), open(2, 'discord', 'alice_dc')],
      {},
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [2] })
  })

  it('inherits a channel it already stood behind, free of charge', () => {
    const verdict = decide(record({ telegram: 'alice' }), [], { telegram: 'alice' }, 0n, PRICE)
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [] })
  })

  it('charges only the fresh channel beside an inherited one', () => {
    const verdict = decide(
      record({ telegram: 'alice', discord: 'alice_dc' }),
      [open(1, 'discord', 'alice_dc')],
      { telegram: 'alice' },
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [1] })
  })

  it('treats a moved handle as fresh again', () => {
    const stale = decide(
      record({ telegram: 'renamed' }),
      [],
      { telegram: 'alice' },
      PRICE,
      PRICE,
    )
    expect(stale).toMatchObject({ stamp: 'Erroneous', why: 'no sign in stands behind telegram' })

    const proven = decide(
      record({ telegram: 'renamed' }),
      [open(1, 'telegram', 'renamed')],
      { telegram: 'alice' },
      PRICE,
      PRICE,
    )
    expect(proven).toEqual({ stamp: 'Reasonable', spend: [1] })
  })

  // Signing in again is the account saying it moved, so the older handle
  // stops standing the moment a newer proof lands
  it('lets a fresh sign in speak over the handle it replaces', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice_new')],
      { telegram: 'alice' },
      0n,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: 'no sign in stands behind telegram' })
  })

  it('prefers inheriting over spending when both stand', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      { telegram: 'alice' },
      0n,
      PRICE,
    )
    expect(verdict).toEqual({ stamp: 'Reasonable', spend: [] })
  })

  it('inheritance stands in for a sign in, not for cleanliness', () => {
    const verdict = decide(
      record({ telegram: 'alice', email: 'alice@example.com' }),
      [],
      { telegram: 'alice' },
      0n,
      PRICE,
    )
    expect(verdict).toMatchObject({ stamp: 'Erroneous', why: expect.stringContaining('email') })
  })
})
