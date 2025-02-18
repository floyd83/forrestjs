/**
 * You must provide a running PostgreSQL db to connect to:
 * PGSTRING=postgres://username:password@hostname:port/db
 * PGSTRING=postgres://postgres:postgres@localhost:5432/postgres
 */

const forrestjs = require('@forrestjs/core');
const serviceLogger = require('@forrestjs/service-logger');
const serviceJwt = require('@forrestjs/service-jwt');
const serviceFetchq = require('@forrestjs/service-fetchq');
const serviceFastify = require('@forrestjs/service-fastify');
const serviceFastifyHealthz = require('@forrestjs/service-fastify-healthz');

const featureHome = require('./feature-home');
const featureQ1 = require('./feature-q1');

forrestjs({
  trace: 'compact',
  settings: {
    fetchq: {
      logLevel: 'error',
      pool: { max: 1 },
    },
  },
  services: [
    serviceLogger,
    serviceJwt,
    serviceFetchq, // The order is not important
    serviceFastify,
    serviceFastifyHealthz,
  ],
  features: [featureHome, featureQ1],
}).catch((err) => console.error(err));
