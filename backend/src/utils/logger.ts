import { pino } from "pino";
import { env } from "../config/env.js";

/**
 * Structured logger.
 *
 * `redact` is the important part: these paths are stripped before anything
 * is written, so a stray `logger.info({ req })` can never dump a customer's
 * session token or a payment secret into the log files.
 */
export const logger = pino({
  level: env.isTest ? "silent" : env.LOG_LEVEL,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "res.headers['set-cookie']",
      "*.password",
      "*.passwordConfirm",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.secret",
      "*.apiKey",
      "*.card",
      "*.cvv",
      "*.signature",
      "password",
      "token",
      "secret",
    ],
    censor: "[redacted]",
  },
  ...(env.isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }),
});
