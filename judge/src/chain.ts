import { ApiPromise, Keyring, WsProvider } from '@polkadot/api'
import type { KeyringPair } from '@polkadot/keyring/types'
import { stringToU8a, u8aToHex, u8aToString } from '@polkadot/util'
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto'
import { SS58_PREFIX } from '@numen-id/shared'
import type { Stamp } from './decide.js'

export interface OnChainIdentity {
  fields: Record<string, string>
  hash: string
  /** Registrar indexes standing behind this record with a checked judgement. */
  checkedBy: number[]
  /** Registrar indexes with a judgement request standing on this record. */
  askedBy: number[]
}

/** One identity written in a block, beside what its extrinsic paid the treasury. */
export interface SetIdentity {
  who: string
  paid: bigint
}

/**
 * The api's const, query and tx roots are index signatures, so everything
 * crossing the polkadot-js boundary is named here once and cast at the edge.
 */
interface Consts {
  treasury: { palletId: CodecLike }
}

interface Queries {
  system: { events(): Promise<unknown> }
  timestamp: { now(): Promise<unknown> }
  identity: {
    identityOf(who: string): Promise<unknown>
    registrars(): Promise<unknown>
  }
}

interface TxResult {
  dispatchError?: { isModule: boolean; asModule: unknown; toString(): string } | null
  status: {
    isInBlock: boolean
    isDropped: boolean
    isInvalid: boolean
    isUsurped: boolean
    type: string
  }
}

interface Submittable {
  signAndSend(
    pair: KeyringPair,
    options: { nonce: number },
    callback: (result: TxResult) => void,
  ): Promise<() => void>
}

interface Txs {
  identity: {
    provideJudgement(
      regIndex: number,
      target: { Id: string },
      judgement: string,
      identity: string,
    ): Submittable
  }
}

interface OptionLike<T> {
  isSome: boolean
  unwrap(): T
}

interface CodecLike {
  toU8a(): Uint8Array
}

interface TextLike {
  toU8a(bare?: boolean): Uint8Array
}

interface EventRecordLike {
  phase: { isApplyExtrinsic: boolean; asApplyExtrinsic: { toNumber(): number } }
  event: { section: string; method: string; data: unknown[] }
}

interface RegistrarLike {
  account: CodecLike
}

export class Chain {
  private constructor(
    private api: ApiPromise,
    private pair: KeyringPair,
    private regIndex: number,
    private treasuryKey: string,
  ) {}

  static async connect(rpc: string, suri: string): Promise<Chain> {
    await cryptoWaitReady()
    const api = await ApiPromise.create({ provider: new WsProvider(rpc), noInitWarn: true })
    if (api.registry.chainSS58 !== SS58_PREFIX) {
      throw new Error(`the chain speaks prefix ${api.registry.chainSS58}, expected ${SS58_PREFIX}`)
    }

    const pair = new Keyring({ type: 'sr25519' }).addFromUri(suri)
    return new Chain(api, pair, await Chain.ownIndex(api, pair), Chain.treasuryKey(api))
  }

  /**
   * The account the check fee is paid into, which frame derives by writing the
   * type tag, the pallet id and trailing zeros into the 32 bytes an address
   * takes. Reading it off the chain leaves one answer. A configured address
   * would be a second one to get wrong.
   */
  private static treasuryKey(api: ApiPromise): string {
    const consts = api.consts as unknown as Consts
    const raw = new Uint8Array(32)
    raw.set(stringToU8a('modl'))
    raw.set(consts.treasury.palletId.toU8a(), 4)
    return u8aToHex(raw)
  }

  private get queries(): Queries {
    return this.api.query as unknown as Queries
  }

  private get txs(): Txs {
    return this.api.tx as unknown as Txs
  }

  private async queriesAt(blockHash: string): Promise<Queries> {
    return (await this.api.at(blockHash)).query as unknown as Queries
  }

  /**
   * Judging with a key the chain does not know as a registrar helps nobody, so
   * the slot is found by this key rather than told by anyone.
   */
  private static async ownIndex(api: ApiPromise, pair: KeyringPair): Promise<number> {
    const queries = api.query as unknown as Queries
    const registrars = (await queries.identity.registrars()) as OptionLike<RegistrarLike>[]
    const index = registrars.findIndex(
      (entry) =>
        entry.isSome && u8aToHex(entry.unwrap().account.toU8a()) === u8aToHex(pair.publicKey),
    )
    if (index === -1) throw new Error('the chain does not know this key as a registrar')
    return index
  }

  async tip(): Promise<number> {
    return (await this.api.rpc.chain.getHeader()).number.toNumber()
  }

