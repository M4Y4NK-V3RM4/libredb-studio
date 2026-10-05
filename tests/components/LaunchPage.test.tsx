import "../setup-dom";
import React from "react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { withBasePathEnv } from "../helpers/base-path";
import LaunchPage from "@/app/launch/page";
import { readLaunchToken } from "@/app/launch/launch-client";

// Any text: the page posts it without reading it. A named placeholder, so secret scanners do not read it as a token.
const TOKEN = "header.payload.signature";

interface LocationMock {
  hash: string;
  pathname: string;
  search: string;
  replace: ReturnType<typeof mock>;
}

const savedLocation = Object.getOwnPropertyDescriptor(window, "location");
let location: LocationMock;
let order: string[];
let replaceState: ReturnType<typeof spyOn>;

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function serve(response: () => Promise<Response>): ReturnType<typeof mock> {
  const fetchMock = mock(async () => {
    order.push("fetch");
    return response();
  });
  globalThis.fetch = fetchMock as never;
  return fetchMock;
}

beforeEach(() => {
  order = [];
  location = { hash: `#token=${TOKEN}`, pathname: "/launch", search: "", replace: mock(() => {}) };
  Object.defineProperty(window, "location", { value: location, writable: true, configurable: true });
  replaceState = spyOn(window.history, "replaceState").mockImplementation(() => {
    order.push("replaceState");
  });
});

afterEach(() => {
  cleanup();
  replaceState.mockRestore();
  if (savedLocation) Object.defineProperty(window, "location", savedLocation);
});

