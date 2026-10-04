import { logger } from "@/lib/logger";

/**
 * Whether a signed-in session may open a database connection it supplies itself
 * (`ALLOW_CUSTOM_CONNECTIONS`), rather than only the connections the operator seeded.
 *
 * WHY A SWITCH. Studio connects from wherever it runs, so a connection a user types in reaches
 * every host that network reaches. On a laptop that is the user's own business. In a container
 * that shares an overlay network with other services, a platform's or a cluster namespace's, it
 * is a pivot: any account that can sign in can open a connection to the platform's own database
 * or its control plane by service name. An operator who seeds every database the users need
 * switches custom connections off and closes that path on the server.
 *
 * Read on every call, never cached, so a test or a supervisor that changes the environment is
 * answered at once. Spellings follow the product's other flags: unset or empty is the default
 * (on); "false", "0", "off" and "no", trimmed and in any letter case, switch it off; "true", "1",
 * "on" and "yes" keep it on. Anything else keeps it on and warns once per process, so a typo is
 * visible in the log instead of silently leaving the switch where the operator did not mean it.
 *
 * The rule is enforced in `resolveConnection` (`src/lib/seed/resolve-connection.ts`), the one
 * place an inline connection becomes a provider's input; `GET /api/connections/policy` reports it
 * to the editor so the editor stops offering what the server would refuse.
 */

/** The sentence every refusal carries, on every route that builds a provider. */
export const CUSTOM_CONNECTIONS_DISABLED_MESSAGE = "Custom connections are disabled on this server";

const DISABLED_VALUES = new Set(["false", "0", "off", "no"]);
const ENABLED_VALUES = new Set(["true", "1", "on", "yes"]);

// resolveConnection runs on every request that carries an inline connection, so an unrecognised
// value must warn at most once per process rather than once per request.
let unrecognizedValueWarned = false;

/** Test seam: clears the warn-once latch so each case observes a fresh process. */
export function resetCustomConnectionsWarning(): void {
  unrecognizedValueWarned = false;
}

// One template literal, never a concatenation across lines: bun's line coverage under-counts
// the continuation lines of a message built that way.
const unrecognizedValueMessage = (raw: string): string =>
  `Unrecognized ALLOW_CUSTOM_CONNECTIONS value "${raw}"; custom connections stay allowed (use "false" to disable them)`;

export function customConnectionsAllowed(): boolean {
  const raw = process.env.ALLOW_CUSTOM_CONNECTIONS ?? "";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "" || ENABLED_VALUES.has(normalized)) return true;
  if (DISABLED_VALUES.has(normalized)) return false;
  if (!unrecognizedValueWarned) {
    unrecognizedValueWarned = true;
    logger.warn(unrecognizedValueMessage(raw), { route: "custom-connections" });
  }
  return true;
}
