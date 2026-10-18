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
      maxOutputTokens: 5,
    });
    await expect(missing.checkModelAvailable()).rejects.toMatchObject({
      kind: "model_not_found",
    });
  });
});
