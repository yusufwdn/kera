import { describe, expect, it } from "vitest";
import { buildEchoReply, TELEGRAM_MESSAGE_LIMIT } from "./handlers.ts";

describe("buildEchoReply", () => {
  it("prefixes short text", () => {
    expect(buildEchoReply("halo")).toBe("Kamu bilang: halo");
  });

  it("keeps the reply within Telegram's message limit for maximum-length input", () => {
    const reply = buildEchoReply("a".repeat(TELEGRAM_MESSAGE_LIMIT));
    expect(Array.from(reply)).toHaveLength(TELEGRAM_MESSAGE_LIMIT);
    expect(reply.endsWith("...")).toBe(true);
  });

  it("does not split emoji when truncating", () => {
    const reply = buildEchoReply("\u{1F600}".repeat(TELEGRAM_MESSAGE_LIMIT));
    // Karakter U+FFFD muncul kalau surrogate pair terbelah dan di-encode ulang.
    expect(Buffer.from(reply, "utf8").toString("utf8")).not.toContain(String.fromCodePoint(0xfffd));
    expect(Array.from(reply).length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
  });
});
