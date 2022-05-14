/**
 * Extends `process.env` with informations from local files:
 *
 * .env
 * .env.local
 * .env.[development|production|...]
 * .env.[development|production|...].local
 *
 */

const { SERVICE_NAME, ...targets } = require('./targets');
const { initEnv } = require('./init-env');

module.exports = ({ registerTargets, registerExtension }) => {
  registerTargets(targets);

  registerExtension({
    target: '$START',
    name: SERVICE_NAME,
    trace: __filename,
    handler: initEnv,
  });

  // Fastify Integration (optional action)
  registerExtension({
    target: '$FASTIFY_PLUGIN?',
    name: SERVICE_NAME,
    trace: __filename,
    handler: ({ decorate, decorateRequest }, { getContext }) => {
      const getEnv = getContext('getEnv');
      decorate('getEnv', getEnv);
      decorateRequest('getEnv', getEnv);
    },
  });
};
