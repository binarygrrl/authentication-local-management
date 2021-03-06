
const makeDebug = require('debug');
const ensureObjPropsValid = require('./helpers/ensure-obj-props-valid');
const getValidatedUser = require('./helpers/get-validated-user');
const { getLongToken, getShortToken } = require('@feathers-plus/commons');

const debug = makeDebug('authLocalMgnt:resendVerifySignup');

module.exports = resendVerifySignup;

// {email}, {cellphone}, {verifyToken}, {verifyShortToken},
// {email, cellphone, verifyToken, verifyShortToken}
async function resendVerifySignup (
  { options, plugins }, identifyUser, notifierOptions, authUser, provider
) {
  debug('identifyUser=', identifyUser);
  const usersService = options.app.service(options.usersServicePath);
  const usersServiceIdName = usersService.id;

  ensureObjPropsValid(identifyUser,
    options.userIdentityFields.concat('verifyToken', 'verifyShortToken')
  );

  const users = await plugins.run('resendVerifySignup.find', {
    usersService,
    params: { query: identifyUser },
  });

  const user1 = getValidatedUser(users, ['isNotVerified']);

  const user2 = await plugins.run('resendVerifySignup.patch', {
    usersService,
    id: user1[usersServiceIdName],
    data: {
      // isInvitation is left as is.
      isVerified: false,
      verifyExpires: Date.now() + options.verifyDelay,
      verifyToken: await getLongToken(options.longTokenLen),
      verifyShortToken: await getShortToken(options.shortTokenLen, options.shortTokenDigits),
    },
  });

  const user3 = await plugins.run('sanitizeUserForNotifier', user2);

  const user4 = await plugins.run('notifier', {
    type: user3.isInvitation ? 'resendInvitationSignup' : 'resendVerifySignup',
    sanitizedUser: user3,
    notifierOptions,
  });

  return await plugins.run('sanitizeUserForClient', user4);
}
