import type { Update, UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";
import type { Assistant } from "../ai/assistant.ts";
import { OllamaError } from "../ai/ollamaClient.ts";
import { createBot } from "./createBot.ts";
import type { Logger } from "./logger.ts";

// Test integrasi createBot tanpa jaringan.
// Update palsu disuntikkan dengan bot.handleUpdate(), setiap panggilan ke Telegram
// dicegat oleh API transformer, dan assistant diganti versi palsu.
// Yang TIDAK diverifikasi di sini: koneksi asli ke Telegram, validitas token, bentuk
// update asli dari server, dan jawaban model asli. Itu dicek lewat uji manual
// (milestone-01.md dan milestone-02.md) dan ollamaClient.integration.test.ts.

const OWNER_ID = 111;
const STRANGER_ID = 999;

// Info bot palsu. Biasanya didapat dari getMe saat bot.init(); diisi manual
// supaya bot tidak perlu menghubungi Telegram.
const fakeBotInfo = {
  id: 42,
  is_bot: true,
  first_name: "Kera",
  username: "kera_test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as UserFromGetMe;

type ApiCall = { method: string; payload: Record<string, unknown> };

type SetupOptions = {
  // Membuat setiap panggilan API Telegram melempar error ini.
  failWith?: Error;
  // Perilaku assistant palsu: string = jawaban, Error = dilempar.
  assistantResult?: string | Error;
};

// Buat bot untuk test beserta rekaman panggilan API, log, dan pesan yang diterima assistant.
function setup(options: SetupOptions = {}) {
  const calls: ApiCall[] = [];
  const logs: { level: keyof Logger; message: string }[] = [];
  const assistantInputs: string[] = [];
  const assistantChatIds: number[] = [];
  const resetChatIds: number[] = [];

  const logger: Logger = {
    info: (message: string) => logs.push({ level: "info", message }),
    warn: (message: string) => logs.push({ level: "warn", message }),
    error: (message: string) => logs.push({ level: "error", message }),
  };

  const assistant: Assistant = {
    async reply(chatId, userText) {
      assistantChatIds.push(chatId);
      assistantInputs.push(userText);
      const result = options.assistantResult ?? `jawaban untuk: ${userText}`;
      if (result instanceof Error) {
        throw result;
      }
      return { text: result, promptTokens: 42, historyTurns: 3 };
    },
    async resetConversation(chatId) {
      resetChatIds.push(chatId);
    },
  };

  const bot = createBot(
    { token: "123456:TEST-token", allowedUserIds: new Set([OWNER_ID]), assistant, logger },
    { botInfo: fakeBotInfo },
  );

  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (options.failWith) {
      throw options.failWith;
    }
    // Jawaban sukses minimal. Handler tidak memakai isi result.
    return { ok: true, result: true as never };
  });

  const sentTexts = () => calls.filter((c) => c.method === "sendMessage").map((c) => String(c.payload.text));
  const logsAt = (level: keyof Logger) => logs.filter((l) => l.level === level);

  return { bot, calls, logs, assistantInputs, assistantChatIds, resetChatIds, sentTexts, logsAt };
}

let nextUpdateId = 1;

// Bangun update pesan teks palsu dari user tertentu di private chat.
function textUpdate(fromId: number, text: string): Update {
  const isCommand = text.startsWith("/");
  return {
    update_id: nextUpdateId++,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: fromId, type: "private", first_name: "Tester" },
      from: { id: fromId, is_bot: false, first_name: "Tester" },
      text,
      ...(isCommand
        ? { entities: [{ type: "bot_command" as const, offset: 0, length: text.split(" ")[0]!.length }] }
        : {}),
    },
  };
}

describe("createBot: commands", () => {
  it("replies to /start without calling the assistant", async () => {
    const { bot, sentTexts, assistantInputs } = setup();
    await bot.handleUpdate(textUpdate(OWNER_ID, "/start"));

    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain("Aku Kera");
    expect(assistantInputs).toEqual([]);
  });

  it("replies to /ping without calling the assistant", async () => {
    const { bot, sentTexts, assistantInputs } = setup({ assistantResult: new OllamaError("unreachable", "down") });
    await bot.handleUpdate(textUpdate(OWNER_ID, "/ping"));

    expect(sentTexts()).toEqual(["pong"]);
    expect(assistantInputs).toEqual([]);
  });

  it("clears the history of this chat on /reset without calling the model", async () => {
    const { bot, sentTexts, assistantInputs, resetChatIds } = setup();
    await bot.handleUpdate(textUpdate(OWNER_ID, "/reset"));

    expect(resetChatIds).toEqual([OWNER_ID]);
    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain("mulai dari awal");
    expect(assistantInputs).toEqual([]);
  });
});

