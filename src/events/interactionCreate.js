const { Events, PermissionFlagsBits } = require('discord.js');
const Clan = require('../models/Clan');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');
const { buildErrorEmbed, buildSuccessEmbed, buildInfoEmbed } = require('../utils/embeds');
const { logClanEvent } = require('../utils/logger');
const { deleteClanAssets } = require('../utils/clanAssets');

function memberCount(clan) {
  return 1 + clan.coLeaderIds.length + clan.memberIds.length;
}

function clanLabel(clan) {
  return clan.name;
}

async function handleDisbandApprovalButton(interaction, client) {
  const parts = interaction.customId.split(':');
  if (parts.length !== 4 || parts[0] !== 'clandisband') return false;

  const action = parts[1];
  const guildId = parts[2];
  const clanId = parts[3];

  if (!interaction.guild || interaction.guild.id !== guildId) {
    await interaction.reply({
      embeds: [buildErrorEmbed('This disband request can only be handled in its original server.')],
      ephemeral: true
    });
    return true;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Only administrators can approve or deny disband requests.')],
      ephemeral: true
    });
    return true;
  }

  const clan = await Clan.findOne({ _id: clanId, guildId });
  if (!clan || !clan.pendingDisbandRequestedBy) {
    await interaction.update({
      embeds: [buildErrorEmbed('This disband request is no longer active.')],
      components: []
    });
    return true;
  }

  if (action === 'deny') {
    clan.pendingDisbandRequestedBy = null;
    clan.pendingDisbandRequestedAt = null;
    await clan.save();

    await logClanEvent(interaction.guild, `${interaction.user.tag} denied disband request for clan ${clanLabel(clan)}.`);

    await interaction.update({
      embeds: [
        buildInfoEmbed(
          'Disband Request Denied',
          `Admin ${interaction.user} denied disband request for **${clanLabel(clan)}**.`
        )
      ],
      components: []
    });
    return true;
  }

  if (action !== 'approve') return false;

  const cfg = await GuildConfig.findOne({ guildId });
  const allUserIds = [clan.leaderId, ...clan.coLeaderIds, ...clan.memberIds];

  await User.updateMany(
    { guildId, userId: { $in: allUserIds } },
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
    const guildMember = await interaction.guild.members.fetch(targetId).catch(() => null);
    if (!guildMember) continue;

    if (clan.roleId) {
      await guildMember.roles.remove(clan.roleId).catch(() => null);
    }
    if (cfg?.leaderRoleId) {
      await guildMember.roles.remove(cfg.leaderRoleId).catch(() => null);
    }
    if (cfg?.coLeaderRoleId) {
      await guildMember.roles.remove(cfg.coLeaderRoleId).catch(() => null);
    }
  }

  await deleteClanAssets(interaction.guild, clan);
  await Clan.deleteOne({ _id: clan._id });

  await logClanEvent(interaction.guild, `${interaction.user.tag} approved disband and deleted clan ${clanLabel(clan)}.`);

  await interaction.update({
    embeds: [
      buildSuccessEmbed(
        'Disband Approved',
        `Admin ${interaction.user} approved disband. **${clanLabel(clan)}** has been deleted.`
      )
    ],
    components: []
  });

  return true;
}

async function handleInviteButton(interaction, client) {
  const parts = interaction.customId.split(':');
  if (parts.length !== 4 || parts[0] !== 'claninvite') return false;

  const action = parts[1];
  const guildId = parts[2];
  const clanId = parts[3];

  const userDoc = await User.findOne({ guildId, userId: interaction.user.id });
  if (!userDoc || !userDoc.pendingInviteClanId || String(userDoc.pendingInviteClanId) !== clanId) {
    await interaction.update({
      embeds: [buildErrorEmbed('This clan invite is no longer valid.')],
      components: []
    });
    return true;
  }

  if (action === 'decline') {
    userDoc.pendingInviteClanId = null;
    userDoc.invitedByUserId = null;
    await userDoc.save();

    await interaction.update({
      embeds: [buildInfoEmbed('Invite Declined', 'You declined the clan invite.')],
      components: []
    });
    return true;
  }

  if (action !== 'accept') return false;

  if (userDoc.clanId) {
    await interaction.update({
      embeds: [buildErrorEmbed('You are already in a clan. This invite is no longer usable.')],
      components: []
    });
    return true;
  }

  const clan = await Clan.findOne({ _id: clanId, guildId });
  if (!clan) {
    userDoc.pendingInviteClanId = null;
    userDoc.invitedByUserId = null;
    await userDoc.save();

    await interaction.update({
      embeds: [buildErrorEmbed('That clan no longer exists. Invite expired.')],
      components: []
    });
    return true;
  }

  let cfg = await GuildConfig.findOne({ guildId });
  if (!cfg) cfg = await GuildConfig.create({ guildId });

  if (memberCount(clan) >= cfg.clanMemberLimit) {
    await interaction.update({
      embeds: [buildErrorEmbed(`That clan is full. Current limit is ${cfg.clanMemberLimit}.`)],
      components: []
    });
    return true;
  }

  if (!clan.memberIds.includes(interaction.user.id) && interaction.user.id !== clan.leaderId && !clan.coLeaderIds.includes(interaction.user.id)) {
    clan.memberIds.push(interaction.user.id);
    await clan.save();
  }

  userDoc.clanId = clan._id;
  userDoc.role = 'member';
  userDoc.pendingInviteClanId = null;
  userDoc.invitedByUserId = null;
  await userDoc.save();

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (guild) {
    const guildMember = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (guildMember && clan.roleId) {
      await guildMember.roles.add(clan.roleId).catch(() => null);
    }

    const clanTextChannel = guild.channels.cache.get(clan.textChannelId) || (await guild.channels.fetch(clan.textChannelId).catch(() => null));
    if (clanTextChannel && clanTextChannel.isTextBased()) {
      await clanTextChannel.send({
        embeds: [
          buildSuccessEmbed('Member Joined', `${interaction.user} joined **${clanLabel(clan)}**.`)
        ]
      }).catch(() => null);
    }

    await logClanEvent(guild, `${interaction.user.tag} joined clan ${clanLabel(clan)} via DM invite.`);
  }

  await interaction.update({
    embeds: [buildSuccessEmbed('Invite Accepted', `You accepted the invite and joined **${clanLabel(clan)}**.`)],
    components: []
  });

  return true;
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.isButton()) {
      const disbandHandled = await handleDisbandApprovalButton(interaction, client);
      if (disbandHandled) return;

      const handled = await handleInviteButton(interaction, client);
      if (handled) return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error('Command execution error:', error);

      const payload = {
        embeds: [
          buildErrorEmbed(
            'Something went wrong while executing that command. Please try again.'
          )
        ],
        ephemeral: true
      };

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch (responseError) {
        console.error('Failed to send interaction error response:', responseError);
      }
    }
  }
};
