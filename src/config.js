// Centralized environment configuration.
// Keeping this in one place makes startup validation and troubleshooting easier.
require('dotenv').config();

const required = ['DISCORD_TOKEN', 'CLIENT_ID'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null
};
