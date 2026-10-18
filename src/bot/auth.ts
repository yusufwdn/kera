import type { Context, MiddlewareFn } from "grammy";
import type { Logger } from "./logger.ts";

// Cek apakah user boleh memakai bot.
// Dipanggil oleh middleware di bawah. Dipisah sebagai fungsi murni supaya mudah di-test.
// Input: ID user (undefined kalau update tidak punya pengirim, misalnya post di channel)
// dan allowlist. Output: true hanya kalau ID ada di allowlist.
export function isUserAllowed(userId: number | undefined, allowedUserIds: ReadonlySet<number>): boolean {
  if (userId === undefined) {
    return false;
  }
  return allowedUserIds.has(userId);
}

// Buat middleware grammY yang memblokir update dari user di luar allowlist.
// Dipasang paling awal di createBot(), sehingga handler setelahnya hanya pernah
// menerima update dari user yang diizinkan.
// Update yang ditolak tidak dibalas sama sekali (bot terlihat "diam"), supaya orang
// asing tidak mendapat petunjuk bahwa bot ini aktif. ID-nya dicatat di log, sehingga
// pemilik bisa menyalin ID sendiri ke ALLOWED_USER_IDS saat setup pertama.
export function createAuthMiddleware(
  allowedUserIds: ReadonlySet<number>,
  logger: Logger,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const userId = ctx.from?.id;

    if (!isUserAllowed(userId, allowedUserIds)) {
      logger.warn(
        `Ignored update ${ctx.update.update_id} from unauthorized user ` +
          `id=${userId ?? "unknown"} username=${ctx.from?.username ?? "-"} chat=${ctx.chat?.id ?? "-"}`,
      );
      return;
    }

    // next() menjalankan middleware/handler berikutnya. Wajib di-await supaya
    // error dari handler mengalir kembali ke sini lalu ke bot.catch().
    await next();
  };
}
