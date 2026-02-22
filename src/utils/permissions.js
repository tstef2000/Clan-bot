const { PermissionFlagsBits } = require('discord.js');
const User = require('../models/User');

// Check if a user has Discord administrator permissions.
function isDiscordAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// Retrieve the internal clan role state for a user in a guild.
async function getClanUser(guildId, userId) {
  return User.findOne({ guildId, userId });
}

// Leader gets full clan control.
function isLeader(clanUser) {
  return clanUser?.role === 'leader';
}

// Co-Leader gets invite + kick (non-leader targets) capabilities.
function isCoLeader(clanUser) {
  return clanUser?.role === 'co-leader';
}

module.exports = {
  isDiscordAdmin,
  getClanUser,
  isLeader,
  isCoLeader
};
