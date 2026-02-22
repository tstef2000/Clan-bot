// Main bot bootstrap file.
// Responsibilities:
// - Initialize file-based storage models
// - Initialize Discord client
// - Load commands
// - Register slash commands
// - Bind event handlers

const path = require('path');
const fs = require('fs');
const {
  Client,
  Collection,
  GatewayIntentBits,
  REST,
  Routes
} = require('discord.js');
const config = require('./config');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

// Dynamically load command modules from src/commands.
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

const slashCommandData = [];

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
  slashCommandData.push(command.data.toJSON());
}

// Dynamically load event modules from src/events.
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  if (config.guildId) {
    // Fast deployment for a single testing guild.
    await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: slashCommandData }
    );
    console.log(`Registered ${slashCommandData.length} guild slash commands.`);
    return;
  }

  // Global deployment (can take up to ~1 hour to appear everywhere).
  await rest.put(Routes.applicationCommands(config.clientId), {
    body: slashCommandData
  });
  console.log(`Registered ${slashCommandData.length} global slash commands.`);
}

async function bootstrap() {
  try {
    console.log('Using file-based storage (JSON files in /data).');

    await registerSlashCommands();

    await client.login(config.discordToken);
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

bootstrap();
