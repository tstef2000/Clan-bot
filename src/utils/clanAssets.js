const {
  PermissionFlagsBits,
  ChannelType,
  OverwriteType
} = require('discord.js');
const { CYAN_ROLE } = require('./constants');

function toChannelName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);
}

// Create all Discord assets associated with a clan.
// Assets created:
// - Role
// - Private text channel
async function createClanAssets(guild, clanName, options = {}) {
  const { clanChannelsCategoryId = null } = options;

  const memberRole = await guild.roles.create({
    name: clanName,
    color: CYAN_ROLE,
    hoist: false,
    mentionable: false,
    reason: `Clan member role created for ${clanName}`
  });

  const textChannel = await guild.channels.create({
    name: toChannelName(clanName),
    type: ChannelType.GuildText,
    parent: clanChannelsCategoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages
        ],
        type: OverwriteType.Role
      },
      {
        id: memberRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ],
        type: OverwriteType.Role
      }
    ],
    reason: `Clan text channel created for ${clanName}`
  });

  return {
    roleId: memberRole.id,
    leaderRoleId: null,
    coLeaderRoleId: null,
    categoryId: null,
    textChannelId: textChannel.id,
    voiceChannelId: null
  };
}

// Cleanly delete all clan-linked Discord assets.
async function deleteClanAssets(guild, clan) {
  const channelsToDelete = [clan.textChannelId, clan.voiceChannelId, clan.categoryId];

  for (const channelId of channelsToDelete) {
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (channel) {
      await channel.delete(`Deleting assets for disbanded clan ${clan.name}`).catch(() => null);
    }
  }

  const rolesToDelete = [clan.roleId];
  for (const roleId of rolesToDelete) {
    if (!roleId) continue;
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    if (role) {
      await role.delete(`Deleting role for disbanded clan ${clan.name}`).catch(() => null);
    }
  }
}

module.exports = {
  createClanAssets,
  deleteClanAssets
};
