import 'dotenv/config'
import { env } from '@smtm/shared/env'

// Lazy import discord.js to avoid errors if deps aren't installed yet
async function start() {
  const token = process.env.DISCORD_BOT_TOKEN || ''
  if (!token) {
    console.error('DISCORD_BOT_TOKEN is not set. Add it to your environment.')
    process.exit(1)
  }

  const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = await import('discord.js')

  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  // Minimal commands to start: /ping and /stats
  const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Check bot is alive'),
    new SlashCommandBuilder().setName('stats').setDescription('Show Polymarket stats').addStringOption(o=>o.setName('id').setDescription('Address, username, or profile URL').setRequired(true)),
  ].map(c => c.toJSON())

  client.once('ready', async () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`)
  })

  // Register commands (global). For faster iteration, set GUILD_ID and use Routes.applicationGuildCommands
  const rest = new REST({ version: '10' }).setToken(token)
  const appId = process.env.DISCORD_APPLICATION_ID
  if (!appId) {
    console.warn('DISCORD_APPLICATION_ID not set — slash command registration skipped')
  } else {
    try {
      await rest.put(Routes.applicationCommands(appId), { body: commands })
      console.log('Registered global slash commands')
    } catch (e) {
      console.warn('Failed to register slash commands:', (e as any)?.message)
    }
  }

  client.on('interactionCreate', async (interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return
      if (interaction.commandName === 'ping') {
        await interaction.reply({ content: 'Pong! 🏓', ephemeral: true })
        return
      }
      if (interaction.commandName === 'stats') {
        const input = interaction.options.getString('id', true)
        await interaction.deferReply()
        // TODO: Reuse data clients to resolve address and compute stats, similar to Telegram /stats
        await interaction.editReply({ content: `Stats lookup queued for: ${input}` })
        return
      }
    } catch (e) {
      console.error('interaction error', e)
      try { if (interaction.isRepliable()) await interaction.reply({ content: '❌ Error handling command', ephemeral: true }) } catch {}
    }
  })

  await client.login(token)
}

start().catch((e)=>{
  console.error('Discord bot failed to start', e)
  process.exit(1)
})

