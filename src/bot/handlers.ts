import type { CommandContext, Context, Filter } from "grammy";
import type { Assistant, AssistantReply } from "../ai/assistant.ts";
import { OllamaError } from "../ai/ollamaClient.ts";
import { describeError } from "../errors.ts";
import type { Logger } from "./logger.ts";
import { splitMessage } from "./replyChunks.ts";
import { withTypingIndicator } from "./typing.ts";

// Handler perintah /start. Dipasang di createBot() lewat command("start", ...).
export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const name = ctx.from?.first_name ?? "kamu";
  await ctx.reply(
    `Halo, ${name}! Aku Kera, asisten pribadimu.\n` +
      "Tanya apa saja lewat pesan teks. Aku ingat obrolan terakhir kita di chat ini, " +
      "tapi lupa lagi kalau aku di-restart.\n" +
      "Kirim /reset untuk mulai obrolan dari awal, /ping untuk cek apakah aku hidup.",
  );
}

// Handler /ping. Sengaja tidak memanggil model, sehingga bisa dipakai untuk membedakan
// "bot mati" dari "bot hidup tapi Ollama bermasalah".
export async function handlePing(ctx: CommandContext<Context>): Promise<void> {
  await ctx.reply("pong");
}

// Buat handler /reset: hapus riwayat percakapan chat ini.
// Dipasang di createBot() lewat command("reset", ...). Tidak memanggil model.
export function createResetHandler(assistant: Assistant) {
  return async (ctx: CommandContext<Context>): Promise<void> => {
    await assistant.resetConversation(ctx.chat.id);
    await ctx.reply("Oke, obrolan kita mulai dari awal. Yang tadi sudah aku lupakan.");
  };
}

// Buat handler pesan teks yang meneruskan pesan ke assistant.
// Dipasang di createBot() lewat on("message:text", ...). Berupa factory (fungsi yang
// mengembalikan fungsi) karena handler butuh assistant dan logger dari luar.
// Alur: tampilkan typing -> tunggu assistant.reply -> kirim jawaban (dipecah bila panjang).
// Kalau assistant gagal: detail ke log, pesan ramah ke user, lalu selesai normal.
// Kalau pengiriman ke Telegram gagal: error dibiarkan naik ke error boundary.
export function createTextHandler(assistant: Assistant, logger: Logger) {
  return async (ctx: Filter<Context, "message:text">): Promise<void> => {
    const updateId = ctx.update.update_id;
    const startedAt = Date.now();

    let reply: AssistantReply;
    try {
      reply = await withTypingIndicator(ctx, () =>
        assistant.reply(ctx.chat.id, ctx.message.text),
      );
    } catch (error) {
      logger.error(
        `Assistant failed for update ${updateId}: ${describeError(error)}`,
      );
      await ctx.reply(userMessageForError(error));
      return;
    }

    const chunks = splitMessage(reply.text);
    for (const chunk of chunks) {
      await ctx.reply(chunk);
    }
    // Hanya metadata yang di-log, bukan isi pesan atau jawaban. Jumlah token prompt
    // dipakai untuk melihat seberapa dekat percakapan dengan batas context window.
    logger.info(
      `Replied to update ${updateId} in ${Date.now() - startedAt} ms ` +
        `(${chunks.length} message(s), prompt ${reply.promptTokens ?? "?"} tokens, ` +
        `history ${reply.historyTurns} turn(s))`,
    );
  };
}

// Handler untuk pesan non-teks (stiker, foto, voice, dll.).
// Dipasang setelah handler teks, jadi hanya menerima pesan yang tidak tertangkap di sana.
export async function handleUnsupportedMessage(
  ctx: Filter<Context, "message">,
): Promise<void> {
  await ctx.reply("Maaf, untuk sekarang aku baru bisa membaca pesan teks.");
}

// Pilih pesan untuk user berdasarkan jenis kegagalan.
// Dipanggil oleh handler teks. Pesan tidak memuat detail teknis (URL, status, isi error);
// detail itu hanya ada di log. Bot ini dipakai pemiliknya sendiri, jadi pesan boleh
// memberi petunjuk tindakan ("pastikan Ollama jalan").
export function userMessageForError(error: unknown): string {
  if (error instanceof OllamaError) {
    switch (error.kind) {
      case "unreachable":
        return "Aku nggak bisa menghubungi Ollama. Pastikan Ollama sedang jalan di laptop, lalu coba lagi.";
      case "timeout":
        return "Aku kelamaan mikir dan akhirnya berhenti. Coba lagi, atau pakai pertanyaan yang lebih singkat.";
      case "model_not_found":
        return "Model AI-nya belum terpasang di Ollama. Cek log Kera untuk nama model yang perlu di-pull.";
      case "http_error":
      case "invalid_response":
        return "Ollama membalas dengan respon yang nggak bisa aku pakai. Cek log Kera untuk detailnya.";
    }
  }
  return "Maaf, ada kesalahan saat menyiapkan jawaban. Coba lagi sebentar lagi.";
}