describe("readLaunchToken", () => {
  test("reads the token of a #token= fragment and nothing else", () => {
    expect(readLaunchToken(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(readLaunchToken(`token=${TOKEN}`)).toBe(TOKEN);
    expect(readLaunchToken("")).toBeNull();
    expect(readLaunchToken("#token=")).toBeNull();
    expect(readLaunchToken("#other=1")).toBeNull();
  });
});

describe("the /launch page", () => {
  test("removes the fragment before it posts the token, then replaces itself with the redirect", async () => {
    const fetchMock = serve(async () => answer(200, { success: true, redirect: "/?connection=seed%3Aorders-db" }));
    render(<LaunchPage />);

    await waitFor(() => expect(location.replace).toHaveBeenCalledTimes(1));
    expect(location.replace).toHaveBeenCalledWith("/?connection=seed%3Aorders-db");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/launch");
    expect(order).toEqual(["replaceState", "fetch"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/launch");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ token: TOKEN });
  });

  test("keeps the base path on both the request and the redirect", async () => {
    await withBasePathEnv("/tools/libredb", async () => {
      location.pathname = "/tools/libredb/launch";
      const fetchMock = serve(async () => answer(200, { success: true, redirect: "/" }));
      render(<LaunchPage />);
      await waitFor(() => expect(location.replace).toHaveBeenCalledWith("/tools/libredb/"));
      expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/tools/libredb/api/auth/launch");
      expect(replaceState).toHaveBeenCalledWith(null, "", "/tools/libredb/launch");
    });
  });

  test("shows the route's refusal and a way to sign in, and stays on the page", async () => {
    serve(async () =>
      answer(401, {
        success: false,
        message: "This launch link has already been used. Open Studio again to get a new one.",
      }),
    );
    const view = render(<LaunchPage />);

    expect(await view.findByText("The launch link did not sign you in")).not.toBeNull();
    expect(
      view.getByText("This launch link has already been used. Open Studio again to get a new one."),
    ).not.toBeNull();
    expect(view.getByRole("link", { name: "Go to sign in" }).getAttribute("href")).toBe("/login");
    expect(location.replace).not.toHaveBeenCalled();
  });

  test("shows the error of an answer the route itself did not write, such as the rate limit", async () => {
    serve(async () => answer(429, { error: "Too many requests. Try again in 42 seconds.", code: "RATE_LIMITED" }));
    const view = render(<LaunchPage />);
    expect(await view.findByText("Too many requests. Try again in 42 seconds.")).not.toBeNull();
  });

  test("names the failure when an answer carries neither a redirect nor a reason", async () => {
    serve(async () => answer(200, { success: true }));
    const view = render(<LaunchPage />);
    expect(await view.findByText("Studio could not sign you in with this launch link.")).not.toBeNull();
    expect(location.replace).not.toHaveBeenCalled();
  });

  test("says Studio could not be reached when the request or its body fails", async () => {
    serve(async () => {
      throw new TypeError("Failed to fetch");
    });
    const unreachable = render(<LaunchPage />);
    expect(
      await unreachable.findByText(
        "Studio could not be reached to finish signing you in. Open Studio again from the platform.",
      ),
    ).not.toBeNull();
    cleanup();

    serve(async () => new Response("<html>gateway error</html>", { status: 502 }));
    const garbled = render(<LaunchPage />);
    expect(
      await garbled.findByText(
        "Studio could not be reached to finish signing you in. Open Studio again from the platform.",
      ),
    ).not.toBeNull();
  });

  test("without a token in the fragment posts nothing and says so", async () => {
    location.hash = "";
    const fetchMock = serve(async () => answer(200, { success: true, redirect: "/" }));
    const view = render(<LaunchPage />);
    expect(
      await view.findByText(
        "This address carries no launch token. Open Studio again from the platform that sent you, or sign in with your password.",
      ),
    ).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  test("exchanges the token once even when React runs the effect twice", async () => {
    const fetchMock = serve(async () => answer(200, { success: true, redirect: "/" }));
    render(
      <React.StrictMode>
        <LaunchPage />
      </React.StrictMode>,
    );
    await waitFor(() => expect(location.replace).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("shows a pending line while the exchange is in flight", () => {
    serve(() => new Promise<Response>(() => {}));
    const view = render(<LaunchPage />);
    expect(view.getByText("Signing you in to LibreDB Studio...")).not.toBeNull();
  });
});

describe("the /launch page in a browser signed in as someone else", () => {
  const CONFLICT = {
    success: false,
    message:
      "This browser is already signed in to Studio as ada@example.com, and this launch link is for bob@example.com.",
    signedInAs: "ada@example.com",
    launchFor: "bob@example.com",
  };

  function serveConflict(logout: () => Promise<Response>): ReturnType<typeof mock> {
    const fetchMock = mock(async (url: string) =>
      String(url).endsWith("/api/auth/logout") ? logout() : answer(409, CONFLICT),
    );
    globalThis.fetch = fetchMock as never;
    return fetchMock;
  }

  test("names both accounts, keeps the session and offers a sign-out", async () => {
    serveConflict(async () => answer(200, { success: true }));
    const view = render(<LaunchPage />);
    expect(await view.findByText("You are already signed in to Studio")).not.toBeNull();
    expect(
      view.getByText(
        "This browser is signed in as ada@example.com, and the launch link was for bob@example.com. A launch link works once, so this one is used up.",
      ),
    ).not.toBeNull();
    expect(
      view.getByText("Sign out, then open Studio again from the platform to continue as bob@example.com."),
    ).not.toBeNull();
    expect(view.getByRole("button", { name: "Sign out" })).not.toBeNull();
    expect(view.getByRole("link", { name: "Stay signed in as ada@example.com" }).getAttribute("href")).toBe("/");
    expect(location.replace).not.toHaveBeenCalled();
  });

  test("signs out on request and says how to continue as the launched account", async () => {
    const fetchMock = serveConflict(async () => answer(200, { success: true }));
    const view = render(<LaunchPage />);
    fireEvent.click(await view.findByRole("button", { name: "Sign out" }));
    expect(
      await view.findByText("You are signed out. Open Studio again from the platform to continue as bob@example.com."),
    ).not.toBeNull();
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/logout");
    expect(init.method).toBe("POST");
  });

  test("says so when the sign-out fails, and keeps the way back to the editor", async () => {
    serveConflict(async () => {
      throw new TypeError("Failed to fetch");
    });
    const view = render(<LaunchPage />);
    fireEvent.click(await view.findByRole("button", { name: "Sign out" }));
    expect(
      await view.findByText(
        "Studio could not sign you out. Sign out from the editor, then open Studio again from the platform.",
      ),
    ).not.toBeNull();
    expect(view.getByRole("link", { name: "Stay signed in as ada@example.com" })).not.toBeNull();
  });
});
