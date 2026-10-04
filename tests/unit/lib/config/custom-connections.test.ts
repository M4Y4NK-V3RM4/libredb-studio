import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  CUSTOM_CONNECTIONS_DISABLED_MESSAGE,
  customConnectionsAllowed,
  resetCustomConnectionsWarning,
} from "@/lib/config/custom-connections";
import { logger } from "@/lib/logger";

const original = process.env.ALLOW_CUSTOM_CONNECTIONS;

beforeEach(() => {
  delete process.env.ALLOW_CUSTOM_CONNECTIONS;
  resetCustomConnectionsWarning();
});

afterEach(() => {
  if (original === undefined) delete process.env.ALLOW_CUSTOM_CONNECTIONS;
  else process.env.ALLOW_CUSTOM_CONNECTIONS = original;
  resetCustomConnectionsWarning();
});

describe("customConnectionsAllowed", () => {
  test("allows custom connections when the variable is unset, empty or blank", () => {
    expect(customConnectionsAllowed()).toBe(true);
    process.env.ALLOW_CUSTOM_CONNECTIONS = "";
    expect(customConnectionsAllowed()).toBe(true);
    process.env.ALLOW_CUSTOM_CONNECTIONS = "   ";
    expect(customConnectionsAllowed()).toBe(true);
  });

  test.each(["false", "FALSE", " False ", "0", "off", "OFF", "no", " No "])(
    "%s switches custom connections off",
    (value) => {
      process.env.ALLOW_CUSTOM_CONNECTIONS = value;

      expect(customConnectionsAllowed()).toBe(false);
    },
  );

  test.each(["true", "TRUE", "1", "on", "yes", " Yes "])("%s keeps them on without a warning", (value) => {
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      process.env.ALLOW_CUSTOM_CONNECTIONS = value;

      expect(customConnectionsAllowed()).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test("an unrecognised value keeps them on and warns once per process, naming the value", () => {
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    try {
      process.env.ALLOW_CUSTOM_CONNECTIONS = "flase";

      expect(customConnectionsAllowed()).toBe(true);
      expect(customConnectionsAllowed()).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        'Unrecognized ALLOW_CUSTOM_CONNECTIONS value "flase"; custom connections stay allowed (use "false" to disable them)',
        { route: "custom-connections" },
      );
    } finally {
      warn.mockRestore();
    }
  });

  test("is read on every call, so a changed environment is answered at once", () => {
    expect(customConnectionsAllowed()).toBe(true);
    process.env.ALLOW_CUSTOM_CONNECTIONS = "off";
    expect(customConnectionsAllowed()).toBe(false);
    delete process.env.ALLOW_CUSTOM_CONNECTIONS;
    expect(customConnectionsAllowed()).toBe(true);
  });

  test("names the refusal in the sentence the API contract fixes", () => {
    expect(CUSTOM_CONNECTIONS_DISABLED_MESSAGE).toBe("Custom connections are disabled on this server");
  });
});