describe("createBot: text messages", () => {
  it("shows typing, then sends the assistant's answer", async () => {
    const { bot, calls, assistantInputs, assistantChatIds } = setup({ assistantResult: "Jakarta." });
    await bot.handleUpdate(textUpdate(OWNER_ID, "ibu kota indonesia?"));

    expect(assistantInputs).toEqual(["ibu kota indonesia?"]);
    // Riwayat disimpan per chat, jadi chat.id harus sampai ke assistant.
    expect(assistantChatIds).toEqual([OWNER_ID]);
    expect(calls.map((c) => c.method)).toEqual(["sendChatAction", "sendMessage"]);
    expect(calls[0]!.payload).toEqual({ chat_id: OWNER_ID, action: "typing" });
    expect(calls[1]!.payload).toEqual({ chat_id: OWNER_ID, text: "Jakarta." });
  });

  it("splits a long answer into several messages", async () => {
    const longAnswer = Array.from({ length: 2000 }, (_, i) => `kata${i}`).join(" ");
    const { bot, sentTexts } = setup({ assistantResult: longAnswer });
    await bot.handleUpdate(textUpdate(OWNER_ID, "ceritakan panjang"));

    expect(sentTexts().length).toBeGreaterThan(1);
    expect(sentTexts().join(" ")).toBe(longAnswer);
  });

  it("logs metadata only, never the message or answer text", async () => {
    const { bot, logsAt } = setup({ assistantResult: "jawaban rahasia" });
    await bot.handleUpdate(textUpdate(OWNER_ID, "pertanyaan rahasia"));

    expect(logsAt("info")).toHaveLength(1);
    expect(logsAt("info")[0]!.message).toMatch(
      /^Replied to update \d+ in \d+ ms \(1 message\(s\), prompt 42 tokens, history 3 turn\(s\)\)$/,
    );
  });

  it("turns an assistant failure into a friendly reply and an error log", async () => {
    const { bot, sentTexts, logsAt } = setup({
      assistantResult: new OllamaError("unreachable", "Cannot reach Ollama at http://127.0.0.1:11434/api/chat"),
    });
    await bot.handleUpdate(textUpdate(OWNER_ID, "halo"));

    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain("Pastikan Ollama sedang jalan");
    expect(sentTexts()[0]).not.toContain("127.0.0.1");
    expect(logsAt("error")).toHaveLength(1);
    expect(logsAt("error")[0]!.message).toContain("Ollama error (unreachable)");
  });

  it("answers non-text messages with an explanation", async () => {
    const { bot, sentTexts, assistantInputs } = setup();
    await bot.handleUpdate({
      update_id: nextUpdateId++,
      message: {
        message_id: 1,
        date: 0,
        chat: { id: OWNER_ID, type: "private", first_name: "Tester" },
        from: { id: OWNER_ID, is_bot: false, first_name: "Tester" },
        sticker: {
          file_id: "x",
          file_unique_id: "x",
          type: "regular",
          width: 1,
          height: 1,
          is_animated: false,
          is_video: false,
        },
      },
    });

    expect(sentTexts()).toHaveLength(1);
    expect(sentTexts()[0]).toContain("baru bisa membaca pesan teks");
    expect(assistantInputs).toEqual([]);
  });
});

describe("createBot: authorization and errors", () => {
  it("ignores strangers without replying or calling the assistant", async () => {
    const { bot, calls, logs, assistantInputs } = setup();
    await bot.handleUpdate(textUpdate(STRANGER_ID, "halo"));

    expect(calls).toHaveLength(0);
    expect(assistantInputs).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe("warn");
    expect(logs[0]!.message).toContain(`id=${STRANGER_ID}`);
  });

  it("logs Telegram failures through the error boundary instead of throwing", async () => {
    const { bot, logsAt } = setup({ failWith: new Error("boom") });

    // Kalau error boundary tidak terpasang, handleUpdate akan melempar dan test ini gagal.
    // sendChatAction juga gagal, tapi itu sengaja diabaikan (typing bersifat best effort).
    await bot.handleUpdate(textUpdate(OWNER_ID, "halo"));

    expect(logsAt("error")).toHaveLength(1);
    expect(logsAt("error")[0]!.message).toBe(`Error while handling update ${nextUpdateId - 1}: Error: boom`);
  });

  it("keeps handling later updates after an error", async () => {
    const { bot, assistantInputs } = setup({ failWith: new Error("boom") });
    await bot.handleUpdate(textUpdate(OWNER_ID, "pertama"));
    await bot.handleUpdate(textUpdate(OWNER_ID, "kedua"));

    expect(assistantInputs).toEqual(["pertama", "kedua"]);
  });
});
