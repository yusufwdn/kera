import type { CommandContext, Context, Filter } from "grammy";

// Batas panjang teks satu pesan yang dikirim lewat Bot API.
export const TELEGRAM_MESSAGE_LIMIT = 4096;

const ECHO_PREFIX = "Kamu bilang: ";

// Susun teks balasan echo untuk pesan user.
// Dipanggil oleh handleText(). Pesan user sendiri bisa sampai 4096 karakter, jadi
// setelah ditambah prefix balasan bisa melebihi batas dan sendMessage akan gagal.
// Karena itu teks dipotong. Pemotongan pakai Array.from (per code point) supaya
// emoji atau karakter di luar BMP tidak terbelah menjadi karakter rusak.
export function buildEchoReply(text: string): string {
  const maxTextLength = TELEGRAM_MESSAGE_LIMIT - ECHO_PREFIX.length;
  const characters = Array.from(text);

  if (characters.length <= maxTextLength) {
    return ECHO_PREFIX + text;
  }

  const ellipsis = "...";
  return ECHO_PREFIX + characters.slice(0, maxTextLength - ellipsis.length).join("") + ellipsis;
}

// Handler perintah /start. Dipasang di createBot() lewat bot.command("start", ...).
export async function handleStart(ctx: CommandContext<Context>): Promise<void> {
  const name = ctx.from?.first_name ?? "kamu";
  await ctx.reply(
    `Halo, ${name}! Aku Kera, asisten pribadimu.\n` +
      "Untuk sekarang aku cuma bisa mengulang pesan teksmu. Coba kirim sesuatu.",
  );
}

// Handler pesan teks biasa. Dipasang lewat bot.on("message:text", ...).
// Tipe Filter<Context, "message:text"> menjamin ctx.message.text pasti string,
// jadi tidak perlu cek undefined di sini.
export async function handleText(ctx: Filter<Context, "message:text">): Promise<void> {
  await ctx.reply(buildEchoReply(ctx.message.text));
}

// Handler untuk pesan non-teks (stiker, foto, voice, dll.).
// Dipasang setelah handleText, jadi hanya menerima pesan yang tidak tertangkap handler teks.
export async function handleUnsupportedMessage(ctx: Filter<Context, "message">): Promise<void> {
  await ctx.reply("Maaf, untuk sekarang aku baru bisa membaca pesan teks.");
}
