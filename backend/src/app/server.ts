import { createApp } from "./app.js";
import { env } from "../config/env.js";
import { closeDatabase } from "../db/client.js";
import { logger } from "../utils/logger.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Shafaaf Perfumes API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
});

/**
 * Graceful shutdown: stop accepting new connections and let in-flight
 * requests finish, so a deploy never cuts off a customer mid-checkout.
 */
function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down`);

  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Error during shutdown");
      process.exit(1);
    }
    // Close the database pool last, once no request can still need it.
    await closeDatabase().catch((closeError) => {
      logger.error({ err: closeError }, "Error closing the database pool");
    });
    logger.info("Shutdown complete");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception, exiting");
  process.exit(1);
});
