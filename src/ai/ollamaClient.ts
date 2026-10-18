import { z } from "zod";
import type { OllamaConfig } from "../config/env.ts";

// Satu pesan dalam percakapan, sesuai format `messages` di POST /api/chat Ollama.
// "system" = instruksi persona, "user" = pesan pengguna, "assistant" = jawaban model.
export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// Hasil satu panggilan chat yang sudah divalidasi.
// `doneReason` "stop" berarti model selesai sendiri, "length" berarti terpotong oleh
// batas maxOutputTokens. undefined kalau Ollama tidak mengirim field itu.
export type ChatResult = {
  content: string;
  doneReason: string | undefined;
};

// Kategori kegagalan. Dipakai handler untuk memilih pesan yang tepat untuk user,
// tanpa harus membaca isi pesan error.
export type OllamaErrorKind =
  | "unreachable" // Ollama tidak jalan / port salah / koneksi ditolak
  | "timeout" // tidak selesai dalam batas waktu
  | "model_not_found" // model belum di-pull
  | "http_error" // status HTTP lain yang bukan 2xx
  | "invalid_response"; // body bukan JSON atau bentuknya tidak sesuai schema

// Error dari semua operasi ollamaClient. Selalu dilempar dengan `kind` yang jelas,
// sehingga pemanggil cukup memeriksa `error.kind`.
export class OllamaError extends Error {
  readonly kind: OllamaErrorKind;

  constructor(
    kind: OllamaErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OllamaError";
    this.kind = kind;
  }
}

export type OllamaClient = {
  chat(messages: readonly ChatMessage[]): Promise<ChatResult>;
  checkModelAvailable(): Promise<void>;
};

export type OllamaClientOptions = OllamaConfig & {
  // Batas token yang boleh dihasilkan model per jawaban (option `num_predict` Ollama).
  // Membatasi lama GPU bekerja untuk satu pesan.
  maxOutputTokens: number;
  // Bisa diganti di test. Default: fetch bawaan Node.
  fetch?: typeof fetch;
};

// Waktu tunggu untuk pengecekan model saat startup. Dibuat pendek dan terpisah dari
// timeoutMs, karena /api/show tidak menjalankan model.
const HEALTH_CHECK_TIMEOUT_MS = 5_000;

// Schema respon POST /api/chat (stream: false). Hanya field yang dipakai yang divalidasi;
// field lain (durasi, jumlah token) dibiarkan dan dibuang oleh zod.
const chatResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
  done_reason: z.string().optional(),
});

// Schema body error Ollama, contoh: {"error":"model 'x' not found"}.
const errorBodySchema = z.object({ error: z.string() });

// Buat client Ollama. Dipanggil sekali dari index.ts dengan config dari env.
// Mengembalikan objek dengan dua method; tidak ada state selain options.
export function createOllamaClient(options: OllamaClientOptions): OllamaClient {
  const fetchFn = options.fetch ?? fetch;

  // Kirim POST JSON ke Ollama dan kembalikan body JSON kalau status 2xx.
  // Semua kegagalan diterjemahkan menjadi OllamaError di satu tempat ini.
  async function postJson(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const url = `${options.baseUrl}${path}`;

    let response: Response;
    try {
      response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        // AbortSignal.timeout membatalkan request otomatis setelah timeoutMs.
        // Batas ini berlaku sampai body selesai dibaca, bukan hanya sampai header datang.
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw toRequestError(error, url, timeoutMs);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw toRequestError(error, url, timeoutMs);
    }

    if (!response.ok) {
      throw toHttpError(response.status, text);
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new OllamaError(
        "invalid_response",
        `Ollama returned non-JSON body for ${path}`,
        { cause: error },
      );
    }
  }

  return {
    // Kirim percakapan ke model dan kembalikan jawabannya.
    // Dipanggil oleh assistant.reply(). stream: false artinya Ollama baru menjawab
    // setelah seluruh teks selesai dibuat (satu objek JSON, bukan potongan per baris).
    async chat(messages) {
      const json = await postJson(
        "/api/chat",
        {
          model: options.model,
          messages,
          stream: false,
          think: options.think,
          options: { num_predict: options.maxOutputTokens },
        },
        options.timeoutMs,
      );

      const parsed = chatResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new OllamaError(
          "invalid_response",
          "Ollama /api/chat response has an unexpected shape",
        );
      }

      return {
        content: parsed.data.message.content,
        doneReason: parsed.data.done_reason,
      };
    },

    // Pastikan Ollama bisa dihubungi dan model sudah di-pull.
    // Dipanggil dari index.ts saat startup; hasilnya hanya untuk warning di log.
    async checkModelAvailable() {
      await postJson(
        "/api/show",
        { model: options.model },
        HEALTH_CHECK_TIMEOUT_MS,
      );
    },
  };
}

// Terjemahkan error dari fetch (atau saat membaca body) menjadi OllamaError.
// fetch melempar DOMException bernama "TimeoutError" kalau AbortSignal.timeout habis,
// dan TypeError "fetch failed" kalau koneksi gagal (misalnya ECONNREFUSED).
function toRequestError(
  error: unknown,
  url: string,
  timeoutMs: number,
): OllamaError {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new OllamaError(
      "timeout",
      `Ollama did not respond within ${timeoutMs} ms (${url})`,
      { cause: error },
    );
  }
  return new OllamaError("unreachable", `Cannot reach Ollama at ${url}`, {
    cause: error,
  });
}

// Terjemahkan respon non-2xx menjadi OllamaError. Ollama memakai 404 untuk model yang
// belum di-pull. Pesan dari body Ollama ikut disertakan karena berguna untuk debug
// dan tidak berisi isi percakapan.
function toHttpError(status: number, bodyText: string): OllamaError {
  const detail = readErrorMessage(bodyText);
  if (status === 404) {
    return new OllamaError(
      "model_not_found",
      `Ollama: ${detail} (HTTP 404). Run "ollama pull <model>".`,
    );
  }
  return new OllamaError("http_error", `Ollama: ${detail} (HTTP ${status})`);
}

// Ambil field "error" dari body JSON Ollama; kalau tidak ada, pakai potongan teks mentah.
function readErrorMessage(bodyText: string): string {
  try {
    const parsed = errorBodySchema.safeParse(JSON.parse(bodyText));
    if (parsed.success) {
      return parsed.data.error;
    }
  } catch {
    // Body bukan JSON; lanjut ke fallback di bawah.
  }
  return bodyText.slice(0, 200) || "empty response body";
}
