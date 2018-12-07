
const bcrypt = require('bcryptjs');
const errors = require('@feathersjs/errors');
const makeDebug = require('debug');
const merge = require('lodash.merge');
const Plugins = require('../../plugin-scaffolding/src');
const { authenticate } = require('@feathersjs/authentication').hooks;
const checkUnique = require('./check-unique');
const identityChange = require('./identity-change');
const passwordChange = require('./password-change');
const resendVerifySignup = require('./resend-verify-signup');
const defaultPlugins = require('./default-plugins');
const sanitizeUserForClient = require('./helpers/sanitize-user-for-client');
const sendResetPwd = require('./send-reset-pwd');
const { resetPwdWithLongToken, resetPwdWithShortToken } = require('./reset-password');
const { verifySignupWithLongToken, verifySignupWithShortToken } = require('./verify-signup');

const debug = makeDebug('authLocalMgnt:service');

const optionsDefault = {
  app: null, // Value set during configuration.
  service: '/users', // Need exactly this for test suite. Overridden by config/default.json.
  path: 'authManagement',
  emailField: 'email',
  dialablePhoneField: 'dialablePhone',
  passwordField: 'password', //  Overridden by config/default.json.
  notifier: (app, options) => async (type, sanitizedUser, notifierOptions) => {
    // console.log('a-l-m default notifier called', type, sanitizedUser, notifierOptions);
  },
  buildEmailLink,
  // Token's length will be twice longTokenLen by default.
  // The token for sendResetPwd will be twice LongTokenLen + length of (id || _id) + 3
  longTokenLen: 15,
  shortTokenLen: 6,
  shortTokenDigits: true,
  resetDelay: 1000 * 60 * 60 * 2, // 2 hours
  delay: 1000 * 60 * 60 * 24 * 5, // 5 days
  identifyUserProps: ['email', 'dialablePhone'],
  actionsNoAuth: [
    'resendVerifySignup', 'verifySignupLong', 'verifySignupShort',
    'sendResetPwd', 'resetPwdLong', 'resetPwdShort',
  ],
  ownAcctOnly: true,
  sanitizeUserForClient,
  bcryptCompare: bcrypt.compare,
  catchErr: (err, options, data) => {
    return Promise.reject(err); // support both async and Promise interfaces
  },
  customizeCalls: null, // Value set during configuration.
};

/* Call options.customizeCalls using
const users = await options.customizeCalls.identityChange
  .find(usersService, { query: identifyUser });

const user2 = await options.customizeCalls.identityChange
  .patch(usersService, user1[usersServiceIdName], {

});
*/

function buildEmailLink(app, actionToVerb) {
  const isProd = process.env.NODE_ENV === 'production';
  const port = (app.get('port') === '80' || isProd) ? '' : `:${app.get('port')}`;
  const host = (app.get('host') === 'HOST')? 'localhost': app.get('host');
  const protocol = (app.get('protocol') === 'PROTOCOL')? 'http': app.get('protocol') || 'http';
  const url = `${protocol}://${host}${port}/`;

  actionToVerb = {
    sendVerifySignup: 'verify',
    resendVerifySignup: 'verify',
    sendResetPwd: 'reset',
  };

  return (type, hash) => {
    return `${url}${actionToVerb[type] || type}/${hash}`;
  };
}

const  optionsCustomizeCalls = {
  checkUnique: {
    find: async (usersService, params = {}) =>
      await usersService.find(params),
  },
  identityChange: {
    find: async (usersService, params = {}) =>
      await usersService.find(params),
    patch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
  },
  passwordChange: {
    find: async (usersService, params = {}) =>
      await usersService.find(params),
    patch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
  },
  resendVerifySignup: {
    find: async (usersService, params = {}) =>
      await usersService.find(params),
    patch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
  },
  resetPassword: {
    resetTokenGet: async (usersService, id, params) =>
      await usersService.get(id, params),
    resetShortTokenFind: async (usersService, params = {}) =>
      await usersService.find(params),
    badTokenpatch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
    patch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
  },
  sendResetPwd: {
    find: async (usersService, params = {}) => {
      return await usersService.find(params);
    },
    patch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
  },
  verifySignup: {
    find: async (usersService, params = {}) =>
      await usersService.find(params),
    patch: async (usersService, id, data, params = {}) =>
      await usersService.patch(id, data, params),
  },
};

module.exports = authenticationLocalManagement;

function authenticationLocalManagement(options1 = {}) {
  debug('service being configured.');
  let plugins;

  return function (app) {
    // Get defaults from config/default.json
    const authOptions = app.get('authentication') || {};
    optionsDefault.service = authOptions.service || optionsDefault.service;
    optionsDefault.passwordField =
      (authOptions.local || {}).passwordField || optionsDefault.passwordField;

    let options = Object.assign({}, optionsDefault, options1, { app });
    options.customizeCalls = merge({}, optionsCustomizeCalls, options1.customizeCalls || {});
    options.notifier = options.notifier(app, options);

    // Load default plugins
    (async function() {
      plugins = new Plugins({ options });
      plugins.register(defaultPlugins);
      await plugins.setup();
    }());

    app.set('localManagement', options);

    options.app.use(options.path, authLocalMgntMethods(options, plugins));
  };
}

function authLocalMgntMethods(options, plugins) {
  return {
    async create (data) {
      debug(`create called. action=${data.action}`);
      let results;

      try {
        switch (data.action) {
          case 'checkUnique':
            return await plugins.run('checkUnique', data);
          case 'resendVerifySignup':
            return await plugins.run('resendVerifySignup', data);
          case 'verifySignupLong':
            return await plugins.run('verifySignupLong', data);
          case 'verifySignupShort':
            return await plugins.run('verifySignupShort', data);
          case 'sendResetPwd':
            return await plugins.run('sendResetPwd', data);
          case 'resetPwdLong':
            return await plugins.run('resetPwdLong', data);
          case 'resetPwdShort':
            return await plugins.run('resetPwdShort', data);
          case 'passwordChange':
            return await plugins.run('passwordChange', data);
          case 'identityChange':
            return await plugins.run('identityChange', data);
          default:
            return Promise.reject(
              new errors.BadRequest(`Action '${data.action}' is invalid.`,
                { errors: { $className: 'badParams' } }
              )
            );
        }
      } catch (err) {
        return options.catchErr(err, options, data);
      }
    }
  }
}
