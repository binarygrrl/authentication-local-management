
const assert = require('chai').assert;
const feathers = require('@feathersjs/feathers');
const feathersMemory = require('feathers-memory');
const authLocalMgnt = require('../src/index');
const { hashPasswordFake: { hashPassword } } = require('@feathers-plus/commons');
const { timeoutEachTest, maxTimeAllTests } = require('./helpers/config');

const now = Date.now();
let stack;

const makeUsersService = (options) => function (app) {
  app.use('/users', feathersMemory(options));

  app.service('users').hooks({
    before: {
      create: hashPassword(),
      patch: hashPassword(),
    }
  });
};

const users_Id = [
  // The added time interval must be longer than it takes to run ALL the tests
  { _id: 'a', email: 'a', username: 'aa', isVerified: true, resetToken: '000', resetShortToken: '00099', resetExpires: now + maxTimeAllTests },
  { _id: 'b', email: 'b', username: 'bb', isVerified: true, resetToken: null, resetShortToken: null, resetExpires: null },
  { _id: 'c', email: 'c', username: 'cc', isVerified: true, resetToken: '111', resetShortToken: '11199', resetExpires: now - maxTimeAllTests },
  { _id: 'd', email: 'd', username: 'dd', isVerified: false, resetToken: '222', resetShortToken: '22299', resetExpires: now - maxTimeAllTests },
];

const usersId = [
  // The added time interval must be longer than it takes to run ALL the tests
  { id: 'a', email: 'a', username: 'aa', isVerified: true, resetToken: '000', resetShortToken: '00099', resetExpires: now + maxTimeAllTests },
  { id: 'b', email: 'b', username: 'bb', isVerified: true, resetToken: null, resetShortToken: null, resetExpires: null },
  { id: 'c', email: 'c', username: 'cc', isVerified: true, resetToken: '111', resetShortToken: '11199', resetExpires: now - maxTimeAllTests },
  { id: 'd', email: 'd', username: 'dd', isVerified: false, resetToken: '222', resetShortToken: '22299', resetExpires: now - maxTimeAllTests },
];

