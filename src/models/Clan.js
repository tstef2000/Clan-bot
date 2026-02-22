const { createModel } = require('../utils/fileStore');

module.exports = createModel('clans', {
  tag: null,
  coLeaderIds: [],
  memberIds: [],
  bounty: 0,
  roleId: null,
  leaderRoleId: null,
  coLeaderRoleId: null,
  categoryId: null,
  textChannelId: null,
  voiceChannelId: null
});
