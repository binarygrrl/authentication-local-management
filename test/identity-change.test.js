
const assert = require('chai').assert;
const feathers = require('@feathersjs/feathers');
const feathersMemory = require('feathers-memory');
const authLocalMgnt = require('../src/index');
const { hashPasswordFake: { hashPassword, bcryptCompare } } = require('@feathers-plus/commons');
const { timeoutEachTest } = require('./helpers/config');

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

// users DB
const users_Id = [
  { _id: 'a', email: 'a', plainPassword: 'aa', password: 'aa', isVerified: false },
  { _id: 'b', email: 'b', plainPassword: 'bb', password: 'bb', isVerified: true },
];

const usersId = [
  { id: 'a', email: 'a', plainPassword: 'aa', password: 'aa', isVerified: false },
  { id: 'b', email: 'b', plainPassword: 'bb', password: 'bb', isVerified: true },
];

// Tests
['_id', 'id'].forEach(idType => {
  ['paginated', 'non-paginated'].forEach(pagination => {
    describe(`change-protected-fields.test.js ${pagination} ${idType}`, function () {
      this.timeout(timeoutEachTest);

      describe('standard', () => {
        let app;
        let usersService;
        let authLocalMgntService;
        let db;
        let result;

        beforeEach(async () => {
          app = feathers();
          app.configure(makeUsersService({ id: idType, paginate: pagination === 'paginated' }));
          app.configure(authLocalMgnt({
            bcryptCompare,
          }));
          app.setup();
          authLocalMgntService = app.service('localManagement');

          usersService = app.service('users');
          await usersService.remove(null);
          db = clone(idType === '_id' ? users_Id : usersId);
          await usersService.create(db);
        });

        it('updates verified user', async () => {
          try {
            const userRec = clone(users_Id[1]);

            result = await authLocalMgntService.create({
              action: 'changeProtectedFields',
              value: {
                user: { email: userRec.email },
                password: userRec.plainPassword,
                changes: { email: 'b@b' }
                },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, true, 'isVerified not true');
            assert.equal(user.email, userRec.email);
          } catch (err) {
            console.log(err);
            assert.strictEqual(err, null, 'err code set');
          }
        });

        it('updates unverified user', async () => {
          try {
            const userRec = clone(users_Id[0]);

            result = await authLocalMgntService.create({
              action: 'changeProtectedFields',
              value: {
                user: { email: userRec.email },
                password: userRec.plainPassword,
                changes: { email: 'a@a' }
              },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, false, 'isVerified not false');
            assert.equal(user.email, userRec.email);
          } catch (err) {
            console.log(err);
            assert.strictEqual(err, null, 'err code set');
          }
        });

        it('error on wrong password', async () => {
          try {
            const userRec = clone(users_Id[0]);

            result = await authLocalMgntService.create({
              action: 'changeProtectedFields',
              value: {
                user: { email: userRec.email },
                password: 'ghghghg',
                changes: { email: 'a@a' }
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
        let app;
        let usersService;
        let authLocalMgntService;
        let db;
        let result;

        beforeEach(async () => {
          stack = [];

          app = feathers();
          app.configure(makeUsersService({ id: idType, paginate: pagination === 'paginated' }));
          app.configure(authLocalMgnt({
            bcryptCompare,
            plugins: [{
              trigger: 'notifier',
              position: 'before',
              run: async (accumulator, { type, sanitizedUser, notifierOptions }, { options }, pluginContext) => {
                stack.push({ args: clone([type, sanitizedUser, notifierOptions]), result: sanitizedUser });
              },
            }],
          }));

          app.setup();
          authLocalMgntService = app.service('localManagement');

          usersService = app.service('users');
          await usersService.remove(null);
          db = clone(idType === '_id' ? users_Id : usersId);
          await usersService.create(db);
        });
  
        it('updates verified user', async () => {
          try {
            const userRec = clone(users_Id[1]);

            result = await authLocalMgntService.create({
              action: 'changeProtectedFields',
              value: {
                user: { email: userRec.email },
                password: userRec.plainPassword,
                changes: { email: 'b@b' }
              },
            });
            const user = await usersService.get(result.id || result._id);

            assert.strictEqual(result.isVerified, true, 'isVerified not true');

            assert.equal(user.email, user.email);
            assert.deepEqual(user.verifyChanges, { email: 'b@b' });

            assert.deepEqual(
              stack[0].args,
              [
                'changeProtectedFields',
                Object.assign({},
                  sanitizeUserForEmail(result),
                  extractProps(
                    user, 'verifyExpires', 'verifyToken', 'verifyShortToken', 'verifyChanges'
                  )
                ),
                null
              ],
            );

            assert.strictEqual(user.isVerified, true, 'isVerified not false');
            assert.isString(user.verifyToken, 'verifyToken not String');
            assert.isAtLeast(user.verifyToken.length, 30, 'verify token wrong length');
            assert.equal(user.verifyShortToken.length, 6, 'verify short token wrong length');
            assert.match(user.verifyShortToken, /^[0-9]+$/);
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

function sanitizeUserForEmail(user) {
  const user1 = clone(user);
  delete user1.password;
  return user1;
}

function extractProps(obj, ...rest) {
  const res = {};
  rest.forEach(key => {
    res[key] = obj[key];
  });
  return res;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
