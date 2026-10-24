import { app } from './app';
import { config } from './config/env';
import { prisma } from './db/prisma';
import { logger } from './utils/logger.util';

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info(`MessageFlow API server started on port ${config.port} [env: ${config.nodeEnv}]`);
});

async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await prisma.$disconnect();
    logger.info('Database connection closed.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forcefully terminating process after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
