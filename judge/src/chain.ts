import { ApiPromise, Keyring, WsProvider } from '@polkadot/api'
import type { KeyringPair } from '@polkadot/keyring/types'
import { u8aToHex, u8aToString } from '@polkadot/util'
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto'
import { declaredFields, SS58_PREFIX } from '@numen-id/shared'

export interface OnChainIdentity {
  fields: Record<string, string>
  hash: string
  /** Registrar indexes standing behind this record with a checked judgement. */
  checkedBy: number[]
}

/** One identity written in a block, beside what its extrinsic paid this registrar. */
export interface SetIdentity {
  who: string
  paid: bigint
}

/**
 * The api's query and tx roots are index signatures, so everything crossing the
 * polkadot-js boundary is named here once and cast at the edge.
 */
interface Queries {
  system: { events(): Promise<unknown> }
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
    setFields(regIndex: number, fields: bigint): Submittable
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
  fields: { toBigInt(): bigint }
}

/**
 * IdentityField bits as numen_runtime's identity_info orders them, telegram at
 * eight and discord at nine. Declaring them on chain is how the wallet finds
 * this registrar and what the judgement policy accepts as provable, there is no
 * other marking anywhere.
 */
const FIELDS = (1n << 8n) | (1n << 9n)

export class Chain {
  /** What the declaration says this registrar checks, which decide() enforces. */
  readonly declared = declaredFields(FIELDS)

  private constructor(
    private api: ApiPromise,
    private pair: KeyringPair,
    private regIndex: number,
  ) {}

  static async connect(rpc: string, suri: string): Promise<Chain> {
    await cryptoWaitReady()
    const api = await ApiPromise.create({ provider: new WsProvider(rpc), noInitWarn: true })
    if (api.registry.chainSS58 !== SS58_PREFIX) {
      throw new Error(`the chain speaks prefix ${api.registry.chainSS58}, expected ${SS58_PREFIX}`)
    }

    const pair = new Keyring({ type: 'sr25519' }).addFromUri(suri)
    const chain = new Chain(api, pair, await Chain.ownIndex(api, pair))
    await chain.declare().catch((cause: unknown) => {
      console.error('the declaration did not land, judging anyway', cause)
    })
    return chain
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

  /** A note on chain for whoever reads the registrar list. */
  private async declare(): Promise<void> {
    const registrars = (await this.queries.identity.registrars()) as OptionLike<RegistrarLike>[]
    const entry = registrars[this.regIndex]
    const held = entry?.isSome ? entry.unwrap().fields.toBigInt() : 0n
    if (held === FIELDS) return

    const refusal = await this.submit(this.txs.identity.setFields(this.regIndex, FIELDS))
    if (refusal !== null) throw new Error(`the chain refused the fields, ${refusal}`)
    console.log(`registrar ${this.regIndex} declares ${this.declared.join(' and ')}`)
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
   * this registrar's account. Same extrinsic is the whole binding, a transfer
   * anywhere else pays for nothing. The parent hash comes off this very header,
   * so what stood before the write is read from the same fork.
   */
  async setsIn(
    height: number,
  ): Promise<{ blockHash: string; parentHash: string; sets: SetIdentity[] }> {
    const blockHash = (await this.api.rpc.chain.getBlockHash(height)).toHex()
    const parentHash = (await this.api.rpc.chain.getHeader(blockHash)).parentHash.toHex()
    const at = await this.queriesAt(blockHash)
    const records = (await at.system.events()) as EventRecordLike[]

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
        u8aToHex((event.data[1] as CodecLike).toU8a()) === u8aToHex(this.pair.publicKey)
      ) {
        const amount = (event.data[2] as { toBigInt(): bigint }).toBigInt()
        paidIn.set(extrinsic, (paidIn.get(extrinsic) ?? 0n) + amount)
      }
    }

    const sets = new Map<string, bigint>()
    for (const [extrinsic, who] of setBy) {
      sets.set(who, (sets.get(who) ?? 0n) + (paidIn.get(extrinsic) ?? 0n))
    }
    return { blockHash, parentHash, sets: [...sets].map(([who, paid]) => ({ who, paid })) }
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
    for (const [registrar, judgement] of judgements) {
      if (judgement.type === 'Reasonable' || judgement.type === 'KnownGood') {
        checkedBy.push(registrar.toNumber())
      }
    }
    return { fields, hash: this.api.registry.hash(info.toU8a()).toHex(), checkedBy }
  }

  provideJudgement(who: string, infoHash: string): Promise<string | null> {
    return this.submit(
      this.txs.identity.provideJudgement(this.regIndex, { Id: who }, 'Reasonable', infoHash),
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
