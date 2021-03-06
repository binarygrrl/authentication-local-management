
const assert = require('chai').assert;
const feathers = require('@feathersjs/feathers');
const localManagement = require('../src/index');

const optionsDefault = {
  app: null, // assigned during initialization
  usersServicePath: '/users', // need exactly this for test suite
  almServicePath: 'localManagement',
  // token's length will be twice this.
  // resetPassword token will be twice this + id/_id length + 3
  longTokenLen: 15,
  ownAcctOnly: true,
  passwordField: 'password',
  shortTokenLen: 6,
  shortTokenDigits: true,
  verifyDelay: 1000 * 60 * 60 * 24 * 5, // 5 days for re/sendVerifySignup
  resetDelay: 1000 * 60 * 60 * 2, // 2 hours for sendResetPwd
  mfaDelay: 1000 * 60 * 60, // 1 hour for sendMfa
  commandsNoAuth: [ // Unauthenticated users may run these commands
    'resendVerifySignup', 'verifySignupLong', 'verifySignupShort',
    'sendResetPwd', 'resetPwdLong', 'resetPwdShort',
  ],
  notifierEmailField: 'email',
  notifierDialablePhoneField: 'dialablePhone',
  userIdentityFields: ['email', 'dialablePhone'],
  userExtraPasswordFields: [],
  userProtectedFields: ['preferredComm'],
  maxPasswordsEachField: 3,
  plugins: null, // changes top default plugins
};

const userMgntOptions = {
  service: '/users',
  notifier: () => Promise.resolve(),
  shortTokenLen: 8,
};

const orgMgntOptions = {
  service: '/organizations',
  almServicePath: 'localManagement/org', // *** specify path for this instance of service
  notifier: () => Promise.resolve(),
  shortTokenLen: 10,
};

function services() {
  const app = this;
  app.configure(user);
  app.configure(organization);
}

function user() {
  const app = this;

  app.use('/users', {
    async create(data) { return data; }
  });

  const service = app.service('/users');

  service.hooks({
    before: { create: localManagement.hooks.addVerification() }
  });
}

function organization() {
  const app = this;

  app.use('/organizations', {
    async create(data) { return data; }
  });

  const service = app.service('/organizations');

  service.hooks({
    before: { create: localManagement.hooks.addVerification('localManagement/org') }, // *** which one
  });
}

describe('scaffolding.test.js', () => {
  describe('can configure 1 service', () => {
    let app;

    beforeEach(() => {
      app = feathers();
      app.configure(localManagement(userMgntOptions));
      app.configure(services);
      app.setup();
    });

    it('configures', () => {
      const options = app.get('localManagement');

      delete options.app;
      delete options.bcryptCompare;
      delete options.authManagementHooks;
      delete options.plugins;

      const expected = Object.assign({}, optionsDefault, userMgntOptions);
      delete expected.app;
      delete expected.bcryptCompare;
      delete expected.authManagementHooks;
      delete expected.plugins;

      assert.deepEqual(options, expected);
    });

    it('can create an item', async () => {
      const user = app.service('/users');

      const result = await user.create({ username: 'John Doe' });
      assert.equal(result.username, 'John Doe');
      assert.equal(result.verifyShortToken.length, 8);
    });

    it('can call service', async () => {
      const authLocalMgntService = app.service('localManagement');

      const result = await authLocalMgntService.create({
        action: 'checkUnique',
        value: {}
      });

      assert.strictEqual(result, null);
    });
  });

  describe('can configure 2 services', () => {
    let app;

    beforeEach(() => {
      app = feathers();
      app.configure(localManagement(userMgntOptions));
      app.configure(localManagement(orgMgntOptions));
      app.configure(services);
      app.setup();
    });

    it('can create items', async () => {
      const user = app.service('/users');
      const organization = app.service('/organizations');

      // create a user item
      const result = await user.create({ username: 'John Doe' })

      assert.equal(result.username, 'John Doe');
      assert.equal(result.verifyShortToken.length, 10);

      // create an organization item
      const result1 = await organization.create({ organization: 'Black Ice' });

      assert.equal(result1.organization, 'Black Ice');
      assert.equal(result1.verifyShortToken.length, 10);
    });

    it('can call services', async () => {
      const authLocalMgntService = app.service('localManagement'); // *** the default
      const authMgntOrgService = app.service('localManagement/org'); // *** which one

      // call the user instance
      const result = await authLocalMgntService.create({
        action: 'checkUnique',
        value: {}
      });

      assert.strictEqual(result, null);

      // call the organization instance
      const result1 = await authMgntOrgService.create({
        action: 'checkUnique',
        value: {}
      });

      assert.strictEqual(result1, null);
    });
  });
});
