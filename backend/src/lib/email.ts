import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Outgoing email, sent through Resend's HTTP API (https://resend.com).
 *
 * Deliberately tiny: one `sendEmail` function and no SDK dependency —
 * Resend's API is a single JSON POST, and `fetch` is built into Node.
 * The API key is read from `RESEND_API_KEY` (server only, never sent to a
 * browser, never logged); with no key set, the API still boots and
 * `isEmailConfigured()` lets callers skip sending instead of failing.
 *
 * Until the shop's own domain is verified in Resend, mail goes out from
 * Resend's shared `onboarding@resend.dev` address, which Resend only
 * delivers to the Resend account owner's own inbox. That is exactly
 * enough for the owner's order alerts; customer-facing mail needs the
 * verified domain and `EMAIL_FROM` set to an address on it. See
 * docs/EMAIL-SETUP.md.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
/** Resend answers in well under a second; anything slower is a problem. */
const SEND_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body — always required so every mail client can read it. */
  text: string;
  html?: string;
}

export interface EmailSenderOptions {
  apiKey: string | undefined;
  from: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export class EmailNotConfiguredError extends Error {}
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

/** True when an API key is set, i.e. `sendEmail` can actually send. */
export function isEmailConfigured(): boolean {
  return env.hasEmail;
}

/**
 * Builds a sender bound to one API key / from-address. Exported so tests
 * can exercise the request shape against a fake `fetch` without any key
 * in the environment; everything else should use `sendEmail` below.
 *
 * Resolves to Resend's id for the sent message. Throws
 * `EmailNotConfiguredError` with no key, `EmailSendError` when Resend
 * rejects the request, and whatever `fetch` throws on a network failure.
 */
export function createEmailSender(options: EmailSenderOptions) {
  const doFetch = options.fetchImpl ?? fetch;

  return async function send(message: EmailMessage): Promise<{ id: string }> {
    if (!options.apiKey) {
      throw new EmailNotConfiguredError("RESEND_API_KEY is not set. See docs/EMAIL-SETUP.md.");
    }

    const response = await doFetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: options.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;

    if (!response.ok) {
      // Resend's error body is safe to log: it describes the request
      // (bad address, unverified domain), never the key.
      throw new EmailSendError(body?.message || `Resend responded with HTTP ${response.status}.`, response.status);
    }
    if (!body?.id) {
      throw new EmailSendError("Resend responded without a message id.", response.status);
    }

    logger.info({ to: message.to, subject: message.subject, emailId: body.id }, "email sent");
    return { id: body.id };
  };
}

export const sendEmail = createEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
