const onInitService = require('./init-service');
const hasuraAuthPlugin = require('./hasura-auth.plugin');

const fastifyHasuraAuth = ({ registerTargets }) => {
  registerTargets({
    HASURA_AUTH_GET: 'hasuraAuth/get',
    HASURA_AUTH_POST: 'hasuraAuth/post',
    HASURA_AUTH_FASTIFY: 'hasuraAuth/fastify',
  });

  return [
    {
      trace: __filename,
      target: '$INIT_SERVICES',
      handler: onInitService,
    },
    {
      trace: __filename,
      target: '$FASTIFY_PLUGIN?',
      handler: ({ registerPlugin }, { getContext, createExtension }) => {
        const options = getContext('hasuraAuth');
        registerPlugin(hasuraAuthPlugin, {
          ...options,
          createExtension,
        });
      },
    },
  ];
};

module.exports = fastifyHasuraAuth;
