const GuildConfig = require('../models/GuildConfig');

// Send a best-effort log message to the configured guild log channel.
async function logClanEvent(guild, text) {
  const cfg = await GuildConfig.findOne({ guildId: guild.id });
  if (!cfg?.logChannelId) return;

  const channel = guild.channels.cache.get(cfg.logChannelId) || (await guild.channels.fetch(cfg.logChannelId).catch(() => null));
  if (!channel || !channel.isTextBased()) return;

  await channel.send({ content: `🪵 ${text}` }).catch(() => null);
}

module.exports = {
  logClanEvent
};
