"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { appFetch, withBasePath } from "@/lib/config/base-path";

const NO_TOKEN =
  "This address carries no launch token. Open Studio again from the platform that sent you, or sign in with your password.";
const UNREACHABLE = "Studio could not be reached to finish signing you in. Open Studio again from the platform.";
const REFUSED = "Studio could not sign you in with this launch link.";
const SIGN_OUT_FAILED =
  "Studio could not sign you out. Sign out from the editor, then open Studio again from the platform.";

/** The token of a `#token=<jws>` fragment, or null when the fragment carries none. */
export function readLaunchToken(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#/, "")).get("token") || null;
}

interface LaunchAnswer {
  success?: boolean;
  redirect?: unknown;
  message?: string;
  error?: string;
  signedInAs?: unknown;
  launchFor?: unknown;
}

interface Conflict {
  signedInAs: string;
  launchFor: string;
}

type Outcome = { redirect: string } | { failure: string } | { conflict: Conflict };

/**
 * Posts the token to the launch route on this origin. `message` is the route's own refusal; `error` is what
 * refuses a request before or without reaching it, the proxy's Origin check and the shared 429 envelope, as
 * the login form reads them.
 */
async function exchange(token: string): Promise<Outcome> {
  let response: Response;
  let body: LaunchAnswer;
  try {
    response = await appFetch("/api/auth/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    body = (await response.json()) as LaunchAnswer;
  } catch {
    return { failure: UNREACHABLE };
  }
  if (response.ok && body.success === true && typeof body.redirect === "string") return { redirect: body.redirect };
  // The route's answer when this browser is signed in as someone else: it names both accounts.
  if (response.status === 409 && typeof body.signedInAs === "string" && typeof body.launchFor === "string") {
    return { conflict: { signedInAs: body.signedInAs, launchFor: body.launchFor } };
  }
  return { failure: body.message || body.error || REFUSED };
}

/**
 * A launch for another account than the one this browser is signed in as (docs/LAUNCH.md). The route kept
 * the session and spent the token, so this names both accounts and offers the two ways on: stay, or sign out
 * and launch again from the platform. Nothing here signs anyone in.
 */
function SessionConflict({ signedInAs, launchFor }: Conflict) {
  const [state, setState] = useState<"asking" | "signed-out" | "failed">("asking");

  async function signOut() {
    const response = await appFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setState(response?.ok ? "signed-out" : "failed");
  }

  return (
    <>
      <h1 className="mb-2 text-xl font-semibold">You are already signed in to Studio</h1>
      <p className="mb-2 text-sm text-fg-tertiary">
        {`This browser is signed in as ${signedInAs}, and the launch link was for ${launchFor}. A launch link works once, so this one is used up.`}
      </p>
      {state === "signed-out" ? (
        <p className="text-sm text-fg-tertiary">
          {`You are signed out. Open Studio again from the platform to continue as ${launchFor}.`}
        </p>
      ) : (
        <>
          <p className="mb-6 text-sm text-fg-tertiary">
            {state === "failed"
              ? SIGN_OUT_FAILED
              : `Sign out, then open Studio again from the platform to continue as ${launchFor}.`}
          </p>
          <div className="flex items-center justify-center gap-3">
            {state === "asking" && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-lg bg-brand-solid px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-solid-active"
              >
                Sign out
              </button>
            )}
            <Link href="/" className="text-sm text-fg-tertiary underline">
              {`Stay signed in as ${signedInAs}`}
            </Link>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Reads the launch token from the fragment, removes it from the address bar and the history entry before
 * anything else happens, exchanges it, and replaces this page with the editor. The ref keeps the exchange to
 * one per page load: the token is single use, and React's development double effect would otherwise spend it
 * and then report the second exchange as a replay.
 */
export default function LaunchClient() {
  const [failure, setFailure] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = readLaunchToken(window.location.hash);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void (async () => {
      const outcome: Outcome = token === null ? { failure: NO_TOKEN } : await exchange(token);
      if ("redirect" in outcome) window.location.replace(withBasePath(outcome.redirect));
      else if ("conflict" in outcome) setConflict(outcome.conflict);
      else setFailure(outcome.failure);
    })();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface text-fg">
      <div className="max-w-md px-6 text-center" aria-live="polite">
        {conflict !== null ? (
          <SessionConflict {...conflict} />
        ) : failure === null ? (
          <p className="text-sm text-fg-tertiary">Signing you in to LibreDB Studio...</p>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-semibold">The launch link did not sign you in</h1>
            <p className="mb-6 text-sm text-fg-tertiary">{failure}</p>
            <Link
              href="/login"
              className="rounded-lg bg-brand-solid px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-solid-active"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
