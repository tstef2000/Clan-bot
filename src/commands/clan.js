const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType
} = require('discord.js');
const Clan = require('../models/Clan');
const User = require('../models/User');
const GuildConfig = require('../models/GuildConfig');
const { createClanAssets, deleteClanAssets } = require('../utils/clanAssets');
const {
  buildSuccessEmbed,
  buildErrorEmbed,
  buildInfoEmbed
} = require('../utils/embeds');
const { isLeader, isCoLeader, getClanUser } = require('../utils/permissions');
const { logClanEvent } = require('../utils/logger');
const { CYAN_PRIMARY } = require('../utils/constants');

async function getOrCreateGuildConfig(guildId) {
  let cfg = await GuildConfig.findOne({ guildId });
  if (!cfg) {
    cfg = await GuildConfig.create({ guildId });
  }
  return cfg;
}

async function getOrCreateUser(guildId, userId) {
  let user = await User.findOne({ guildId, userId });
  if (!user) {
    user = await User.create({ guildId, userId });
  }
  return user;
}

function memberCount(clan) {
  // Count = leader + all co-leaders + all members.
  return 1 + clan.coLeaderIds.length + clan.memberIds.length;
}

function clanLabel(clan) {
  return clan.name;
}

function formatClanTextChannelName(clanName, bounty = 0) {
  const base = clanName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  if (bounty > 0) {
    return `${base}-💰${bounty}`.slice(0, 100);
  }

  return base;
}

function parseHexColor(hexInput) {
  const normalized = hexInput.trim();
  const cleaned = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  return `#${cleaned.toUpperCase()}`;
}

function getTagSeed(clanName) {
  const cleaned = clanName.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return 'CLAN';
  return cleaned.slice(0, 6);
}

async function generateUniqueClanTag(guildId, clanName) {
  const base = getTagSeed(clanName);

  for (let idx = 0; idx <= 999; idx += 1) {
    const suffix = idx === 0 ? '' : String(idx);
    const maxBaseLen = Math.max(1, 8 - suffix.length);
    const candidate = `${base.slice(0, maxBaseLen)}${suffix}`.slice(0, 8);
    const existing = await Clan.findOne({ guildId, tag: candidate });
    if (!existing) {
      return candidate;
    }
  }

  // Very unlikely fallback.
  return `CL${Date.now().toString().slice(-6)}`;
}

