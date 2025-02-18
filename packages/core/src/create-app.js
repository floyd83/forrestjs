const dotted = require('@marcopeg/dotted').default;
const { createExtension } = require('./create-extension');
const { registerAction } = require('./register-action');
const { traceHook } = require('./tracer');
const { createRegistry } = require('./create-targets-registry');
const constants = require('./constants');
const {
  ForrestJSGetConfigError,
  ForrestJSGetContextError,
  ForrestJSInvalidTargetError,
  ForrestJSInvalidHandlerError,
} = require('./errors');

// DEPRECATED: property "hook" is deprecated and will be removed in v5.0.0
const isDeclarativeAction = (
  { hook, target, handler },
  integrationName,
  integrationType,
) => {
  const _target = target || hook;
  if (!(typeof _target === 'string' && _target)) {
    throw new ForrestJSInvalidTargetError(
      `${integrationType} "${integrationName}" defines an invalid target "${_target}"`,
    );
  }

  if (!(typeof handler === 'object' || typeof handler === 'function')) {
    throw new ForrestJSInvalidHandlerError(
      `${integrationType} "${integrationName}" defines an invalid handler`,
    );
  }

  return true;
};

const isListOfDeclarativeActions = (list, integrationName, integrationType) =>
  Array.isArray(list) &&
  list.every(($) => isDeclarativeAction($, integrationName, integrationType));

/**
 * All the utilization of "registerAction" by an integration's
 * manifest will be queued into an in-memory store and applied only
 * after all the integration have fired.
 *
 * This lets each integration the possibility to use the `registerHook`
 * API and declare its own nominal hooks capabilities.
 *
 * This asynchronous behaviour allows service2service and feature2feature
 * extensibility without enforcing strict registration order.
 *
 * @param {*} integrations
 * @param {*} context
 * @param {*} prefix
 */
const runIntegrations = async (
  integrations,
  context,
  prefix = '',
  integrationType = 'Integration',
) => {
  const registeredExtensions = [];

  // Execute the integration functions
  for (const service of integrations) {
    // Process different styles of registering services
    const registerFn = service.register || service.default || service;
    const integrationName = registerFn.name || service.name;

    // Try to execute the register function, providing a registerAction
    // function that is able to use the function's name as feature name
    // That will reduce the need for using the property "name" during
    // the registration of the features
    // const registerExtension = ;
    const computed =
      typeof registerFn === 'function'
        ? await registerFn({
            ...context,
            registerAction: (ag1, ag2, ag3 = {}) => {
              // Handle positional arguments:
              // registerAction('hook', () => {})
              // registerAction('hook', () => {}, 'name')
              // registerAction('hook', () => {}, { name: 'name' })
              if (typeof ag1 === 'string') {
                console.warn(
                  `[DEPRECATED] "registerAction(name, handler, option)" is deprecated and will be remove in version 5.0.0.`,
                );

                return registeredExtensions.push([
                  ag1,
                  ag2,
                  {
                    ...(typeof ag3 === 'string' ? { name: ag3 } : ag3),
                    name: `${prefix}${
                      (typeof ag3 === 'string' ? ag3 : ag3.name) ||
                      integrationName
                    }`,
                  },
                ]);
              }

              // Handle definition as an object
              return registeredExtensions.push({
                ...ag1,
                name: `${prefix}${ag1.name || integrationName}`,
              });
            },
          })
        : service;

    // Register a list of hooks in a declarative way:
    // [ { hook, handler, ... }, { ... }]
    if (
      isListOfDeclarativeActions(computed, integrationName, integrationType)
    ) {
      computed.forEach((item) =>
        registeredExtensions.push({
          ...item,
          name: `${prefix}${item.name || integrationName}`,
        }),
      );
    }

    // DEPRECATED
    // register a single action given as configuration array
    // [ hook, handler, name ]
    // [ hook, handler, { otherOptions }]
    else if (
      Array.isArray(computed) &&
      computed.length >= 2 &&
      typeof computed[0] === 'string' &&
      (typeof computed[1] === 'function' || typeof computed[1] === 'object')
    ) {
      console.warn(
        '[DEPRECATED] please use the object base declarative pattern { hook, handler, ... } - this API will be removed in v5.0.0',
      );
      const [hook, handler, options = {}] = computed;
      registeredExtensions.push({
        ...(typeof options === 'string'
          ? { name: `${prefix}${options}` }
          : {
              ...options,
              name: `${prefix}${options.name || integrationName}`,
            }),
        hook,
        // An handler could be a simple object to skip any running function
        handler: typeof handler === 'function' ? handler : () => handler,
      });
    }

    // register a single action give an a configuration object
    // { hook, handler, ... }
    // DEPRECATED: "hook" in favor for "target" - remove in v5.0.0
    else if (
      computed &&
      (computed.hook || computed.target) &&
      computed.handler
    ) {
      if (computed.hook) {
        console.warn(
          `[DEPRECATED] the key "hook" is deprecated and will be removed from v5.0.0.\nPlease use "target" instead.`,
        );
      }

      registeredExtensions.push({
        ...computed,
        name: `${prefix}${computed.name || integrationName}`,
      });
    }
  }

  // Register all the actions declared by the integrations that have been executed
  registeredExtensions.forEach(context.registerAction);
};

