import { createAssistant, MAX_REPLY_TOKENS } from "./ai/assistant.ts";
import { createOllamaClient, type OllamaClient } from "./ai/ollamaClient.ts";
import { createBot } from "./bot/createBot.ts";
import { ConfigError, loadConfig, type Config } from "./config/env.ts";
import { promptTokenBudget } from "./conversation/contextWindow.ts";
import { createInMemoryConversationStore } from "./conversation/conversationStore.ts";
import { describeError } from "./errors.ts";

// Entry point aplikasi Kera. Dijalankan oleh `npm run dev` / `npm start`.
// Tanggung jawab file ini hanya "merakit dan menjalankan":
// baca config -> buat ollamaClient -> assistant (dengan store riwayat) -> bot
// -> jalankan long polling -> berhenti rapi.
// Logika bot ada di src/bot/, integrasi model di src/ai/, riwayat percakapan di
// src/conversation/, validasi config di src/config/.

// Baca config; kalau tidak valid, cetak daftar masalah lalu keluar dengan kode 1.
// Dipisah dari main() supaya pesan error config (masalah setup) tampil rapi dan
// tidak tercampur dengan error runtime lain.
function loadConfigOrExit(): Config {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      console.error(
        "Check your .env file. See .env.example for the expected variables.",
      );
      process.exit(1);
    }
    throw error;
  }
}

// Cek apakah Ollama bisa dihubungi dan model sudah ada. Hanya memberi warning:
// bot tetap dijalankan, karena Ollama bisa saja dinyalakan setelah Kera, dan /ping
// tetap berguna walaupun Ollama mati.
async function warnIfModelUnavailable(
  client: OllamaClient,
  config: Config,
): Promise<void> {
  try {
    await client.checkModelAvailable();
    console.info(
      `Ollama is ready with model ${config.ollama.model} at ${config.ollama.baseUrl} ` +
        `(context ${config.ollama.numCtx} tokens)`,
    );
  } catch (error) {
    console.warn(
      `Ollama check failed, replies will fail until it is fixed. ${describeError(error)}`,
    );
  }
}

// Daftarkan handler Ctrl+C (SIGINT) dan SIGTERM untuk menghentikan polling dengan rapi.
// Tanpa ini proses langsung dibunuh, dan update yang sedang diproses bisa terpotong.
// bot.stop() menyelesaikan update yang sedang berjalan, memberi tahu Telegram offset
// terakhir (supaya update yang sama tidak dikirim ulang), lalu membuat bot.start() selesai.
// `once` dipakai supaya Ctrl+C kedua jatuh ke perilaku default Node (paksa keluar).
function stopOnSignals(stop: () => Promise<void>): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      console.info(`Received ${signal}, stopping Kera...`);
      void stop();
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfigOrExit();

  if (config.allowedUserIds.size === 0) {
    console.warn(
      "ALLOWED_USER_IDS is empty: every user will be ignored. " +
        "Send a message to the bot, copy your id from the log below, then add it to .env.",
    );
  }

  const ollamaClient = createOllamaClient({
    ...config.ollama,
    maxOutputTokens: MAX_REPLY_TOKENS,
  });
  await warnIfModelUnavailable(ollamaClient, config);
  const budget = promptTokenBudget(config.ollama.numCtx, MAX_REPLY_TOKENS);

  const assistant = createAssistant({
    client: ollamaClient,
    store: createInMemoryConversationStore(),
    promptTokenBudget: budget,
  });

  console.info(`Prompt token budget for assistant: ${budget} tokens`);
  console.info(`Max reply tokens for assistant: ${MAX_REPLY_TOKENS} tokens`);

  const bot = createBot({
    token: config.telegramBotToken,
    allowedUserIds: config.allowedUserIds,
    assistant,
    logger: console,
  });
  stopOnSignals(() => bot.stop());

  // bot.start() memanggil Telegram (deleteWebhook dan getMe) sebelum masuk loop
  // long polling, sehingga token yang salah langsung ketahuan di sini.
  // Promise ini baru selesai setelah bot.stop() dipanggil, atau reject kalau
  // start gagal (token salah -> 401, ada instance lain -> 409).
  await bot.start({
    onStart: (botInfo) => {
      console.info(
        `Kera is running as @${botInfo.username} (long polling). Press Ctrl+C to stop.`,
      );
    },
  });

  console.info("Kera stopped.");
}

main().catch((error: unknown) => {
  console.error(`Kera failed: ${describeError(error)}`);
  // exitCode (bukan process.exit) supaya output sempat ditulis sebelum proses selesai.
  process.exitCode = 1;
});
