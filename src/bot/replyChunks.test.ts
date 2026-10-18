import { describe, expect, it } from "vitest";
import { splitMessage, TELEGRAM_MESSAGE_LIMIT } from "./replyChunks.ts";

describe("splitMessage", () => {
  it("keeps short text as a single chunk", () => {
    expect(splitMessage("halo")).toEqual(["halo"]);
  });

  it("returns no chunks for empty text", () => {
    expect(splitMessage("   ")).toEqual([]);
  });

  it("prefers to split at a newline", () => {
    expect(splitMessage("satu dua\ntiga empat", 12)).toEqual(["satu dua", "tiga empat"]);
  });

  it("falls back to splitting at a space", () => {
    expect(splitMessage("satu dua tiga empat", 10)).toEqual(["satu dua", "tiga empat"]);
  });

  it("hard-cuts a word longer than the limit", () => {
    expect(splitMessage("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("never produces a chunk above Telegram's limit and loses no words", () => {
    const words = Array.from({ length: 3000 }, (_, i) => `kata${i}`);
    const chunks = splitMessage(words.join(" "));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Array.from(chunk).length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    }
    expect(chunks.join(" ").split(" ")).toEqual(words);
  });

  it("does not split emoji", () => {
    const chunks = splitMessage("\u{1F600}".repeat(5), 2);
    expect(chunks).toEqual(["\u{1F600}\u{1F600}", "\u{1F600}\u{1F600}", "\u{1F600}"]);
  });
});
