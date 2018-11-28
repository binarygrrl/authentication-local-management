
const errors = require('@feathersjs/errors');
const makeDebug = require('debug');
const comparePasswords = require('./helpers/compare-passwords');
const ensureObjPropsValid = require('./helpers/ensure-obj-props-valid');
const getId = require('./helpers/get-id');
const getLongToken = require('./helpers/get-long-token');
const getShortToken = require('./helpers/get-short-token');
const getUserData = require('./helpers/get-user-data');
const callNotifier = require('./helpers/call-notifier');

const debug = makeDebug('authLocalMgnt:identityChange');

module.exports = identityChange;

async function identityChange (
  options, identifyUser, password, changesIdentifyUser, authUser, provider
) {
  // note this call does not update the authenticated user info in hooks.params.user.
  debug('identityChange', password, changesIdentifyUser);
  const usersService = options.app.service(options.service);
  const usersServiceIdName = usersService.id;

  ensureObjPropsValid(identifyUser, options.identifyUserProps);
  ensureObjPropsValid(changesIdentifyUser, options.identifyUserProps);

  const users = await options.customizeCalls.identityChange
    .find(usersService, { query: identifyUser });
  const user1 = getUserData(users);

  if (options.ownAcctOnly && authUser && (getId(authUser) !== getId(user1))) {
    throw new errors.BadRequest('Can only affect your own account.',
      { errors: { $className: 'not-own-acct' } }
    );
  }

  try {
    await comparePasswords(password, user1[options.passwordField], () => {}, options.bcryptCompare);
  } catch (err) {
    throw new errors.BadRequest('Password is incorrect.',
      { errors: { password: 'Password is incorrect.', $className: 'badParams' } }
    );
  }

  const user2 = await options.customizeCalls.identityChange
    .patch(usersService, user1[usersServiceIdName], {
      verifyExpires: Date.now() + options.delay,
      verifyToken: await getLongToken(options.longTokenLen),
      verifyShortToken: await getShortToken(options.shortTokenLen, options.shortTokenDigits),
      verifyChanges: changesIdentifyUser
    });

  const user3 = await callNotifier(options, 'identityChange', user2, null);
  return options.sanitizeUserForClient(user3, options.passwordField);
}
