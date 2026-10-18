import { Bot, GrammyError, HttpError, type BotConfig, type BotError, type Context } from "grammy";
import type { Config } from "../config/env.ts";
import { createAuthMiddleware } from "./auth.ts";
import { handleStart, handleText, handleUnsupportedMessage } from "./handlers.ts";
import type { Logger } from "./logger.ts";

// Rakit instance Bot: pasang middleware, handler, dan error handler.
// Dipanggil dari index.ts (yang lalu memutuskan cara menjalankan: long polling)
// dan dari test (yang menyuntikkan update palsu lewat bot.handleUpdate).
// Fungsi ini sengaja TIDAK memanggil bot.start(), supaya cara menerima update
// (polling sekarang, mungkin webhook nanti) terpisah dari logika bot. Lihat ADR-0001.
// `botConfig` opsional, dipakai test untuk mengisi botInfo agar tidak perlu memanggil getMe.
export function createBot(config: Config, logger: Logger, botConfig?: BotConfig<Context>): Bot {
  const bot = new Bot(config.telegramBotToken, botConfig);

  const logUpdateError = (err: BotError<Context>): void => {
    logger.error(`Error while handling update ${err.ctx.update.update_id}: ${describeError(err.error)}`);
  };

  // Semua middleware dipasang di dalam error boundary. Error dari handler mana pun
  // berhenti di sini (di-log), tidak menjatuhkan proses, dan update berikutnya tetap diproses.
  // Kenapa boundary dan bukan hanya bot.catch(): bot.catch() hanya dipakai oleh loop
  // long polling (bot.start). Pada bot.handleUpdate() (dipakai test dan webhook) error
  // tetap dilempar. Boundary bekerja di semua cara menjalankan bot.
  const protectedBot = bot.errorBoundary(logUpdateError);

  // Urutan pemasangan = urutan eksekusi. Auth harus paling awal.
  protectedBot.use(createAuthMiddleware(config.allowedUserIds, logger));

  protectedBot.command("start", handleStart);
  protectedBot.on("message:text", handleText);
  protectedBot.on("message", handleUnsupportedMessage);

  // Jaring pengaman terakhir untuk long polling. Tanpa ini, handler bawaan grammY
  // menghentikan polling saat ada error yang lolos dari boundary.
  bot.catch(logUpdateError);

  return bot;
}

// Ubah error menjadi satu baris yang aman untuk di-log.
// Dipanggil dari bot.catch(). Sengaja hanya mengambil field yang diketahui aman
// (nama, kode, deskripsi), bukan seluruh objek error, supaya data request
// (yang bisa berisi URL dengan token) tidak ikut tercetak.
export function describeError(error: unknown): string {
  if (error instanceof GrammyError) {
    // Telegram menjawab, tapi menolak request (misalnya 400 Bad Request, 403 bot diblokir user).
    return `Telegram API error ${error.error_code} in ${error.method}: ${error.description}`;
  }
  if (error instanceof HttpError) {
    // Request tidak sampai ke Telegram (jaringan putus, DNS, timeout).
    return `Network error while contacting Telegram: ${error.message}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return `Unknown error: ${String(error)}`;
}
