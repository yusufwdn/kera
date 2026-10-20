import type { ConversationStore } from "../conversation/conversationStore.ts";
import { buildPrompt } from "../conversation/contextWindow.ts";
import type { OllamaClient } from "./ollamaClient.ts";

// Instruksi persona yang dikirim sebagai pesan "system" di setiap permintaan.
// Model kecil cenderung memakai Markdown; bot mengirim teks polos (tanpa parse_mode),
// jadi Markdown diminta untuk dihindari supaya tidak muncul tanda ** di Telegram.
// Batas kemampuan disebut eksplisit supaya model tidak berpura-pura bisa menyimpan
// catatan atau membuat reminder (fitur itu baru ada di milestone berikutnya), dan
// supaya model bisa menjelaskan dengan benar kenapa ia "lupa" setelah /reset atau restart.
export const SYSTEM_PROMPT = [
  "Kamu adalah Kera, asisten pribadi yang ramah dan to the point.",
  "Jawab dalam bahasa yang dipakai pengguna; default bahasa Indonesia santai.",
  "Utamakan jawaban singkat dan jelas. Tulis panjang hanya kalau diminta.",
  "Tulis teks polos tanpa Markdown: jangan pakai **, #, atau tabel.",
  "Kamu bisa melihat beberapa percakapan terakhir di chat ini. Riwayat itu hilang saat",
  "Kera di-restart atau saat pengguna mengirim /reset.",
  "Kamu belum bisa menyimpan catatan, membuat pengingat, atau mengakses internet.",
  "Kalau diminta, katakan terus terang bahwa fitur itu belum ada.",
].join("\n");

// Batas token per jawaban yang dipakai saat membuat ollamaClient di index.ts.
// Sekitar 1024 token cukup untuk beberapa paragraf (~20 detik di RTX 3050).
export const MAX_REPLY_TOKENS = 1024;

export const EMPTY_REPLY_FALLBACK =
  "Hmm, aku nggak dapat jawaban kali ini. Coba tanya dengan kalimat lain, ya.";
export const TRUNCATED_NOTICE =
  "\n\n(Jawaban terpotong karena terlalu panjang. Minta lanjutannya kalau perlu.)";

// Hasil satu jawaban. `text` siap dikirim ke user; dua field lain hanya untuk log.
export type AssistantReply = {
  text: string;
  // Token input yang dilaporkan Ollama (undefined kalau tidak dikirim).
  promptTokens: number | undefined;
  // Jumlah giliran riwayat yang ikut dikirim ke model.
  historyTurns: number;
};

export type Assistant = {
  reply(chatId: number, userText: string): Promise<AssistantReply>;
  resetConversation(chatId: number): Promise<void>;
};

export type AssistantOptions = {
  client: OllamaClient;
  store: ConversationStore;
  // Batas token untuk prompt, dari promptTokenBudget() di contextWindow.ts.
  promptTokenBudget: number;
};

// Buat assistant di atas ollamaClient dan penyimpanan riwayat.
// Dipanggil dari index.ts; hasilnya diinject ke createBot() sehingga handler tidak tahu
// apa-apa soal Ollama atau riwayat. Di test, Assistant bisa diganti objek palsu.
export function createAssistant(options: AssistantOptions): Assistant {
  const { client, store } = options;

  return {
    // Jawab satu pesan dengan memperhitungkan riwayat chat ini.
    // Alur: ambil riwayat -> susun prompt yang muat -> panggil model -> simpan giliran.
    // Giliran hanya disimpan kalau model berhasil menjawab dengan teks tidak kosong.
    // Kalau client gagal (OllamaError), error naik ke handler dan riwayat tidak berubah,
    // jadi tidak ada pertanyaan tanpa jawaban di riwayat.
    async reply(chatId, userText) {
      const history = await store.getHistory(chatId);
      const prompt = buildPrompt({
        systemPrompt: SYSTEM_PROMPT,
        history,
        userText,
        budget: options.promptTokenBudget,
      });

      const result = await client.chat(prompt.messages);
      const answer = cleanModelOutput(result.content);
      const logInfo = {
        promptTokens: result.promptTokens,
        historyTurns: prompt.historyTurns,
      };

      if (answer.length === 0) {
        return { text: EMPTY_REPLY_FALLBACK, ...logInfo };
      }

      // Yang disimpan adalah jawaban model apa adanya, tanpa TRUNCATED_NOTICE.
      // Catatan itu untuk user; kalau ikut disimpan, model akan membacanya sebagai
      // kalimatnya sendiri di giliran berikutnya.
      await store.appendTurn(chatId, { user: userText, assistant: answer });

      const text =
        result.doneReason === "length" ? answer + TRUNCATED_NOTICE : answer;
      return { text, ...logInfo };
    },

    // Hapus riwayat chat ini. Dipanggil oleh handler /reset.
    async resetConversation(chatId) {
      await store.clear(chatId);
    },
  };
}

// Bersihkan teks dari model sebelum dikirim ke user.
// Dipanggil oleh reply(). Model "thinking" (misalnya qwen3:4b dengan think=false)
// terbukti bisa menaruh penalarannya di content yang diakhiri "</think>". Bagian itu
// tidak boleh sampai ke user, jadi semua teks sampai "</think>" terakhir dibuang.
export function cleanModelOutput(content: string): string {
  const marker = "</think>";
  const markerIndex = content.lastIndexOf(marker);
  const answer =
    markerIndex === -1 ? content : content.slice(markerIndex + marker.length);
  return answer.trim();
}