// Tests
['_id', 'id'].forEach(idType => {
  ['paginated', 'non-paginated'].forEach(pagination => {
    describe(`reset-pwd-short.test.js ${pagination} ${idType}`, function () {
      this.timeout(timeoutEachTest);

      describe('basic', () => {
        let app;
        let usersService;
        let authLocalMgntService;
        let db;
        let result;

        beforeEach(async () => {
          app = feathers();
          app.configure(makeUsersService({ id: idType, paginate: pagination === 'paginated' }));
          app.configure(authLocalMgnt({
            userIdentityFields: ['email', 'username']
          }));
          app.setup();
          authLocalMgntService = app.service('authManagement');

          usersService = app.service('users');
          await usersService.remove(null);
          db = clone(idType === '_id' ? users_Id : usersId);
          await usersService.create(db);
        });

        it('verifies valid token', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '00099',
                password: '123456',
                user: {
                  username: db[0].username
                }
              },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, true, 'user.isVerified not true');

            assert.strictEqual(user.isVerified, true, 'isVerified not true');
            assert.strictEqual(user.resetToken, null, 'resetToken not null');
            assert.strictEqual(user.resetShortToken, null, 'resetShortToken not null');
            assert.strictEqual(user.resetExpires, null, 'resetExpires not null');
            assert.isString(user.password, 'password not a string');
            assert.isAbove(user.password.length, 6, 'password wrong length');
          } catch (err) {
            console.log(err);
            assert.strictEqual(err, null, 'err code set');
          }
        });

        it('user is sanitized', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '00099',
                password: '123456',
                user: {
                  username: db[0].username
                }
              },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, true, 'isVerified not true');
            assert.strictEqual(result.resetToken, undefined, 'resetToken not undefined');
            assert.strictEqual(result.resetShortToken, undefined, 'resetShortToken not undefined');
            assert.strictEqual(result.resetExpires, undefined, 'resetExpires not undefined');
            assert.isString(user.password, 'password not a string');
            assert.isAbove(user.password.length, 6, 'password wrong length');
          } catch (err) {
            console.log(err);
            assert.strictEqual(err, null, 'err code set');
          }
        });

        it('handles multiple user ident', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '00099',
                password: '123456',
                user: {
                  email: db[0].email,
                  username: db[0].username
                }
              },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, true, 'isVerified not true');
            assert.strictEqual(result.resetToken, undefined, 'resetToken not undefined');
            assert.strictEqual(result.resetShortToken, undefined, 'resetShortToken not undefined');
            assert.strictEqual(result.resetExpires, undefined, 'resetExpires not undefined');
            assert.isString(user.password, 'password not a string');
            assert.isAbove(user.password.length, 6, 'password wrong length');
          } catch (err) {
            console.log(err);
            assert.strictEqual(err, null, 'err code set');
          }
        });

        it('requires user ident', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '00099',
                password: '123456',
                user: {}
              },
            });

            assert(false, 'unexpected succeeded.');
          } catch (err) {
            assert.isString(err.message);
            assert.isNotFalse(err.message);
          }
        });

        it('throws on non-configured user ident', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '00099',
                password: '123456',
                user: {
                  email: db[0].email,
                  resetShortToken: '00099',
                }
              },
            });

            assert(false, 'unexpected succeeded.');
          } catch (err) {
            assert.isString(err.message);
            assert.isNotFalse(err.message);
          }
        });

        it('error on unverified user', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '22299',
                password: '123456',
                user: {
                  email: db[3].email,
                }
              },
            });

            assert(false, 'unexpected succeeded.');
          } catch (err) {
            assert.isString(err.message);
            assert.isNotFalse(err.message);
          }
        });

        it('error on expired token', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '11199',
                password: '123456',
                user: {
                  username: db[2].username,
                }
              },
            });

            assert(false, 'unexpected succeeded.');
          } catch (err) {
            assert.isString(err.message);
            assert.isNotFalse(err.message);
          }
        });

        it('error on user not found', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '999',
                password: '123456',
                user: {
                  email: '999',
                }
              },
            });

            assert(false, 'unexpected succeeded.');
          } catch (err) {
            assert.isString(err.message);
            assert.isNotFalse(err.message);
          }
        });

        it('error incorrect token', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '999',
                password: '123456',
                user: {
                  email: db[0].email,
                }
              },
            });

            assert(false, 'unexpected succeeded.');
          } catch (err) {
            assert.isString(err.message);
            assert.isNotFalse(err.message);
          }
        });
      });

      describe('with notification', () => {

        stach = [];
        let app;
        let usersService;
        let authLocalMgntService;
        let db;
        let result;
        let spyNotifier;

        beforeEach(async () => {
          stack = [];

          app = feathers();
          app.configure(makeUsersService({ id: idType, paginate: pagination === 'paginated' }));
          app.configure(authLocalMgnt({
            // maybe reset userIdentityFields
            testMode: true,
            plugins: [{
              trigger: 'notifier',
              position: 'before',
              run: async (accumulator, { type, sanitizedUser, notifierOptions }, { options }, pluginContext) => {
                stack.push({ args: clone([type, sanitizedUser, notifierOptions]), result: sanitizedUser });
              },
            }],
          }));
          app.setup();
          authLocalMgntService = app.service('authManagement');

          usersService = app.service('users');
          await usersService.remove(null);
          db = clone(idType === '_id' ? users_Id : usersId);
          await usersService.create(db);
        });

        it('verifies valid token', async () => {
          try {
            result = await authLocalMgntService.create({
              action: 'resetPwdShort',
              value: {
                token: '00099',
                password: '123456',
                user: {
                  email: db[0].email,
                }
              },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, true, 'user.isVerified not true');

            assert.strictEqual(user.isVerified, true, 'isVerified not true');
            assert.strictEqual(user.resetToken, null, 'resetToken not null');
            assert.strictEqual(user.resetExpires, null, 'resetExpires not null');

            const hash = user.password;
            assert.isString(hash, 'password not a string');
            assert.isAbove(hash.length, 6, 'hash wrong length');

            assert.deepEqual(
              stack[0].args,
              [
                'resetPwd',
                Object.assign({}, sanitizeUserForEmail(user)),
                null
              ]);
          } catch (err) {
            console.log(err);
            assert.strictEqual(err, null, 'err code set');
          }
        });
      });
    });
  });
});

// Helpers

function notifier(app, options) {
  return async (...args) => {
    const [ type, sanitizedUser, notifierOptions ] = args;

    stack.push({ args: clone(args), result: sanitizedUser });

    return sanitizedUser
  }
}

function sanitizeUserForEmail(user) {
  const user1 = Object.assign({}, user);
  delete user1.password;
  return user1;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