function buildClanHelpEmbed({ isPublic = false } = {}) {
  const embed = new EmbedBuilder()
    .setColor(CYAN_PRIMARY)
    .setTitle('🛡️ Rust Clan Commands')
    .setDescription('Use these slash commands to manage clans quickly and cleanly.')
    .addFields(
      {
        name: 'Core',
        value:
          '• `/clan create <name>`\n• `/clan invite @user`\n• `/clan accept`\n• `/clan leave`\n• `/clan info`\n• `/clan help`'
      },
      {
        name: 'Leadership',
        value:
          '• `/clan kick @user`\n• `/clan promote @user`\n• `/clan demote @user`\n• `/clan transfer @user`\n• `/clan disband`\n• `/clan color <hex>`'
      },
      {
        name: 'Admin Tools',
        value:
          '• `/clan set bounty <tag> <number>`\n• `/clan invisible <tag>`\n• `/clan visible <tag>`\n• `/clan embed`\n• `/clanadmin setup`\n• `/clanadmin setlimit <number>`'
      }
    )
    .setFooter({ text: 'Made By Trident Studios' })
    .setTimestamp();

  if (isPublic) {
    embed.setDescription('Clan command panel for all members.');
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('Rust clan management commands')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a new clan')
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('Clan name')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(32)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('invite')
        .setDescription('Invite a user to your clan')
        .addUserOption((opt) => opt.setName('user').setDescription('User to invite').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('accept').setDescription('Accept your pending clan invite'))
    .addSubcommand((sub) => sub.setName('leave').setDescription('Leave your current clan'))
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Kick a user from your clan')
        .addUserOption((opt) => opt.setName('user').setDescription('User to kick').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('promote')
        .setDescription('Promote a member to Co-Leader')
        .addUserOption((opt) => opt.setName('user').setDescription('User to promote').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('demote')
        .setDescription('Demote a Co-Leader to member')
        .addUserOption((opt) => opt.setName('user').setDescription('User to demote').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('transfer')
        .setDescription('Transfer leadership to another clan member')
        .addUserOption((opt) => opt.setName('user').setDescription('New leader').setRequired(true))
    )
    .addSubcommand((sub) => sub.setName('disband').setDescription('Disband your clan (Leader only)'))
    .addSubcommand((sub) => sub.setName('info').setDescription('Display information about your current clan'))
    .addSubcommand((sub) =>
      sub
        .setName('color')
        .setDescription('Set your clan role color (Leader only)')
        .addStringOption((opt) =>
          opt
            .setName('hex')
            .setDescription('Hex color code, example: #FF6600')
            .setRequired(true)
            .setMaxLength(7)
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('set')
        .setDescription('Clan admin set operations')
        .addSubcommand((sub) =>
          sub
            .setName('bounty')
            .setDescription('Set bounty number on the clan text channel (Admin only)')
            .addStringOption((opt) =>
              opt
                .setName('tag')
                .setDescription('Clan tag to update')
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(8)
            )
            .addIntegerOption((opt) =>
              opt
                .setName('number')
                .setDescription('Bounty value')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(1000000000)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('invisible')
        .setDescription('Hide clan text channel from public (Admin only)')
        .addStringOption((opt) =>
          opt
            .setName('tag')
            .setDescription('Clan tag to update')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(8)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('visible')
        .setDescription('Show clan text channel to public (Admin only)')
        .addStringOption((opt) =>
          opt
            .setName('tag')
            .setDescription('Clan tag to update')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(8)
        )
    )
    .addSubcommand((sub) => sub.setName('help').setDescription('Show clan command help'))
    .addSubcommand((sub) => sub.setName('embed').setDescription('Post public clan command embed (Admin only)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const subGroup = interaction.options.getSubcommandGroup(false);
    const { guild, member, user } = interaction;

    if (!guild || !member) {
      await interaction.reply({
        embeds: [buildErrorEmbed('This command can only be used in a server.')],
        ephemeral: true
      });
      return;
    }

    // Early ensure this user has a stored document.
    const actorUserDoc = await getOrCreateUser(guild.id, user.id);

    if (sub === 'create') {
      const name = interaction.options.getString('name', true).trim();
      const cfg = await getOrCreateGuildConfig(guild.id);

      if (actorUserDoc.clanId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You are already in a clan. Leave it before creating a new one.')],
          ephemeral: true
        });
        return;
      }

      const existing = await Clan.findOne({
        guildId: guild.id,
        name
      });

      if (existing) {
        await interaction.reply({
          embeds: [buildErrorEmbed('A clan with that name already exists.')],
          ephemeral: true
        });
        return;
      }

      if (!cfg.clanChannelsCategoryId || !cfg.leaderRoleId || !cfg.coLeaderRoleId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Clan system is not fully configured yet. Run **/clanadmin setup** first.')],
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const tag = await generateUniqueClanTag(guild.id, name);

      const assets = await createClanAssets(guild, name, {
        clanChannelsCategoryId: cfg.clanChannelsCategoryId
      });
      const clan = await Clan.create({
        guildId: guild.id,
        name,
        tag,
        bounty: 0,
        leaderId: user.id,
        coLeaderIds: [],
        memberIds: [],
        ...assets
      });

      actorUserDoc.clanId = clan._id;
      actorUserDoc.role = 'leader';
      actorUserDoc.pendingInviteClanId = null;
      actorUserDoc.invitedByUserId = null;
      await actorUserDoc.save();

      await member.roles.add(clan.roleId).catch(() => null);
      if (cfg.leaderRoleId) {
        await member.roles.add(cfg.leaderRoleId).catch(() => null);
      }

      await logClanEvent(guild, `${interaction.user.tag} created clan ${clanLabel(clan)}.`);

      await interaction.editReply({
        embeds: [
          buildSuccessEmbed(
            'Clan Created',
            `Your clan **${clanLabel(clan)}** is now active with private channels and role.\nTag: **${tag}**`
          )
        ]
      });
      return;
    }

    if (sub === 'help') {
      await interaction.reply({ embeds: [buildClanHelpEmbed()], ephemeral: true });
      return;
    }

    if (sub === 'embed') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Administrator permission is required for this command.')],
          ephemeral: true
        });
        return;
      }

      await interaction.channel.send({ embeds: [buildClanHelpEmbed({ isPublic: true })] });

      await interaction.reply({
        embeds: [buildSuccessEmbed('Embed Posted', 'Public clan command embed posted to this channel.')],
        ephemeral: true
      });
      return;
    }

    if (sub === 'accept') {
      if (actorUserDoc.clanId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You are already in a clan.')],
          ephemeral: true
        });
        return;
      }

      if (!actorUserDoc.pendingInviteClanId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You do not have a pending clan invite.')],
          ephemeral: true
        });
        return;
      }

      const clan = await Clan.findById(actorUserDoc.pendingInviteClanId);
      if (!clan) {
        actorUserDoc.pendingInviteClanId = null;
        actorUserDoc.invitedByUserId = null;
        await actorUserDoc.save();
        await interaction.reply({
          embeds: [buildErrorEmbed('Your invite expired because that clan no longer exists.')],
          ephemeral: true
        });
        return;
      }

      const cfg = await getOrCreateGuildConfig(guild.id);
      if (memberCount(clan) >= cfg.clanMemberLimit) {
        await interaction.reply({
          embeds: [buildErrorEmbed(`This clan is full. Current limit is ${cfg.clanMemberLimit}.`)],
          ephemeral: true
        });
        return;
      }

      if (!clan.memberIds.includes(user.id) && user.id !== clan.leaderId && !clan.coLeaderIds.includes(user.id)) {
        clan.memberIds.push(user.id);
        await clan.save();
      }

      actorUserDoc.clanId = clan._id;
      actorUserDoc.role = 'member';
      actorUserDoc.pendingInviteClanId = null;
      actorUserDoc.invitedByUserId = null;
      await actorUserDoc.save();

      await member.roles.add(clan.roleId).catch(() => null);

      await logClanEvent(guild, `${interaction.user.tag} joined clan ${clanLabel(clan)}.`);

      await interaction.reply({
        embeds: [buildSuccessEmbed('Invite Accepted', `You joined **${clanLabel(clan)}**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'info') {
      if (!actorUserDoc.clanId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You are not currently in a clan.')],
          ephemeral: true
        });
        return;
      }

      const clan = await Clan.findById(actorUserDoc.clanId);
      if (!clan) {
        actorUserDoc.clanId = null;
        actorUserDoc.role = null;
        await actorUserDoc.save();
        await interaction.reply({
          embeds: [buildErrorEmbed('Your clan record no longer exists. Your profile was reset.')],
          ephemeral: true
        });
        return;
      }

      const leader = await guild.members.fetch(clan.leaderId).catch(() => null);
      const coLeaderMentions = clan.coLeaderIds.map((id) => `<@${id}>`);
      const memberMentions = clan.memberIds.map((id) => `<@${id}>`);

      const embed = new EmbedBuilder()
        .setColor(CYAN_PRIMARY)
        .setTitle(clanLabel(clan))
        .setDescription('Clan intelligence and roster details')
        .addFields(
          {
            name: 'Tag',
            value: clan.tag ? `\`${clan.tag}\`` : 'None',
            inline: true
          },
          {
            name: 'Leader',
            value: leader ? `<@${leader.id}>` : `Unknown (${clan.leaderId})`
          },
          {
            name: 'Co-Leaders',
            value: coLeaderMentions.length > 0 ? coLeaderMentions.join('\n') : 'None'
          },
          {
            name: 'Members',
            value: memberMentions.length > 0 ? memberMentions.join('\n') : 'None'
          },
          {
            name: 'Total Size',
            value: `${memberCount(clan)} members`,
            inline: true
          },
          {
            name: 'Created',
            value: `<t:${Math.floor(clan.createdAt.getTime() / 1000)}:F>`,
            inline: true
          }
        )
        .setFooter({ text: 'Made By Trident Studios' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (subGroup === 'set' && sub === 'bounty') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Administrator permission is required for this command.')],
          ephemeral: true
        });
        return;
      }

      const tagInput = interaction.options.getString('tag', true).trim().toUpperCase();
      const adminClan = await Clan.findOne({ guildId: guild.id, tag: tagInput });
      if (!adminClan) {
        await interaction.reply({
          embeds: [buildErrorEmbed(`No clan found with tag **${tagInput}**.`)],
          ephemeral: true
        });
        return;
      }

      const bounty = interaction.options.getInteger('number', true);
      adminClan.bounty = bounty;
      await adminClan.save();

      const textChannel = guild.channels.cache.get(adminClan.textChannelId) || (await guild.channels.fetch(adminClan.textChannelId).catch(() => null));
      if (textChannel && textChannel.type === ChannelType.GuildText) {
        const newName = formatClanTextChannelName(adminClan.name, bounty);
        if (textChannel.name !== newName) {
          await textChannel.setName(newName, `Clan bounty updated by ${interaction.user.tag}`);
        }
      }

      await logClanEvent(guild, `${interaction.user.tag} set bounty ${bounty} for clan ${clanLabel(adminClan)} [${adminClan.tag}].`);

      await interaction.reply({
        embeds: [buildSuccessEmbed('Bounty Updated', `Bounty set to **💰${bounty}** for **${clanLabel(adminClan)}** (Tag: **${adminClan.tag}**).`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'invisible' || sub === 'visible') {
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Administrator permission is required for this command.')],
          ephemeral: true
        });
        return;
      }

      const tagInput = interaction.options.getString('tag', true).trim().toUpperCase();
      const adminClan = await Clan.findOne({ guildId: guild.id, tag: tagInput });
      if (!adminClan) {
        await interaction.reply({
          embeds: [buildErrorEmbed(`No clan found with tag **${tagInput}**.`)],
          ephemeral: true
        });
        return;
      }

      const textChannel = guild.channels.cache.get(adminClan.textChannelId) || (await guild.channels.fetch(adminClan.textChannelId).catch(() => null));
      if (!textChannel || textChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Clan text channel was not found.')],
          ephemeral: true
        });
        return;
      }

      const everyoneRoleId = guild.roles.everyone.id;

      if (sub === 'invisible') {
        await textChannel.permissionOverwrites.edit(everyoneRoleId, {
          ViewChannel: false,
          SendMessages: false
        });

        await logClanEvent(guild, `${interaction.user.tag} hid clan channel for ${clanLabel(adminClan)} [${adminClan.tag}] from public.`);

        await interaction.reply({
          embeds: [buildSuccessEmbed('Channel Hidden', `**${textChannel.name}** is now hidden from public view.`)],
          ephemeral: true
        });
      } else {
        await textChannel.permissionOverwrites.edit(everyoneRoleId, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false
        });

        await logClanEvent(guild, `${interaction.user.tag} made clan channel for ${clanLabel(adminClan)} [${adminClan.tag}] visible to public.`);

        await interaction.reply({
          embeds: [buildSuccessEmbed('Channel Visible', `**${textChannel.name}** is now visible to everyone.`)],
          ephemeral: true
        });
      }

      return;
    }

    // From this point, most subcommands require active clan membership.
    if (!actorUserDoc.clanId) {
      await interaction.reply({
        embeds: [buildErrorEmbed('You are not currently in a clan.')],
        ephemeral: true
      });
      return;
    }

    const clan = await Clan.findById(actorUserDoc.clanId);
    if (!clan) {
      actorUserDoc.clanId = null;
      actorUserDoc.role = null;
      await actorUserDoc.save();
      await interaction.reply({
        embeds: [buildErrorEmbed('Your clan record no longer exists. Your profile was reset.')],
        ephemeral: true
      });
      return;
    }

    const guildConfig = await getOrCreateGuildConfig(guild.id);

    // Optional cache for role checks by helper methods.
    const actorClanRoleDoc = await getClanUser(guild.id, user.id);

    if (sub === 'invite') {
      if (!isLeader(actorClanRoleDoc) && !isCoLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader or Co-Leader can invite users.')],
          ephemeral: true
        });
        return;
      }

      const target = interaction.options.getUser('user', true);
      if (target.bot || target.id === user.id) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You must invite a valid non-bot user.')],
          ephemeral: true
        });
        return;
      }

      const targetDoc = await getOrCreateUser(guild.id, target.id);
      if (targetDoc.clanId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('That user is already in a clan.')],
          ephemeral: true
        });
        return;
      }

      if (memberCount(clan) >= guildConfig.clanMemberLimit) {
        await interaction.reply({
          embeds: [buildErrorEmbed(`Your clan is full. Current limit is ${guildConfig.clanMemberLimit}.`)],
          ephemeral: true
        });
        return;
      }

      targetDoc.pendingInviteClanId = clan._id;
      targetDoc.invitedByUserId = user.id;
      await targetDoc.save();

      const acceptButtonId = `claninvite:accept:${guild.id}:${clan._id}`;
      const declineButtonId = `claninvite:decline:${guild.id}:${clan._id}`;

      const inviteActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(acceptButtonId)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(declineButtonId)
          .setLabel('Decline')
          .setStyle(ButtonStyle.Danger)
      );

      let dmSent = true;
      try {
        await target.send({
          embeds: [
            buildInfoEmbed(
              'Clan Invitation',
              `You were invited to join **${clanLabel(clan)}** by ${interaction.user}.`
            )
          ],
          components: [inviteActionRow]
        });
      } catch {
        dmSent = false;
      }

      await logClanEvent(
        guild,
        `${interaction.user.tag} invited ${target.tag} to clan ${clanLabel(clan)}.`
      );

      await interaction.reply({
        embeds: [
          buildSuccessEmbed(
            'Invite Sent',
            dmSent
              ? `${target} has been invited to **${clanLabel(clan)}**. They received a DM with Accept/Decline buttons.`
              : `${target} has been invited to **${clanLabel(clan)}**, but I could not DM them. They can still use **/clan accept**.`
          )
        ],
        ephemeral: true
      });
      return;
    }

    if (sub === 'color') {
      if (!isLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader can change clan role color.')],
          ephemeral: true
        });
        return;
      }

      const hexInput = interaction.options.getString('hex', true);
      const parsedHex = parseHexColor(hexInput);
      if (!parsedHex) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Invalid hex code. Use format like `#FF6600`.')],
          ephemeral: true
        });
        return;
      }

      const role = guild.roles.cache.get(clan.roleId) || (await guild.roles.fetch(clan.roleId).catch(() => null));
      if (!role) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Clan role was not found.')],
          ephemeral: true
        });
        return;
      }

      await role.setColor(parsedHex, `Clan color changed by ${interaction.user.tag}`);

      await logClanEvent(guild, `${interaction.user.tag} changed clan role color for ${clanLabel(clan)} to ${parsedHex}.`);

      await interaction.reply({
        embeds: [buildSuccessEmbed('Color Updated', `Clan role color set to **${parsedHex}**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'leave') {
      if (isLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Leader cannot leave directly. Transfer leadership or disband the clan.')],
          ephemeral: true
        });
        return;
      }

      clan.coLeaderIds = clan.coLeaderIds.filter((id) => id !== user.id);
      clan.memberIds = clan.memberIds.filter((id) => id !== user.id);
      await clan.save();

      actorUserDoc.clanId = null;
      actorUserDoc.role = null;
      actorUserDoc.pendingInviteClanId = null;
      actorUserDoc.invitedByUserId = null;
      await actorUserDoc.save();

      await member.roles.remove(clan.roleId).catch(() => null);
      if (guildConfig.coLeaderRoleId) {
        await member.roles.remove(guildConfig.coLeaderRoleId).catch(() => null);
      }

      const clanTextChannel = guild.channels.cache.get(clan.textChannelId) || (await guild.channels.fetch(clan.textChannelId).catch(() => null));
      if (clanTextChannel && clanTextChannel.isTextBased()) {
        await clanTextChannel.send({
          embeds: [buildInfoEmbed('Member Left', `${interaction.user} left **${clanLabel(clan)}**.`)]
        }).catch(() => null);
      }

      await logClanEvent(guild, `${interaction.user.tag} left clan ${clanLabel(clan)}.`);

      await interaction.reply({
        embeds: [buildSuccessEmbed('Clan Left', `You left **${clanLabel(clan)}**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'kick') {
      const target = interaction.options.getUser('user', true);
      if (target.id === user.id) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You cannot kick yourself.')],
          ephemeral: true
        });
        return;
      }

      const targetDoc = await User.findOne({ guildId: guild.id, userId: target.id });
      if (!targetDoc?.clanId || String(targetDoc.clanId) !== String(clan._id)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('That user is not in your clan.')],
          ephemeral: true
        });
        return;
      }

      // Leader can kick anyone except self.
      // Co-Leader can only kick members (not Leader/Co-Leader).
      if (isLeader(actorClanRoleDoc)) {
        // allowed
      } else if (isCoLeader(actorClanRoleDoc)) {
        if (targetDoc.role !== 'member') {
          await interaction.reply({
            embeds: [buildErrorEmbed('Co-Leader can only kick regular members.')],
            ephemeral: true
          });
          return;
        }
      } else {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader or Co-Leader can kick members.')],
          ephemeral: true
        });
        return;
      }

      if (targetDoc.role === 'leader') {
        await interaction.reply({
          embeds: [buildErrorEmbed('Leader cannot be kicked.')],
          ephemeral: true
        });
        return;
      }

      clan.coLeaderIds = clan.coLeaderIds.filter((id) => id !== target.id);
      clan.memberIds = clan.memberIds.filter((id) => id !== target.id);
      await clan.save();

      targetDoc.clanId = null;
      targetDoc.role = null;
      targetDoc.pendingInviteClanId = null;
      targetDoc.invitedByUserId = null;
      await targetDoc.save();

      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (targetMember) {
        await targetMember.roles.remove(clan.roleId).catch(() => null);
        if (guildConfig.leaderRoleId) {
          await targetMember.roles.remove(guildConfig.leaderRoleId).catch(() => null);
        }
        if (guildConfig.coLeaderRoleId) {
          await targetMember.roles.remove(guildConfig.coLeaderRoleId).catch(() => null);
        }
      }

      await logClanEvent(
        guild,
        `${interaction.user.tag} kicked ${target.tag} from clan ${clanLabel(clan)}.`
      );

      await interaction.reply({
        embeds: [buildSuccessEmbed('Member Kicked', `${target} was removed from **${clanLabel(clan)}**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'promote') {
      if (!isLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader can promote members.')],
          ephemeral: true
        });
        return;
      }

      const target = interaction.options.getUser('user', true);
      const targetDoc = await User.findOne({ guildId: guild.id, userId: target.id });
      if (!targetDoc?.clanId || String(targetDoc.clanId) !== String(clan._id)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('That user is not in your clan.')],
          ephemeral: true
        });
        return;
      }

      if (targetDoc.role !== 'member') {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only a regular member can be promoted.')],
          ephemeral: true
        });
        return;
      }

      targetDoc.role = 'co-leader';
      await targetDoc.save();

      clan.memberIds = clan.memberIds.filter((id) => id !== target.id);
      if (!clan.coLeaderIds.includes(target.id)) clan.coLeaderIds.push(target.id);
      await clan.save();

      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (targetMember && guildConfig.coLeaderRoleId) {
        await targetMember.roles.add(guildConfig.coLeaderRoleId).catch(() => null);
      }

      await logClanEvent(
        guild,
        `${interaction.user.tag} promoted ${target.tag} to Co-Leader in ${clanLabel(clan)}.`
      );

      await interaction.reply({
        embeds: [buildSuccessEmbed('Promotion Complete', `${target} is now a **Co-Leader**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'demote') {
      if (!isLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader can demote co-leaders.')],
          ephemeral: true
        });
        return;
      }

      const target = interaction.options.getUser('user', true);
      const targetDoc = await User.findOne({ guildId: guild.id, userId: target.id });
      if (!targetDoc?.clanId || String(targetDoc.clanId) !== String(clan._id)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('That user is not in your clan.')],
          ephemeral: true
        });
        return;
      }

      if (targetDoc.role !== 'co-leader') {
        await interaction.reply({
          embeds: [buildErrorEmbed('That user is not a Co-Leader.')],
          ephemeral: true
        });
        return;
      }

      targetDoc.role = 'member';
      await targetDoc.save();

      clan.coLeaderIds = clan.coLeaderIds.filter((id) => id !== target.id);
      if (!clan.memberIds.includes(target.id)) clan.memberIds.push(target.id);
      await clan.save();

      const targetMember = await guild.members.fetch(target.id).catch(() => null);
      if (targetMember && guildConfig.coLeaderRoleId) {
        await targetMember.roles.remove(guildConfig.coLeaderRoleId).catch(() => null);
      }

      await logClanEvent(
        guild,
        `${interaction.user.tag} demoted ${target.tag} to Member in ${clanLabel(clan)}.`
      );

      await interaction.reply({
        embeds: [buildSuccessEmbed('Demotion Complete', `${target} is now a **Member**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'transfer') {
      if (!isLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader can transfer leadership.')],
          ephemeral: true
        });
        return;
      }

      const target = interaction.options.getUser('user', true);
      if (target.id === user.id) {
        await interaction.reply({
          embeds: [buildErrorEmbed('You are already the leader.')],
          ephemeral: true
        });
        return;
      }

      const targetDoc = await User.findOne({ guildId: guild.id, userId: target.id });
      if (!targetDoc?.clanId || String(targetDoc.clanId) !== String(clan._id)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('That user must already be in your clan.')],
          ephemeral: true
        });
        return;
      }

      // Demote old leader to Co-Leader for smooth handoff.
      actorUserDoc.role = 'co-leader';
      await actorUserDoc.save();

      targetDoc.role = 'leader';
      await targetDoc.save();

      clan.leaderId = target.id;
      clan.coLeaderIds = clan.coLeaderIds.filter((id) => id !== target.id);
      if (!clan.coLeaderIds.includes(user.id)) clan.coLeaderIds.push(user.id);
      clan.memberIds = clan.memberIds.filter((id) => id !== target.id && id !== user.id);
      await clan.save();

      const oldLeaderMember = await guild.members.fetch(user.id).catch(() => null);
      if (oldLeaderMember) {
        if (guildConfig.leaderRoleId) {
          await oldLeaderMember.roles.remove(guildConfig.leaderRoleId).catch(() => null);
        }
        if (guildConfig.coLeaderRoleId) {
          await oldLeaderMember.roles.add(guildConfig.coLeaderRoleId).catch(() => null);
        }
      }

      const newLeaderMember = await guild.members.fetch(target.id).catch(() => null);
      if (newLeaderMember) {
        if (guildConfig.coLeaderRoleId) {
          await newLeaderMember.roles.remove(guildConfig.coLeaderRoleId).catch(() => null);
        }
        if (guildConfig.leaderRoleId) {
          await newLeaderMember.roles.add(guildConfig.leaderRoleId).catch(() => null);
        }
      }

      await logClanEvent(
        guild,
        `${interaction.user.tag} transferred clan leadership to ${target.tag} in ${clanLabel(clan)}.`
      );

      await interaction.reply({
        embeds: [buildSuccessEmbed('Leadership Transferred', `${target} is now the **Leader**.`)],
        ephemeral: true
      });
      return;
    }

    if (sub === 'disband') {
      if (!isLeader(actorClanRoleDoc)) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Only Leader can disband the clan.')],
          ephemeral: true
        });
        return;
      }

      if (!guildConfig.logChannelId) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Disband approval is not configured. Run **/clanadmin setup** first.')],
          ephemeral: true
        });
        return;
      }

      if (clan.pendingDisbandRequestedBy) {
        await interaction.reply({
          embeds: [buildErrorEmbed('A disband request is already pending admin approval.')],
          ephemeral: true
        });
        return;
      }

      const logChannel = guild.channels.cache.get(guildConfig.logChannelId) || (await guild.channels.fetch(guildConfig.logChannelId).catch(() => null));
      if (!logChannel || !logChannel.isTextBased()) {
        await interaction.reply({
          embeds: [buildErrorEmbed('Configured log channel was not found. Run **/clanadmin setup** again.')],
          ephemeral: true
        });
        return;
      }

      const approveId = `clandisband:approve:${guild.id}:${clan._id}`;
      const denyId = `clandisband:deny:${guild.id}:${clan._id}`;

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(approveId).setLabel('Approve Disband').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(denyId).setLabel('Deny Disband').setStyle(ButtonStyle.Danger)
      );

      const approvalEmbed = buildInfoEmbed(
        'Clan Disband Approval Request',
        `Leader ${interaction.user} requested disband for **${clanLabel(clan)}**.`
      ).addFields(
        { name: 'Clan', value: clanLabel(clan), inline: true },
        { name: 'Leader', value: `<@${clan.leaderId}>`, inline: true },
        { name: 'Requested', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
      );

      clan.pendingDisbandRequestedBy = interaction.user.id;
      clan.pendingDisbandRequestedAt = new Date().toISOString();
      await clan.save();

      await logChannel.send({ embeds: [approvalEmbed], components: [actionRow] });

      await logClanEvent(guild, `${interaction.user.tag} submitted disband request for clan ${clanLabel(clan)}.`);

      await interaction.reply({
        embeds: [buildSuccessEmbed('Request Submitted', 'Your clan disband request has been sent for admin approval.')],
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      embeds: [buildInfoEmbed('Unknown Subcommand', 'That clan action is not implemented yet.')],
      ephemeral: true
    });
  }
};
