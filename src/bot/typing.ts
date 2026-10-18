import type { Context } from "grammy";

// Telegram menampilkan status "typing..." hanya sekitar 5 detik per sendChatAction,
// jadi status dikirim ulang lebih cepat dari itu selama pekerjaan berjalan.
const TYPING_REFRESH_MS = 4_000;

// Jalankan `work` sambil menampilkan "typing..." di chat, lalu kembalikan hasilnya.
// Dipanggil oleh handler teks saat menunggu jawaban model.
// <T> adalah generic: tipe hasil `work` diteruskan apa adanya, sehingga pemanggil
// mendapat Promise<string> kalau work mengembalikan string.
// Timer dibersihkan di `finally`, sehingga tetap berhenti walaupun `work` melempar error.
// Tanpa itu, setInterval akan terus mengirim "typing" selamanya.
export async function withTypingIndicator<T>(
  ctx: Context,
  work: () => Promise<T>,
  refreshMs: number = TYPING_REFRESH_MS,
): Promise<T> {
  const sendTyping = (): void => {
    // Best effort: gagal mengirim status typing tidak boleh membatalkan jawaban,
    // jadi error-nya sengaja diabaikan di sini.
    ctx.replyWithChatAction("typing").catch(() => undefined);
  };

  sendTyping();
  const timer = setInterval(sendTyping, refreshMs);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}
