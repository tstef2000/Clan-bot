const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const Clan = require('../models/Clan');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');
const { deleteClanAssets } = require('../utils/clanAssets');
const {
  buildSuccessEmbed,
  buildErrorEmbed,
  buildInfoEmbed
} = require('../utils/embeds');
const { logClanEvent } = require('../utils/logger');

async function getOrCreateGuildConfig(guildId) {
  let cfg = await GuildConfig.findOne({ guildId });
  if (!cfg) cfg = await GuildConfig.create({ guildId });
  return cfg;
}

async function resolveClanByNameOrTag(guildId, input) {
  const normalized = input.trim();
  const upper = normalized.toUpperCase();

  return Clan.findOne({
    guildId,
    $or: [{ name: normalized }, { tag: upper }]
  });
}

function clanLabel(clan) {
  return clan.name;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clanadmin')
    .setDescription('Administrative clan controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('setlimit')
        .setDescription('Set max members allowed per clan')
        .addIntegerOption((opt) =>
          opt
            .setName('number')
            .setDescription('Clan member limit (2-100)')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(100)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('force-disband')
        .setDescription('Force disband a clan by name or tag')
        .addStringOption((opt) =>
          opt
            .setName('clan')
            .setDescription('Clan name or clan tag')
            .setRequired(true)
            .setMaxLength(32)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('reset-user')
        .setDescription('Reset clan state for a user')
        .addUserOption((opt) => opt.setName('user').setDescription('User to reset').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Create clan categories and configure clan log channel')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild, member } = interaction;

    if (!guild || !member) {
      await interaction.reply({
        embeds: [buildErrorEmbed('This command can only be used in a server.')],
        ephemeral: true
      });
      return;
    }

    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [buildErrorEmbed('You need Administrator permission to use this command.')],
        ephemeral: true
      });
      return;
    }

    if (sub === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      const cfg = await getOrCreateGuildConfig(guild.id);

      let clanChannelsCategory = guild.channels.cache.get(cfg.clanChannelsCategoryId);
      if (!clanChannelsCategory || clanChannelsCategory.type !== ChannelType.GuildCategory) {
        clanChannelsCategory = guild.channels.cache.find(
          (ch) => ch.type === ChannelType.GuildCategory && ch.name === 'Clan Channels'
        );
      }

      if (!clanChannelsCategory) {
        clanChannelsCategory = await guild.channels.create({
          name: 'Clan Channels',
          type: ChannelType.GuildCategory,
          reason: 'Clan channel parent category setup'
        });
      }

      let clanLogsCategory = guild.channels.cache.get(cfg.clanLogsCategoryId);
      if (!clanLogsCategory || clanLogsCategory.type !== ChannelType.GuildCategory) {
        clanLogsCategory = guild.channels.cache.find(
          (ch) => ch.type === ChannelType.GuildCategory && ch.name === 'Clan Channel Logs'
        );
      }

      if (!clanLogsCategory) {
        clanLogsCategory = await guild.channels.create({
          name: 'Clan Channel Logs',
          type: ChannelType.GuildCategory,
          reason: 'Clan log parent category setup'
        });
      }

      let logChannel = guild.channels.cache.get(cfg.logChannelId);
      if (!logChannel || logChannel.type !== ChannelType.GuildText) {
        logChannel = guild.channels.cache.find(
          (ch) =>
            ch.type === ChannelType.GuildText &&
            ch.parentId === clanLogsCategory.id &&
            ch.name === 'clan-channel-logs'
        );
      }

      if (!logChannel) {
        logChannel = await guild.channels.create({
          name: 'clan-channel-logs',
          type: ChannelType.GuildText,
          parent: clanLogsCategory.id,
          reason: 'Clan logging channel setup'
        });
      } else if (logChannel.parentId !== clanLogsCategory.id) {
        await logChannel.setParent(clanLogsCategory.id, {
          lockPermissions: false
        });
      }

      let leaderRole = guild.roles.cache.get(cfg.leaderRoleId);
      if (!leaderRole) {
        leaderRole = guild.roles.cache.find((role) => role.name === 'Clan Leader');
      }
      if (!leaderRole) {
        leaderRole = await guild.roles.create({
          name: 'Clan Leader',
          hoist: false,
          mentionable: false,
          reason: 'Global clan leader marker role setup'
        });
      }

      let coLeaderRole = guild.roles.cache.get(cfg.coLeaderRoleId);
      if (!coLeaderRole) {
        coLeaderRole = guild.roles.cache.find((role) => role.name === 'Clan Co-Leader');
      }
      if (!coLeaderRole) {
        coLeaderRole = await guild.roles.create({
          name: 'Clan Co-Leader',
          hoist: false,
          mentionable: false,
          reason: 'Global clan co-leader marker role setup'
        });
      }

      // Keep log channel visible only to admins.
      await logChannel.permissionOverwrites.edit(guild.roles.everyone.id, {
        ViewChannel: false
      }).catch(() => null);

      cfg.clanChannelsCategoryId = clanChannelsCategory.id;
      cfg.clanLogsCategoryId = clanLogsCategory.id;
      cfg.logChannelId = logChannel.id;
      cfg.leaderRoleId = leaderRole.id;
      cfg.coLeaderRoleId = coLeaderRole.id;
      await cfg.save();

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            'Setup Complete',
            `Configured ${clanChannelsCategory} for clan channels and ${clanLogsCategory} for logs.\nLog channel: ${logChannel}\nShared roles: ${leaderRole}, ${coLeaderRole}`
          )
        ]
      });
      return;
    }

    if (sub === 'setlimit') {
      const limit = interaction.options.getInteger('number', true);
      const cfg = await getOrCreateGuildConfig(guild.id);
      cfg.clanMemberLimit = limit;
      await cfg.save();

      await interaction.reply({
        embeds: [buildSuccessEmbed('Limit Updated', `Clan member limit is now **${limit}**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'reset-user') {
      const target = interaction.options.getUser('user', true);
      const cfg = await getOrCreateGuildConfig(guild.id);
      let targetDoc = await User.findOne({ guildId: guild.id, userId: target.id });

      if (!targetDoc) {
        targetDoc = await User.create({ guildId: guild.id, userId: target.id });
      }

      if (targetDoc.clanId) {
        const clan = await Clan.findById(targetDoc.clanId);
        if (clan) {
          if (clan.leaderId === target.id) {
            // Keep leader as-is; forcing leader reset would create orphaned clan state.
            await interaction.reply({
              embeds: [buildErrorEmbed('Cannot reset a clan leader. Transfer leadership or disband first.')],
              ephemeral: true
            });
            return;
          }

          clan.coLeaderIds = clan.coLeaderIds.filter((id) => id !== target.id);
          clan.memberIds = clan.memberIds.filter((id) => id !== target.id);
          await clan.save();

          const memberTarget = await guild.members.fetch(target.id).catch(() => null);
          if (memberTarget) {
            if (clan.roleId) {
              await memberTarget.roles.remove(clan.roleId).catch(() => null);
            }
            if (cfg.leaderRoleId) {
              await memberTarget.roles.remove(cfg.leaderRoleId).catch(() => null);
            }
            if (cfg.coLeaderRoleId) {
              await memberTarget.roles.remove(cfg.coLeaderRoleId).catch(() => null);
            }
          }
        }
      }

      const memberTarget = await guild.members.fetch(target.id).catch(() => null);
      if (memberTarget) {
        if (cfg.leaderRoleId) {
          await memberTarget.roles.remove(cfg.leaderRoleId).catch(() => null);
        }
        if (cfg.coLeaderRoleId) {
          await memberTarget.roles.remove(cfg.coLeaderRoleId).catch(() => null);
        }
      }

      targetDoc.clanId = null;
      targetDoc.role = null;
      targetDoc.pendingInviteClanId = null;
      targetDoc.invitedByUserId = null;
      await targetDoc.save();

      await logClanEvent(guild, `${interaction.user.tag} reset clan state for ${target.tag}.`);

      await interaction.reply({
        embeds: [buildSuccessEmbed('User Reset', `${target} has been reset from all clan state.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'force-disband') {
      const query = interaction.options.getString('clan', true);
      const cfg = await getOrCreateGuildConfig(guild.id);
      const clan = await resolveClanByNameOrTag(guild.id, query);

      if (!clan) {
        await interaction.reply({
          embeds: [buildErrorEmbed('No clan found with that name/tag.')],
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const allUserIds = [clan.leaderId, ...clan.coLeaderIds, ...clan.memberIds];
      await User.updateMany(
        { guildId: guild.id, userId: { $in: allUserIds } },
        {
          $set: {
            clanId: null,
            role: null,
            pendingInviteClanId: null,
            invitedByUserId: null
          }
        }
      );

      for (const targetId of allUserIds) {
        const guildMember = await guild.members.fetch(targetId).catch(() => null);
        if (!guildMember) continue;

        if (clan.roleId) {
          await guildMember.roles.remove(clan.roleId).catch(() => null);
        }
        if (cfg.leaderRoleId) {
          await guildMember.roles.remove(cfg.leaderRoleId).catch(() => null);
        }
        if (cfg.coLeaderRoleId) {
          await guildMember.roles.remove(cfg.coLeaderRoleId).catch(() => null);
        }
      }

      await deleteClanAssets(guild, clan);
      await Clan.deleteOne({ _id: clan._id });

      await logClanEvent(
        guild,
        `${interaction.user.tag} force-disbanded clan ${clanLabel(clan)}.`
      );

      await interaction.editReply({
        embeds: [buildSuccessEmbed('Force Disband Complete', `Deleted **${clanLabel(clan)}** and all assets.`)]
      });
      return;
    }

    await interaction.reply({
      embeds: [buildInfoEmbed('Unknown Subcommand', 'That admin action is not implemented yet.')],
      ephemeral: true
    });
  }
};
