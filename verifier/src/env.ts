const need = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name} in the environment`)
  return value
}

export const env = {
  port: Number(need('PORT')),
  dbPath: need('DB_PATH'),
  botName: need('TELEGRAM_BOT_NAME'),
  botToken: need('TELEGRAM_BOT_TOKEN'),
  discordId: need('DISCORD_CLIENT_ID'),
  discordSecret: need('DISCORD_CLIENT_SECRET'),
  discordRedirect: need('DISCORD_REDIRECT_URI'),
  stateSecret: need('STATE_SECRET'),
  walletOrigin: need('WALLET_ORIGIN'),
}
