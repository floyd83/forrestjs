const { resetState } = require('../src/state');
const forrestjs = require('../src/index');
const { registerAction } = require('../src/register-action');
const constants = require('../src/constants');
const {
  isDeclarativeAction,
  isListOfDeclarativeActions,
} = require('../src/create-app');

describe('core/create-app', () => {
  beforeEach(resetState);

  describe('utils', () => {
    const featureA = [
      {
        target: 'foo',
        handler: () => {},
      },
      {
        target: 'foo',
        handler: [],
      },
      {
        target: 'foo',
        handler: {},
      },
    ];

    describe('isDeclarativeAction', () => {
      featureA.forEach((payload) =>
        it('Should recognise a declarative action payload', () => {
          expect(isDeclarativeAction(payload)).toBe(true);
        }),
      );
    });

    describe('isListOfDeclarativeActions', () => {
      expect(isListOfDeclarativeActions(featureA)).toBe(true);
    });
  });

  it('should run an empty app', async () => {
    await forrestjs.run();
  });

  it('should register a service or feature from an ES module', async () => {
    const handler = jest.fn();

    const s1 = {
      register: () => {
        handler();
      },
    };

    await forrestjs.run({
      services: [s1],
      features: [s1],
    });

    expect(handler.mock.calls.length).toBe(2);
  });

  it('should register a service or feature from a function', async () => {
    const handler = jest.fn();
    const s1 = () => handler();

    await forrestjs.run({
      services: [s1],
      features: [s1],
    });

    expect(handler.mock.calls.length).toBe(2);
  });

  // DEPRECATED: remove in v5.0.0
  // it.skip('should register a service as single hook setup', async () => {
  //   const handler = jest.fn();
  //   const s1 = ['foo', handler];
  //   const f1 = ({ createAction }) => createAction('foo');

  //   await forrestjs.run({
  //     services: [s1],
  //     features: [f1],
  //   });

  //   expect(handler.mock.calls.length).toBe(1);
  // });

  it('should run an app that provides settings as a function', async () => {
    const f1 = jest.fn();
    await forrestjs.run({
      settings: ({ setConfig }) => {
        setConfig('foo.faa', 22);
      },
      features: [
        {
          target: '$START_FEATURE',
          handler: ({ getConfig }) => f1(getConfig('foo.faa')),
        },
      ],
    });

    expect(f1.mock.calls[0][0]).toBe(22);
  });

  it('should provide a config getter to any registered action', async () => {
    const f1 = jest.fn();
    await forrestjs.run({
      settings: ({ setConfig }) => {
        setConfig('foo.faa', 22);
      },
      services: [
        // register a programmatic feature
        ({ registerAction }) =>
          registerAction({
            target: '$INIT_SERVICE',
            handler: ({ getConfig, setConfig }) =>
              setConfig('foo', getConfig('foo.faa') * 2),
          }),
      ],
      features: [
        // register a declarative feature
        {
          target: '$START_FEATURE',
          handler: ({ getConfig }) => f1(getConfig('foo')),
        },
      ],
    });

    expect(f1.mock.calls[0][0]).toBe(44);
  });

  it('should lock a context and decorate it with internal methods', async () => {
    const f1 = jest.fn();
    const f2 = jest.fn();
    const f3 = jest.fn();
    await forrestjs.run({
      settings: {
        increment: 1,
      },
      context: {
        foo: (args, ctx) => args.value + ctx.getConfig('increment'),
      },
      services: [
        {
          target: '$START_SERVICE',
          handler: async ({ createExtension }) => {
            const r1 = createExtension.sync('aaa', { value: 1 });
            f1(r1[0][0]);

            const r2 = await createExtension.serie('bbb', { value: 2 });
            f2(r2[0][0]);

            const r3 = await createExtension.parallel('ccc', { value: 3 });
            f3(r3[0][0]);
          },
        },
      ],
      features: [
        { target: 'aaa', handler: (args, ctx) => ctx.foo(args, ctx) },
        { target: 'bbb', handler: (args, ctx) => ctx.foo(args, ctx) },
        { target: 'ccc', handler: (args, ctx) => ctx.foo(args, ctx) },
      ],
    });

    expect(f1.mock.calls[0][0]).toBe(2);
    expect(f2.mock.calls[0][0]).toBe(3);
    expect(f3.mock.calls[0][0]).toBe(4);
  });

  describe('createHookApp getters / setters', () => {
    it('SETTINGS should not pass reference to the internal object', async () => {
      registerAction({
        target: constants.SETTINGS,
        handler: ({ settings }) => {
          expect(settings).toBe(undefined);
        },
      });
      await forrestjs.run({ settings: { foo: 1 } });
    });

    it('should handle settings with getters/setters', async () => {
      registerAction({
        target: constants.SETTINGS,
        handler: ({ getConfig, setConfig }) => {
          setConfig('foo', getConfig('foo') + 1);
        },
      });
      const app = await forrestjs.run({ settings: { foo: 1 } });
      expect(app.settings.foo).toBe(2);
    });

    it('should handle settings with nested paths', async () => {
      registerAction({
        target: constants.SETTINGS,
        handler: ({ getConfig, setConfig }) => {
          setConfig('new.faa.foo', getConfig('foo') + 1);
        },
      });
      const app = await forrestjs.run({ settings: { foo: 1 } });
      expect(app.settings.new.faa.foo).toBe(2);
    });
  });

  describe('createHookApp / registerHook', () => {
    const s1 = ({ registerTargets, registerAction, createExtension }) => {
      registerTargets({ S1: 's1' });
      registerAction({
        target: '$START_SERVICE',
        handler: () => createExtension.sync('s1'),
      });
    };

    it('should run a required service by reference', async () => {
      const handler = jest.fn();
      const f1 = { target: '$S1', handler };

      await forrestjs.run({
        services: [s1],
        features: [f1],
      });

      expect(handler.mock.calls.length).toBe(1);
    });

    it('should fail to run a required service by reference', async () => {
      const handler = jest.fn();
      const f1 = { target: '$S1', handler };

      let error = null;
      try {
        await forrestjs.run({
          // services: [s1],
          features: [f1],
        });
      } catch (e) {
        error = e;
      }

      expect(error.message).toBe('Unknown target "S1"');
    });

    it('should ignore an optional service by reference', async () => {
      const handler = jest.fn();
      const f1 = { target: '$S1?', handler };

      await forrestjs.run({
        // services: [s1],
        features: [f1],
      });

      expect(handler.mock.calls.length).toBe(0);
    });
  });

  describe('run all "registerTargets()" before "registerAction()"', () => {
    it('Services and Features should be able to use nominal hooks to extend each other', async () => {
      const s1Handler = jest.fn();
      const s2Handler = jest.fn();

      const s1 = ({ registerTargets, registerAction, createExtension }) => {
        registerTargets({ s1: 's1' });
        registerAction({
          target: '$INIT_SERVICE',
          handler: () => createExtension.sync('s1'),
        });
        registerAction({ target: '$s2', handler: s2Handler });
      };

      const s2 = ({ registerTargets, registerAction, createExtension }) => {
        registerTargets({ s2: 's2' });
        registerAction({
          target: '$INIT_SERVICE',
          handler: () => createExtension.sync('s2'),
        });
        registerAction({ target: '$s1', handler: s1Handler });
      };

      await forrestjs.run({ services: [s1, s2] });

      expect(s1Handler.mock.calls.length).toBe(1);
      expect(s2Handler.mock.calls.length).toBe(1);
    });
  });

  describe('run declarative features', () => {
    it('Services and Features should be able to register a single service in a declarative way', async () => {
      const handler1 = jest.fn();

      await forrestjs.run({
        services: [
          {
            target: '$INIT_SERVICE',
            handler: handler1,
          },
        ],
      });

      expect(handler1.mock.calls).toHaveLength(1);
    });

    it('Services and Features should register multiple hooks in a declarative way', async () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      await forrestjs.run({
        services: [
          [
            {
              target: '$INIT_SERVICE',
              handler: handler1,
            },
            {
              target: '$INIT_SERVICE',
              handler: handler2,
            },
          ],
        ],
      });

      expect(handler1.mock.calls).toHaveLength(1);
      expect(handler2.mock.calls).toHaveLength(1);
    });
  });
});
