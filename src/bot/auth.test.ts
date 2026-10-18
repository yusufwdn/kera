import { describe, expect, it } from "vitest";
import { isUserAllowed } from "./auth.ts";

describe("isUserAllowed", () => {
  const allowlist = new Set([111, 222]);

  it("allows a user on the allowlist", () => {
    expect(isUserAllowed(111, allowlist)).toBe(true);
  });

  it("rejects a user not on the allowlist", () => {
    expect(isUserAllowed(333, allowlist)).toBe(false);
  });

  it("rejects updates without a sender", () => {
    expect(isUserAllowed(undefined, allowlist)).toBe(false);
  });

  it("rejects everyone when the allowlist is empty", () => {
    expect(isUserAllowed(111, new Set())).toBe(false);
  });
});
