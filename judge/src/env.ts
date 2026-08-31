import { UNIT } from '@numen-id/shared'

const need = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name} in the environment`)
  return value
}

export const env = {
  rpc: need('RPC_URL'),
  dbPath: need('DB_PATH'),
  suri: need('REGISTRAR_SURI'),
  price: BigInt(need('CHANNEL_FEE_NUMN')) * UNIT,
}
