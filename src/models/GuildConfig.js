const { createModel } = require('../utils/fileStore');

module.exports = createModel('guildConfigs', {
  clanMemberLimit: 8,
  logChannelId: null,
  clanChannelsCategoryId: null,
  clanLogsCategoryId: null,
  leaderRoleId: null,
  coLeaderRoleId: null
});
