# Rust Clan Manager Bot (Discord.js v14 + File Storage)

A fully functional Discord bot focused strictly on **Rust clan management**.

This bot provides:
- Slash-command clan creation and member management
- Automatic private clan category/text/voice channels
- Automatic clan role creation and cleanup
- Persistent clan and user state with local JSON files
- Admin controls for limits, force disband, user reset, and setup logging

No scrim systems, wipe timers, raid logs, or game stat tracking are included.

## Tech Stack

- Node.js (CommonJS)
- `discord.js` v14
- File-based JSON persistence

## Project Structure

```text
src/
	commands/
		clan.js
		clanadmin.js
	events/
		interactionCreate.js
		ready.js
	models/
		Clan.js
		GuildConfig.js
		User.js
	utils/
		clanAssets.js
		constants.js
		embeds.js
		logger.js
		permissions.js
	config.js
	index.js
```

## Setup Guide

### 1) Prerequisites

- Node.js 18+ (Node.js 20+ recommended)
- Discord bot application created in Discord Developer Portal

### 2) Create Bot + Required Privileged Scopes

In the Developer Portal:
- Create an application and bot
- Copy your bot token and application client ID
- Enable required bot permissions in your invite URL:
	- Manage Roles
	- Manage Channels
	- View Channels
	- Send Messages
	- Read Message History
	- Connect

OAuth2 scopes required:
- `bot`
- `applications.commands`

### 3) Install Dependencies

```bash
npm install
```

### 4) Configure Environment

Copy `.env.example` to `.env` and fill values:

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
```

Notes:
- `GUILD_ID` is optional. You can omit it entirely.
- Without `GUILD_ID`, commands register globally (can take time to propagate).

### 5) Start the Bot

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Slash Commands

### Clan Commands (`/clan`)

- `/clan create <name>` — Create a clan
- `/clan invite @user` — Invite a user
- `/clan accept` — Accept pending invite (or use DM button)
- `/clan leave` — Leave your clan (Leader cannot leave directly)
- `/clan kick @user` — Kick member
- `/clan promote @user` — Promote member to Co-Leader
- `/clan demote @user` — Demote Co-Leader to member
- `/clan transfer @user` — Transfer leadership
- `/clan disband` — Delete clan (Leader only)
- `/clan info` — View clan info embed
- `/clan color <hex>` — Set clan role color (Leader only)
- `/clan set bounty <tag> <number>` — Set clan bounty label on text channel (Admin only)
- `/clan invisible <tag>` — Hide clan text channel from public (Admin only)
- `/clan visible <tag>` — Make clan text channel visible to public (Admin only)
- `/clan embed` — Post public clan help embed (Admin only)
- `/clan help` — Show command help embed

### Admin Commands (`/clanadmin`)

Administrator permission required.

- `/clanadmin setlimit <number>` — Set clan member limit
- `/clanadmin force-disband <clan>` — Force delete a clan by name or tag
- `/clanadmin reset-user @user` — Reset a user's clan state
- `/clanadmin setup` — Create/setup `Clan Channels`, `Clan Channel Logs`, and `clan-channel-logs`

## Permission System

- **Leader**
	- Full control of clan actions
	- Required for disband, promote/demote, and transfer
- **Co-Leader**
	- Can invite users
	- Can kick regular members
- **Member**
	- Basic membership access

Users are prevented from joining multiple clans at the same time.

Invited users receive a DM with:
- Green **Accept** button
- Red **Decline** button

## Auto Clan Asset Management

When a clan is created:
- Private clan text channel is created in `Clan Channels`
- Clan role is created and assigned

Clan invites are delivered via DM with buttons:
- Green **Accept**
- Red **Decline**

When a clan is disbanded (normal or forced):
- Clan text/voice/category channels are deleted
- Clan role is deleted
- User membership records are reset

## Data Models

- `Clan`
	- Core clan identity, hierarchy, and Discord asset IDs
- `User`
	- Per-guild clan membership and pending invite state
- `GuildConfig`
	- Per-guild clan limit and log channel configuration

Data is stored on disk in `data/*.json` files.

## Operational Notes

- The bot expects sufficient role/channel permissions in the Discord server.
- If permissions are missing, command responses still fail gracefully and log errors in console.
- All command handlers include structured error handling and Rust-themed embeds.

## License

ISC