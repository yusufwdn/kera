import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./env.ts";

// Token palsu dengan format yang benar. Bukan token asli.
const VALID_TOKEN = "123456:ABC-def_123";

// Panggil loadConfig dan kembalikan ConfigError yang dilempar.
// Gagal (throw) kalau loadConfig tidak melempar ConfigError, supaya test tidak lolos diam-diam.
function expectConfigError(env: NodeJS.ProcessEnv): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected loadConfig to throw ConfigError");
}

describe("loadConfig", () => {
  it("parses a valid token and comma-separated user IDs", () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: VALID_TOKEN,
      ALLOWED_USER_IDS: "111, 222,333",
    });

    expect(config.telegramBotToken).toBe(VALID_TOKEN);
    expect([...config.allowedUserIds]).toEqual([111, 222, 333]);
  });

  it("trims whitespace around the token", () => {
    const config = loadConfig({ TELEGRAM_BOT_TOKEN: `  ${VALID_TOKEN}  ` });
    expect(config.telegramBotToken).toBe(VALID_TOKEN);
  });

  it("treats a missing or empty allowlist as 'nobody allowed'", () => {
    expect(loadConfig({ TELEGRAM_BOT_TOKEN: VALID_TOKEN }).allowedUserIds.size).toBe(0);
    expect(
      loadConfig({ TELEGRAM_BOT_TOKEN: VALID_TOKEN, ALLOWED_USER_IDS: " , " }).allowedUserIds.size,
    ).toBe(0);
  });

  it("rejects a missing token", () => {
    const error = expectConfigError({});
    expect(error.problems).toEqual(["TELEGRAM_BOT_TOKEN: is required"]);
  });

  it("rejects an empty token", () => {
    const error = expectConfigError({ TELEGRAM_BOT_TOKEN: "   " });
    expect(error.problems).toContain("TELEGRAM_BOT_TOKEN: is required");
  });

  it("rejects a malformed token without leaking its value", () => {
    const secretLooking = "not-a-real-token-value";
    const error = expectConfigError({ TELEGRAM_BOT_TOKEN: secretLooking });

    expect(error.problems).toEqual([
      "TELEGRAM_BOT_TOKEN: does not look like a token from @BotFather",
    ]);
    expect(error.message).not.toContain(secretLooking);
  });

  it.each(["abc", "-5", "0", "1.5", "1e5", "0x10", "99999999999999999999"])(
    "rejects invalid user ID %s",
    (badId) => {
      const error = expectConfigError({
        TELEGRAM_BOT_TOKEN: VALID_TOKEN,
        ALLOWED_USER_IDS: `111,${badId}`,
      });
      expect(error.problems).toEqual([
        `ALLOWED_USER_IDS: "${badId}" is not a valid Telegram user ID`,
      ]);
    },
  );

  it("reports every problem at once", () => {
    const error = expectConfigError({ ALLOWED_USER_IDS: "abc" });
    expect(error.problems).toHaveLength(2);
  });
});

describe("loadConfig: Ollama settings", () => {
  it("uses defaults when Ollama variables are missing", () => {
    expect(loadConfig({ TELEGRAM_BOT_TOKEN: VALID_TOKEN }).ollama).toEqual({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:4b-instruct",
      think: false,
      timeoutMs: 120_000,
    });
  });

  it("uses defaults when Ollama variables are present but empty", () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: VALID_TOKEN,
      OLLAMA_BASE_URL: "",
      OLLAMA_MODEL: "",
      OLLAMA_THINK: "",
      OLLAMA_TIMEOUT_MS: "",
    });
    expect(config.ollama.model).toBe("qwen3:4b-instruct");
    expect(config.ollama.timeoutMs).toBe(120_000);
  });

  it("reads custom values", () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: VALID_TOKEN,
      OLLAMA_BASE_URL: "http://localhost:11434/",
      OLLAMA_MODEL: " qwen3:4b ",
      OLLAMA_THINK: "true",
      OLLAMA_TIMEOUT_MS: "5000",
    });
    expect(config.ollama).toEqual({
      baseUrl: "http://localhost:11434",
      model: "qwen3:4b",
      think: true,
      timeoutMs: 5000,
    });
  });

  it('parses OLLAMA_THINK="false" as false', () => {
    const config = loadConfig({ TELEGRAM_BOT_TOKEN: VALID_TOKEN, OLLAMA_THINK: "false" });
    expect(config.ollama.think).toBe(false);
  });

  it.each([
    ["OLLAMA_BASE_URL", "localhost:11434"],
    ["OLLAMA_BASE_URL", "ftp://127.0.0.1"],
    ["OLLAMA_THINK", "yes"],
    ["OLLAMA_TIMEOUT_MS", "abc"],
    ["OLLAMA_TIMEOUT_MS", "500"],
    ["OLLAMA_TIMEOUT_MS", "999999"],
  ])("rejects %s=%s", (variable, value) => {
    const error = expectConfigError({ TELEGRAM_BOT_TOKEN: VALID_TOKEN, [variable]: value });
    expect(error.problems).toHaveLength(1);
    expect(error.problems[0]).toMatch(new RegExp(`^${variable}: `));
  });
});
