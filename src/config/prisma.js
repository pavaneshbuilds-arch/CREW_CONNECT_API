import { PrismaClient } from '@prisma/client';
import config from './env.js';
import logger from '../utils/logger.js';

function isStalePreparedStatement(error) {
  const message = String(error?.message || '');
  return message.includes('cached plan must not change result type');
}

const base = new PrismaClient({
  log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

// After ALTER COLUMN (e.g. varchar → text), existing connections keep a prepared
// statement that no longer matches. Reconnect once and retry instead of 500ing.
export const prisma = base.$extends({
  query: {
    $allOperations: async ({ args, query }) => {
      try {
        return await query(args);
      } catch (error) {
        if (!isStalePreparedStatement(error)) throw error;
        logger.warn('Postgres prepared statement cache is stale after a schema change; reconnecting');
        await base.$disconnect();
        await base.$connect();
        return query(args);
      }
    },
  },
});

export async function connectPostgres() {
  await prisma.$connect();
  logger.info('PostgreSQL (Prisma) connected');
}

export async function disconnectPostgres() {
  await prisma.$disconnect();
  logger.info('PostgreSQL (Prisma) disconnected');
}
