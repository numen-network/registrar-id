import { describe, expect, it } from 'vitest'
import { UNIT } from '@numen-id/shared'
import { decide, type Open } from './decide.js'

const record = (over: Record<string, string> = {}): Record<string, string> => ({
  display: 'Alice',
  avatar: '',
  about: '',
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

const DECLARED = ['telegram', 'discord']
const PRICE = 10n * UNIT

describe('decide', () => {
  it('judges one paid channel and spends its sign in', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [1] })
  })

  it('judges both channels when the transfer covers both', () => {
    const verdict = decide(
      record({ telegram: 'alice', discord: 'alice_dc' }),
      [open(1, 'telegram', 'alice'), open(2, 'discord', 'alice_dc')],
      {},
      DECLARED,
      2n * PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [1, 2] })
  })

  it('refuses two channels paid as one', () => {
    const verdict = decide(
      record({ telegram: 'alice', discord: 'alice_dc' }),
      [open(1, 'telegram', 'alice'), open(2, 'discord', 'alice_dc')],
      {},
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ judge: false, why: expect.stringContaining('paid') })
  })

  it('refuses a record that paid nothing', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      0n,
      PRICE,
    )
    expect(verdict).toMatchObject({ judge: false, why: expect.stringContaining('paid') })
  })

  it('takes an overpayment without complaint', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      3n * PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [1] })
  })

  it('refuses a channel nobody signed in for', () => {
    const verdict = decide(record({ telegram: 'alice' }), [], {}, DECLARED, PRICE, PRICE)
    expect(verdict).toMatchObject({ judge: false, why: 'no sign in stands behind telegram' })
  })

  it('refuses a handle that does not match the login', () => {
    const verdict = decide(
      record({ telegram: 'somebody_else' }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ judge: false, why: 'no sign in stands behind telegram' })
  })

  it('refuses a filled field outside the declaration', () => {
    const verdict = decide(
      record({ telegram: 'alice', email: 'alice@example.com' }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ judge: false, why: expect.stringContaining('email') })
  })

  it('refuses x while the declaration leaves it out', () => {
    const verdict = decide(
      record({ telegram: 'alice', x: '@alice' }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      2n * PRICE,
      PRICE,
    )
    expect(verdict).toMatchObject({ judge: false, why: expect.stringContaining('x') })
  })

  // The declaration is the policy, so widening it on chain widens what judges
  // with no code change here
  it('follows the declaration when it widens', () => {
    const verdict = decide(
      record({ x: '@alice' }),
      [open(1, 'x', '@alice')],
      {},
      ['x', 'telegram', 'discord'],
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [1] })
  })

  it('takes a profile nobody can prove', () => {
    const verdict = decide(
      record({
        telegram: 'alice',
        avatar: 'https://example.com/alice.png',
        about: 'Runs a validator.',
      }),
      [open(1, 'telegram', 'alice')],
      {},
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [1] })
  })

  it('refuses a record that goes by no name', () => {
    for (const display of ['', '   ', '\u200b']) {
      const verdict = decide(
        record({ display, telegram: 'alice' }),
        [open(1, 'telegram', 'alice')],
        {},
        DECLARED,
        PRICE,
        PRICE,
      )
      expect(verdict).toMatchObject({ judge: false, why: 'the record goes by no name' })
    }
  })

  it('refuses a record with no channel at all', () => {
    const verdict = decide(record(), [open(1, 'telegram', 'alice')], {}, DECLARED, PRICE, PRICE)
    expect(verdict).toMatchObject({ judge: false, why: 'no channel on the record' })
  })

  it('spends only what the record wears', () => {
    const verdict = decide(
      record({ discord: 'alice_dc' }),
      [open(1, 'telegram', 'alice'), open(2, 'discord', 'alice_dc')],
      {},
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [2] })
  })

  it('inherits a channel it already stood behind, free of charge', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [],
      { telegram: 'alice' },
      DECLARED,
      0n,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [] })
  })

  it('charges only the fresh channel beside an inherited one', () => {
    const verdict = decide(
      record({ telegram: 'alice', discord: 'alice_dc' }),
      [open(1, 'discord', 'alice_dc')],
      { telegram: 'alice' },
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [1] })
  })

  it('treats a moved handle as fresh again', () => {
    const stale = decide(
      record({ telegram: 'renamed' }),
      [],
      { telegram: 'alice' },
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(stale).toMatchObject({ judge: false, why: 'no sign in stands behind telegram' })

    const proven = decide(
      record({ telegram: 'renamed' }),
      [open(1, 'telegram', 'renamed')],
      { telegram: 'alice' },
      DECLARED,
      PRICE,
      PRICE,
    )
    expect(proven).toEqual({ judge: true, spend: [1] })
  })

  it('prefers inheriting over spending when both stand', () => {
    const verdict = decide(
      record({ telegram: 'alice' }),
      [open(1, 'telegram', 'alice')],
      { telegram: 'alice' },
      DECLARED,
      0n,
      PRICE,
    )
    expect(verdict).toEqual({ judge: true, spend: [] })
  })

  it('inheritance stands in for a sign in, not for cleanliness', () => {
    const verdict = decide(
      record({ telegram: 'alice', email: 'alice@example.com' }),
      [],
      { telegram: 'alice' },
      DECLARED,
      0n,
      PRICE,
    )
    expect(verdict).toMatchObject({ judge: false, why: expect.stringContaining('email') })
  })
})
