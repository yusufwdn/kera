import { z } from "zod";

// Konfigurasi aplikasi yang sudah tervalidasi dan bertipe.
// Dibuat sekali di index.ts lewat loadConfig(), lalu dioper ke modul lain.
// Modul lain tidak membaca process.env langsung, supaya semua validasi ada di satu tempat.
export type Config = {
  telegramBotToken: string;
  allowedUserIds: ReadonlySet<number>;
};

// Error khusus untuk konfigurasi tidak valid.
// Dilempar oleh loadConfig() dan ditangkap di index.ts untuk menampilkan pesan lalu exit.
// `problems` berisi daftar masalah per variabel, TANPA nilai variabelnya,
// karena nilainya bisa berupa secret (misalnya token).
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ConfigError";
    this.problems = problems;
  }
}

// Format token dari @BotFather: "<bot id>:<secret>", contoh bentuknya "123456:ABC-def_123".
// Dicek di sini supaya token yang salah salin (ada spasi, kutip, terpotong) ketahuan
// saat startup, bukan saat request pertama ke Telegram.
const TELEGRAM_TOKEN_PATTERN = /^\d+:[A-Za-z0-9_-]+$/;

// Ubah string "123, 456" menjadi Set<number> berisi ID user Telegram.
// Dipanggil oleh schema di bawah (lewat .transform). String kosong -> Set kosong
// (artinya semua user ditolak). Kalau ada bagian yang bukan bilangan bulat positif,
// issue ditambahkan ke ctx dan zod menandai hasil parse sebagai gagal.
function parseUserIds(raw: string, ctx: z.RefinementCtx): Set<number> {
  const ids = new Set<number>();
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  for (const part of parts) {
    // Number("12abc") -> NaN, Number("1.5") -> 1.5; keduanya ditolak oleh isSafeInteger.
    // Regex memastikan tidak ada bentuk aneh seperti "1e5" atau "0x10" yang lolos Number().
    const id = Number(part);
    if (!/^\d+$/.test(part) || !Number.isSafeInteger(id) || id <= 0) {
      ctx.addIssue({ code: "custom", message: `"${part}" is not a valid Telegram user ID` });
      continue;
    }
    ids.add(id);
  }

  return ids;
}

// Schema untuk environment variable mentah.
// Nama key sama dengan nama variabel di .env supaya pesan error langsung menunjuk variabelnya.
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z
    .string({ error: "is required" })
    .trim()
    .min(1, "is required")
    .regex(TELEGRAM_TOKEN_PATTERN, "does not look like a token from @BotFather"),
  ALLOWED_USER_IDS: z.string().default("").transform(parseUserIds),
});

// Baca dan validasi konfigurasi dari environment.
// Dipanggil sekali dari index.ts saat startup.
// Input: objek env (default process.env). Bisa diganti objek biasa di test,
// jadi test tidak perlu mengubah process.env global.
// Output: Config yang sudah bertipe. Melempar ConfigError kalau ada yang tidak valid.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const variable = issue.path.join(".");
      return `${variable}: ${issue.message}`;
    });
    throw new ConfigError(problems);
  }

  return {
    telegramBotToken: result.data.TELEGRAM_BOT_TOKEN,
    allowedUserIds: result.data.ALLOWED_USER_IDS,
  };
}
