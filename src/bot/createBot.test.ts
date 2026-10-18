import { GrammyError, HttpError } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import { describe, expect, it } from "vitest";
import type { Config } from "../config/env.ts";
import { createBot, describeError } from "./createBot.ts";
import type { Logger } from "./logger.ts";

// Test integrasi createBot tanpa jaringan.
// Update palsu disuntikkan dengan bot.handleUpdate(), dan setiap panggilan ke Telegram
// dicegat oleh API transformer sehingga tidak ada request yang benar-benar keluar.
// Yang TIDAK diverifikasi di sini: koneksi asli ke Telegram, validitas token, dan
// bentuk update asli dari server. Itu dicek lewat uji manual (lihat milestone-01.md).

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

// Buat bot untuk test beserta rekaman panggilan API dan log.
// `failWith` (opsional) membuat setiap panggilan API melempar error, untuk menguji bot.catch.
function setup(options: { failWith?: Error } = {}) {
  const calls: ApiCall[] = [];
  const logs: { level: keyof Logger; message: string }[] = [];
  const logger: Logger = {
    info: (message: string) => logs.push({ level: "info", message }),
    warn: (message: string) => logs.push({ level: "warn", message }),
    error: (message: string) => logs.push({ level: "error", message }),
  };

  const config: Config = {
    telegramBotToken: "123456:TEST-token",
    allowedUserIds: new Set([OWNER_ID]),
  };

  const bot = createBot(config, logger, { botInfo: fakeBotInfo });

  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (options.failWith) {
      throw options.failWith;
    }
    // Jawaban sukses minimal. Handler di Milestone 1 tidak memakai isi result.
    return { ok: true, result: true as never };
  });

  return { bot, calls, logs };
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

describe("createBot", () => {
  it("replies to /start for the owner", async () => {
    const { bot, calls } = setup();
    await bot.handleUpdate(textUpdate(OWNER_ID, "/start"));

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("sendMessage");
    expect(calls[0]!.payload.chat_id).toBe(OWNER_ID);
    expect(String(calls[0]!.payload.text)).toContain("Aku Kera");
  });

  it("echoes text messages for the owner", async () => {
    const { bot, calls } = setup();
    await bot.handleUpdate(textUpdate(OWNER_ID, "halo kera"));

    expect(calls).toEqual([
      { method: "sendMessage", payload: { chat_id: OWNER_ID, text: "Kamu bilang: halo kera" } },
    ]);
  });

  it("answers non-text messages with an explanation", async () => {
    const { bot, calls } = setup();
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

    expect(calls).toHaveLength(1);
    expect(String(calls[0]!.payload.text)).toContain("baru bisa membaca pesan teks");
  });

  it("ignores strangers without replying and logs their ID", async () => {
    const { bot, calls, logs } = setup();
    await bot.handleUpdate(textUpdate(STRANGER_ID, "/start"));

    expect(calls).toHaveLength(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe("warn");
    expect(logs[0]!.message).toContain(`id=${STRANGER_ID}`);
  });

  it("logs handler errors through the error boundary instead of throwing", async () => {
    const { bot, logs } = setup({ failWith: new Error("boom") });

    // Kalau error boundary tidak terpasang, handleUpdate akan melempar dan test ini gagal.
    await bot.handleUpdate(textUpdate(OWNER_ID, "halo"));

    expect(logs).toHaveLength(1);
    expect(logs[0]!.level).toBe("error");
    expect(logs[0]!.message).toBe(`Error while handling update ${nextUpdateId - 1}: Error: boom`);
  });

  it("keeps handling later updates after an error", async () => {
    const failing = setup({ failWith: new Error("boom") });
    await failing.bot.handleUpdate(textUpdate(OWNER_ID, "pertama"));
    await failing.bot.handleUpdate(textUpdate(OWNER_ID, "kedua"));

    // Dua update -> dua percobaan sendMessage, artinya error pertama tidak menghentikan bot.
    expect(failing.calls).toHaveLength(2);
  });
});

describe("describeError", () => {
  it("summarizes Telegram API rejections", () => {
    const error = new GrammyError(
      "Call to 'sendMessage' failed!",
      { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" },
      "sendMessage",
      { chat_id: 1, text: "rahasia user" },
    );

    const summary = describeError(error);
    expect(summary).toBe(
      "Telegram API error 403 in sendMessage: Forbidden: bot was blocked by the user",
    );
    // Isi pesan (payload) tidak ikut di-log.
    expect(summary).not.toContain("rahasia user");
  });

  it("summarizes network failures without the underlying error details", () => {
    const cause = new Error("connect ECONNREFUSED https://api.telegram.org/bot123456:TEST-token/sendMessage");
    const error = new HttpError("Network request for 'sendMessage' failed!", cause);

    const summary = describeError(error);
    expect(summary).toBe(
      "Network error while contacting Telegram: Network request for 'sendMessage' failed!",
    );
    expect(summary).not.toContain("TEST-token");
  });

  it("handles non-Error values", () => {
    expect(describeError("oops")).toBe("Unknown error: oops");
  });
});
