import { GrammyError, HttpError } from "grammy";
import { describe, expect, it } from "vitest";
import { OllamaError } from "./ai/ollamaClient.ts";
import { describeError } from "./errors.ts";

describe("describeError", () => {
  it("summarizes Telegram API rejections", () => {
    const error = new GrammyError(
      "Call to 'sendMessage' failed!",
      { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" },
      "sendMessage",
      { chat_id: 1, text: "rahasia user" },
    );

    const summary = describeError(error);
    expect(summary).toBe("Telegram API error 403 in sendMessage: Forbidden: bot was blocked by the user");
    // Isi pesan (payload) tidak ikut di-log.
    expect(summary).not.toContain("rahasia user");
  });

  it("summarizes network failures without the underlying error details", () => {
    const cause = new Error("connect ECONNREFUSED https://api.telegram.org/bot123456:TEST-token/sendMessage");
    const error = new HttpError("Network request for 'sendMessage' failed!", cause);

    const summary = describeError(error);
    expect(summary).toBe("Network error while contacting Telegram: Network request for 'sendMessage' failed!");
    expect(summary).not.toContain("TEST-token");
  });

  it("includes the kind of an Ollama error", () => {
    expect(describeError(new OllamaError("timeout", "Ollama did not respond within 1000 ms"))).toBe(
      "Ollama error (timeout): Ollama did not respond within 1000 ms",
    );
  });

  it("handles non-Error values", () => {
    expect(describeError("oops")).toBe("Unknown error: oops");
  });
});
