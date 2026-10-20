import { Bot, type BotConfig, type BotError, type Context } from "grammy";
import type { Assistant } from "../ai/assistant.ts";
import { describeError } from "../errors.ts";
import { createAuthMiddleware } from "./auth.ts";
import {
  createResetHandler,
  createTextHandler,
  handlePing,
  handleStart,
  handleUnsupportedMessage,
} from "./handlers.ts";
import type { Logger } from "./logger.ts";

// Semua yang dibutuhkan bot dari luar. Dioper dari index.ts (versi asli) atau
// dari test (assistant dan logger palsu).
export type BotDependencies = {
  token: string;
  allowedUserIds: ReadonlySet<number>;
  assistant: Assistant;
  logger: Logger;
};

// Rakit instance Bot: pasang middleware, handler, dan error handler.
// Dipanggil dari index.ts (yang lalu memutuskan cara menjalankan: long polling)
// dan dari test (yang menyuntikkan update palsu lewat bot.handleUpdate).
// Fungsi ini sengaja TIDAK memanggil bot.start(), supaya cara menerima update
// (polling sekarang, mungkin webhook nanti) terpisah dari logika bot. Lihat ADR-0001.
// `botConfig` opsional, dipakai test untuk mengisi botInfo agar tidak perlu memanggil getMe.
export function createBot(
  deps: BotDependencies,
  botConfig?: BotConfig<Context>,
): Bot {
  const { logger } = deps;
  const bot = new Bot(deps.token, botConfig);

  const logUpdateError = (err: BotError<Context>): void => {
    logger.error(
      `Error while handling update ${err.ctx.update.update_id}: ${describeError(err.error)}`,
    );
  };

  // Semua middleware dipasang di dalam error boundary. Error dari handler mana pun
  // berhenti di sini (di-log), tidak menjatuhkan proses, dan update berikutnya tetap diproses.
  // Kenapa boundary dan bukan hanya bot.catch(): bot.catch() hanya dipakai oleh loop
  // long polling (bot.start). Pada bot.handleUpdate() (dipakai test dan webhook) error
  // tetap dilempar. Boundary bekerja di semua cara menjalankan bot.
  const protectedBot = bot.errorBoundary(logUpdateError);

  // Urutan pemasangan = urutan eksekusi. Auth harus paling awal.
  protectedBot.use(createAuthMiddleware(deps.allowedUserIds, logger));

  protectedBot.command("start", handleStart);
  protectedBot.command("ping", handlePing);
  protectedBot.command("reset", createResetHandler(deps.assistant));
  protectedBot.on("message:text", createTextHandler(deps.assistant, logger));
  protectedBot.on("message", handleUnsupportedMessage);

  // Jaring pengaman terakhir untuk long polling. Tanpa ini, handler bawaan grammY
  // menghentikan polling saat ada error yang lolos dari boundary.
  bot.catch(logUpdateError);

  return bot;
}
