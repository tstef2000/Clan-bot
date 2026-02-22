const { EmbedBuilder } = require('discord.js');
const { CYAN_SUCCESS, CYAN_ERROR, CYAN_INFO } = require('./constants');

const WATERMARK_TEXT = 'Made By Trident Studios';

// Build consistent success embeds.
function buildSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(CYAN_SUCCESS)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setFooter({ text: WATERMARK_TEXT })
    .setTimestamp();
}

// Build consistent error embeds.
function buildErrorEmbed(description) {
  return new EmbedBuilder()
    .setColor(CYAN_ERROR)
    .setTitle('⚠️ Clan System Error')
    .setDescription(description)
    .setFooter({ text: WATERMARK_TEXT })
    .setTimestamp();
}

// Build consistent informational embeds.
function buildInfoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(CYAN_INFO)
    .setTitle(`🛡️ ${title}`)
    .setDescription(description)
    .setFooter({ text: WATERMARK_TEXT })
    .setTimestamp();
}

module.exports = {
  buildSuccessEmbed,
  buildErrorEmbed,
  buildInfoEmbed
};
