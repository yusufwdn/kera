import { describe, expect, it } from "vitest";
import {
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
} from "../config/env.ts";
import { createOllamaClient } from "./ollamaClient.ts";

// Test integrasi terhadap Ollama ASLI di laptop. Tidak ikut `npm test`
// (di-exclude di package.json) karena butuh Ollama menyala, model sudah di-pull, dan GPU.
// Jalankan dengan: npm run test:ollama
// Tujuannya menangkap perubahan format API Ollama yang tidak terlihat oleh test unit
// (yang memakai fetch palsu dengan format buatan kita sendiri).
// Model dan URL bisa diganti lewat env OLLAMA_MODEL / OLLAMA_BASE_URL.

const baseUrl = process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL;
const model = process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL;

const client = createOllamaClient({
  baseUrl,
  model,
  think: false,
  timeoutMs: 120_000,
  numCtx: 8192,
  maxOutputTokens: 64,
});

describe(`real Ollama (${model} at ${baseUrl})`, () => {
  it("has the configured model", async () => {
    await expect(client.checkModelAvailable()).resolves.toBeUndefined();
  });

  it(
    "answers a chat request with non-empty content",
    { timeout: 130_000 },
    async () => {
      const result = await client.chat([
        { role: "system", content: "Jawab dengan satu kata saja." },
        { role: "user", content: "Apa warna langit saat cerah?" },
      ]);

      expect(result.content.trim().length).toBeGreaterThan(0);
      expect(["stop", "length"]).toContain(result.doneReason);
      expect(result.promptTokens).toBeGreaterThan(0);
    },
  );

  // Dua test berikut mendokumentasikan perilaku Ollama yang menjadi alasan riwayat
  // dipotong sendiri di contextWindow.ts dan OLLAMA_NUM_CTX minimal 4096.
  // Kalau Ollama mengubah perilakunya, test ini gagal dan desainnya perlu ditinjau ulang.
  // num_ctx 2048 sengaja di bawah minimum config, hanya untuk memancing batasnya.
  // Kalimat ini sekitar 12 token (diukur dengan prompt_eval_count).
  const sentence = "Kemarin aku pergi ke pasar bersama ibu. ";
  const smallContext = createOllamaClient({
    baseUrl,
    model,
    think: false,
    timeoutMs: 120_000,
    numCtx: 2048,
    maxOutputTokens: 5,
  });

  it(
    "silently drops old messages when the conversation is longer than num_ctx",
    { timeout: 130_000 },
    async () => {
      // 8 pesan x sekitar 300 token = sekitar 2400 token, lebih dari 2048.
      const messages = Array.from({ length: 8 }, () => ({
        role: "user" as const,
        content: sentence.repeat(25),
      }));
      const result = await smallContext.chat(messages);
      expect(result.promptTokens).toBeLessThanOrEqual(2048);
    },
  );

  it(
    "rejects a single message that is longer than num_ctx",
    { timeout: 130_000 },
    async () => {
      // Sekitar 2770 token dalam satu pesan.
      const result = smallContext.chat([
        { role: "user", content: sentence.repeat(230) },
      ]);
      await expect(result).rejects.toMatchObject({
        kind: "http_error",
        message: expect.stringContaining("exceeds the available context size"),
      });
    },
  );

  it(
    "reports doneReason 'length' when the output limit is hit",
    { timeout: 130_000 },
    async () => {
      const tiny = createOllamaClient({
        baseUrl,
        model,
        think: false,
        timeoutMs: 120_000,
        numCtx: 8192,
        maxOutputTokens: 5,
      });
      const result = await tiny.chat([
        {
          role: "user",
          content: "Ceritakan sejarah Indonesia secara lengkap.",
        },
      ]);
      expect(result.doneReason).toBe("length");
    },
  );

  it("reports a missing model as model_not_found", async () => {
    const missing = createOllamaClient({
      baseUrl,
      model: "kera-model-that-does-not-exist:0b",
      think: false,
      timeoutMs: 10_000,
      numCtx: 8192,
      maxOutputTokens: 5,
    });
    await expect(missing.checkModelAvailable()).rejects.toMatchObject({
      kind: "model_not_found",
    });
  });
});