const objectSetter = (targetObject) => (path, value) => {
  dotted.set(targetObject, path, value);
  return true;
};

const objectGetter = (targetObject) => (path, defaultValue) => {
  let value = undefined;
  try {
    value = dotted(targetObject, path);
  } catch (err) {}

  if (value !== undefined) {
    return value;
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`path "${path}" does not exists!`);
};

const registerSettingsExtension = (buildAppSettings) => {
  registerAction({
    name: `${constants.BOOT} app/settings`,
    target: constants.SETTINGS,
    handler: async (ctx) => {
      const values = await buildAppSettings(ctx, ctx);
      values &&
        Object.keys(values).forEach((key) => ctx.setConfig(key, values[key]));
    },
  });
  return {};
};

/**
 * TODO: In v5.0.0 we can destructure the appManifest as so to provide
 *       code hints through VSCode
 * @param {} appManifest
 * @returns
 */
const createApp =
  (appManifest = {}) =>
  async () => {
    if (Array.isArray(appManifest)) {
      console.warn(
        `[DEPRECATED] The array version is deprecated and will be removed in v5.0.0.\nUse the full App Manifest definition instead.`,
      );
    }

    // accepts a single param as [] of features
    const {
      services = [],
      features = [],
      settings = {},
      context = {},
      trace = null,
    } = Array.isArray(appManifest) ? { services: appManifest } : appManifest;

    // creates initial internal settings from an object
    // or automatically register the provided settings callback
    const internalSettings =
      typeof settings === 'function'
        ? registerSettingsExtension(settings)
        : settings;

    // Context bound list of known Extensions
    const targetsRegistry = createRegistry(constants);

    // create getter and setter for the configuration
    const getConfig = (...args) => {
      try {
        return objectGetter(internalSettings)(...args);
      } catch (err) {
        throw new ForrestJSGetConfigError(err.message);
      }
    };
    const setConfig = objectSetter(internalSettings);

    // create the context with getters / setters /
    const internalContext = {
      ...context,
      ...targetsRegistry,
      registerAction,
      setConfig,
      getConfig,
      setContext: null,
      getContext: null,
      createExtension: null,
      createHook: null, // DEPRECATED: remove in v5.0.0
    };

    // provide an api to deal with the internal context
    internalContext.getContext = (...args) => {
      try {
        return objectGetter(internalContext)(...args);
      } catch (err) {
        throw new ForrestJSGetContextError(err.message);
      }
    };
    internalContext.setContext = objectSetter(internalContext);

    // createExtension scoped to the App context
    const _cs = (name, args) =>
      createExtension(name, { ...args, context: internalContext });
    _cs.sync = (name, args) => _cs(name, { args, mode: 'sync' });
    _cs.serie = (name, args) => _cs(name, { args, mode: 'serie' });
    _cs.parallel = (name, args) => _cs(name, { args, mode: 'parallel' });
    _cs.waterfall = (name, args) => _cs(name, { args, mode: 'waterfall' });
    // Inject into the App context
    internalContext.createExtension = _cs;

    // DEPRECATED: remove in v5.0.0
    internalContext.createHook = (...args) => {
      console.warn(
        `[DEPRECATED] "createHook()" will be removed from v5.0.0.\nUse "createExtension()" instead`,
      );
      return _cs(...args);
    };
    internalContext.createHook.sync = (...args) => {
      console.warn(
        `[DEPRECATED] "createHook()" will be removed from v5.0.0.\nUse "createExtension()" instead`,
      );
      return _cs.sync(...args);
    };
    internalContext.createHook.serie = (...args) => {
      console.warn(
        `[DEPRECATED] "createHook()" will be removed from v5.0.0.\nUse "createExtension()" instead`,
      );
      return _cs.serie(...args);
    };
    internalContext.createHook.parallel = (...args) => {
      console.warn(
        `[DEPRECATED] "createHook()" will be removed from v5.0.0.\nUse "createExtension()" instead`,
      );
      return _cs.parallel(...args);
    };
    internalContext.createHook.waterfall = (...args) => {
      console.warn('[DEPRECATED] createHook');
      return _cs.waterfall(...args);
    };

    // run lifecycle
    await runIntegrations(
      services,
      internalContext,
      `${constants.SERVICE} `,
      'Service',
    );
    await _cs.serie(constants.START, internalContext);
    await _cs.serie(constants.SETTINGS, internalContext);
    await runIntegrations(
      features,
      internalContext,
      `${constants.FEATURE} `,
      'Feature',
    );
    await _cs.parallel(constants.INIT_SERVICES, internalContext);
    await _cs.serie(constants.INIT_SERVICE, internalContext);
    await _cs.parallel(constants.INIT_FEATURES, internalContext);
    await _cs.serie(constants.INIT_FEATURE, internalContext);
    await _cs.parallel(constants.START_SERVICES, internalContext);
    await _cs.serie(constants.START_SERVICE, internalContext);
    await _cs.parallel(constants.START_FEATURES, internalContext);
    await _cs.serie(constants.START_FEATURE, internalContext);
    await _cs.serie(constants.FINISH, internalContext);

    // Implement trace without a Hook
    if (trace) {
      const lines = [];
      lines.push('');
      lines.push('=================');
      lines.push('Boot Trace:');
      lines.push('=================');
      lines.push('');
      switch (trace) {
        case 'full':
          lines.push(traceHook()('full')('json'));
          break;
        default:
          lines.push(traceHook()('compact')('cli').join('\n'));
          break;
      }
      lines.push('');
      lines.push('');

      console.log(lines.join('\n'));
    }

    return {
      settings: internalSettings,
      context: internalContext,
    };
  };

const startApp = ($) => {
  const app = createApp($);
  return app();
};

// DEPRECATED: remove in v5.0.0
const createHookApp = ($) => {
  console.warn(
    '[DEPRECATED] use "createApp()" instead of "createHookApp()". It will be removed in v5.0.0',
  );
  return createApp($);
};
const runHookApp = ($) => {
  console.warn(
    '[DEPRECATED] use "createApp()" instead of "runHookApp()". It will be removed in v5.0.0',
  );
  return startApp($);
};

module.exports = {
  createApp,
  startApp,
  isDeclarativeAction,
  isListOfDeclarativeActions,
  createHookApp, // DEPRECATED: remove in v5.0.0
  runHookApp, // DEPRECATED: remove in v5.0.0
};
