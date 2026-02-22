const { createModel } = require('../utils/fileStore');

module.exports = createModel('users', {
  clanId: null,
  role: null,
  pendingInviteClanId: null,
  invitedByUserId: null
});