  onNewHeight(listener: (height: number) => void): void {
    void this.api.rpc.chain.subscribeNewHeads((header) => listener(header.number.toNumber()))
  }

  /** The slot this key holds, which judgements and inheritance both key on. */
  get index(): number {
    return this.regIndex
  }

  /**
   * Who set an identity in this block, beside what the same extrinsic moved to
   * the treasury, and the time the block carries. Same extrinsic is the whole
   * binding, a transfer anywhere else pays for nothing. The parent hash comes
   * off this very header, so what stood before the write is read from the same
   * fork.
   */
  async setsIn(
    height: number,
  ): Promise<{ blockHash: string; parentHash: string; time: number; sets: SetIdentity[] }> {
    const blockHash = (await this.api.rpc.chain.getBlockHash(height)).toHex()
    const parentHash = (await this.api.rpc.chain.getHeader(blockHash)).parentHash.toHex()
    const at = await this.queriesAt(blockHash)
    const records = (await at.system.events()) as EventRecordLike[]
    const time = ((await at.timestamp.now()) as { toNumber(): number }).toNumber()

    const setBy = new Map<number, string>()
    const paidIn = new Map<number, bigint>()
    for (const { phase, event } of records) {
      if (!phase.isApplyExtrinsic) continue
      const extrinsic = phase.asApplyExtrinsic.toNumber()

      if (event.section === 'identity' && event.method === 'IdentitySet') {
        setBy.set(extrinsic, encodeAddress((event.data[0] as CodecLike).toU8a(), SS58_PREFIX))
      }
      if (
        event.section === 'balances' &&
        event.method === 'Transfer' &&
        u8aToHex((event.data[1] as CodecLike).toU8a()) === this.treasuryKey
      ) {
        const amount = (event.data[2] as { toBigInt(): bigint }).toBigInt()
        paidIn.set(extrinsic, (paidIn.get(extrinsic) ?? 0n) + amount)
      }
    }

    const sets = new Map<string, bigint>()
    for (const [extrinsic, who] of setBy) {
      sets.set(who, (sets.get(who) ?? 0n) + (paidIn.get(extrinsic) ?? 0n))
    }
    return { blockHash, parentHash, time, sets: [...sets].map(([who, paid]) => ({ who, paid })) }
  }

  /** The identity as that block held it, readable and hashed the runtime's way. */
  async identityAt(blockHash: string, who: string): Promise<OnChainIdentity | null> {
    const at = await this.queriesAt(blockHash)
    const entry = (await at.identity.identityOf(who)) as OptionLike<{
      info: CodecLike & Iterable<[string, TextLike]>
      judgements: Iterable<[{ toNumber(): number }, { type: string }]>
    }>
    if (!entry.isSome) return null

    const { info, judgements } = entry.unwrap()
    const fields: Record<string, string> = {}
    for (const [name, value] of info) {
      fields[name] = u8aToString(value.toU8a(true))
    }

    const checkedBy: number[] = []
    const askedBy: number[] = []
    for (const [registrar, judgement] of judgements) {
      if (judgement.type === 'Reasonable' || judgement.type === 'KnownGood') {
        checkedBy.push(registrar.toNumber())
      }
      if (judgement.type === 'FeePaid') askedBy.push(registrar.toNumber())
    }
    return { fields, hash: this.api.registry.hash(info.toU8a()).toHex(), checkedBy, askedBy }
  }

  provideJudgement(who: string, infoHash: string, stamp: Stamp): Promise<string | null> {
    return this.submit(
      this.txs.identity.provideJudgement(this.regIndex, { Id: who }, stamp, infoHash),
    )
  }

  /**
   * Resolves null once the call is in a block, resolves the chain's words when
   * it refused, and throws when the send itself went wrong and a retry makes
   * sense.
   */
  private submit(tx: Submittable): Promise<string | null> {
    return new Promise((resolve, reject) => {
      let stop: (() => void) | undefined
      const settle = (outcome: () => void) => {
        outcome()
        stop?.()
      }

      tx.signAndSend(this.pair, { nonce: -1 }, (result) => {
        const error = result.dispatchError
        if (error) {
          const words = error.isModule
            ? (() => {
                const meta = this.api.registry.findMetaError(error.asModule as never)
                return `${meta.section}.${meta.name}`
              })()
            : error.toString()
          settle(() => resolve(words))
        } else if (result.status.isInBlock) {
          settle(() => resolve(null))
        } else if (result.status.isDropped || result.status.isInvalid || result.status.isUsurped) {
          settle(() => reject(new Error(`transaction ${result.status.type}`)))
        }
      })
        .then((unsub) => {
          stop = unsub
        })
        .catch(reject)
    })
  }
}
