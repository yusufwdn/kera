import { z } from "zod";

// Konfigurasi aplikasi yang sudah tervalidasi dan bertipe.
// Dibuat sekali di index.ts lewat loadConfig(), lalu dioper ke modul lain.
// Modul lain tidak membaca process.env langsung, supaya semua validasi ada di satu tempat.
export type Config = {
  telegramBotToken: string;
  allowedUserIds: ReadonlySet<number>;
  ollama: OllamaConfig;
};

// Bagian konfigurasi untuk koneksi ke Ollama. Dipakai createOllamaClient() di src/ai/.
export type OllamaConfig = {
  baseUrl: string;
  model: string;
  think: boolean;
  timeoutMs: number;
  // Ukuran context window (option `num_ctx` Ollama), dalam token: batas total system
  // prompt + riwayat + pesan baru + jawaban. Lihat ADR-0004.
  numCtx: number;
};

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen3:4b-instruct";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;
export const DEFAULT_OLLAMA_NUM_CTX = 8192;

// Error khusus untuk konfigurasi tidak valid.
// Dilempar oleh loadConfig() dan ditangkap di index.ts untuk menampilkan pesan lalu exit.
// `problems` berisi daftar masalah per variabel, TANPA nilai variabelnya,
// karena nilainya bisa berupa secret (misalnya token).
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
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
      ctx.addIssue({
        code: "custom",
        message: `"${part}" is not a valid Telegram user ID`,
      });
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
    .regex(
      TELEGRAM_TOKEN_PATTERN,
      "does not look like a token from @BotFather",
    ),
  ALLOWED_USER_IDS: z.string().default("").transform(parseUserIds),

  // Hanya http/https. Trailing slash dibuang supaya `${baseUrl}/api/chat` tidak jadi "//api".
  OLLAMA_BASE_URL: z
    .url({
      protocol: /^https?$/,
      error: "must be an http(s) URL, e.g. http://127.0.0.1:11434",
    })
    .transform((url) => url.replace(/\/+$/, ""))
    .default(DEFAULT_OLLAMA_BASE_URL),
  OLLAMA_MODEL: z.string().trim().min(1).default(DEFAULT_OLLAMA_MODEL),
  // Sengaja tidak memakai z.coerce.boolean(): coerce memakai Boolean(value), sehingga
  // string "false" (tidak kosong) malah menjadi true.
  OLLAMA_THINK: z
    .enum(["true", "false"], { error: 'must be "true" or "false"' })
    .transform((value) => value === "true")
    .default(false),
  OLLAMA_TIMEOUT_MS: z
    .string()
    .regex(/^\d+$/, "must be a whole number of milliseconds")
    .transform(Number)
    .pipe(
      z
        .number()
        .min(1_000, "must be at least 1000")
        .max(600_000, "must be at most 600000"),
    )
    .default(DEFAULT_OLLAMA_TIMEOUT_MS),
  // Minimal 4096: pesan Telegram terpanjang (4096 karakter, sekitar 1400 token) ditambah
  // system prompt dan ruang jawaban (1024 token) harus muat. Ollama menolak dengan
  // HTTP 400 kalau satu pesan saja sudah melebihi num_ctx. Batas atas hanya mencegah
  // salah ketik; 16384 di GPU 6 GB sudah sebagian pindah ke CPU (ADR-0004).
  OLLAMA_NUM_CTX: z
    .string()
    .regex(/^\d+$/, "must be a whole number of tokens")
    .transform(Number)
    .pipe(
      z
        .number()
        .min(4_096, "must be at least 4096")
        .max(131_072, "must be at most 131072"),
    )
    .default(DEFAULT_OLLAMA_NUM_CTX),
});

// Anggap variabel yang isinya kosong ("") sama dengan tidak diisi.
// Dipanggil oleh loadConfig() sebelum validasi. Tanpa ini, baris `OLLAMA_MODEL=`
// di .env menghasilkan string kosong, default zod tidak dipakai, dan validasi gagal.
function dropEmptyValues(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const cleaned: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== "") {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// Baca dan validasi konfigurasi dari environment.
// Dipanggil sekali dari index.ts saat startup.
// Input: objek env (default process.env). Bisa diganti objek biasa di test,
// jadi test tidak perlu mengubah process.env global.
// Output: Config yang sudah bertipe. Melempar ConfigError kalau ada yang tidak valid.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(dropEmptyValues(env));

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
    ollama: {
      baseUrl: result.data.OLLAMA_BASE_URL,
      model: result.data.OLLAMA_MODEL,
      think: result.data.OLLAMA_THINK,
      timeoutMs: result.data.OLLAMA_TIMEOUT_MS,
      numCtx: result.data.OLLAMA_NUM_CTX,
    },
  };
}
