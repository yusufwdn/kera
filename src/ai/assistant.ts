import type { ChatMessage, OllamaClient } from "./ollamaClient.ts";

// Instruksi persona yang dikirim sebagai pesan "system" di setiap permintaan.
// Model kecil cenderung memakai Markdown; bot mengirim teks polos (tanpa parse_mode),
// jadi Markdown diminta untuk dihindari supaya tidak muncul tanda ** di Telegram.
// Batas kemampuan disebut eksplisit supaya model tidak berpura-pura bisa menyimpan
// catatan atau membuat reminder (fitur itu baru ada di milestone berikutnya).
export const SYSTEM_PROMPT = [
  "Kamu adalah Kera, asisten pribadi yang ramah dan to the point.",
  "Jawab dalam bahasa yang dipakai pengguna; default bahasa Indonesia santai.",
  "Utamakan jawaban singkat dan jelas. Tulis panjang hanya kalau diminta.",
  "Tulis teks polos tanpa Markdown: jangan pakai **, #, atau tabel.",
  "Kamu belum bisa mengingat percakapan sebelumnya, menyimpan catatan, membuat pengingat,",
  "atau mengakses internet. Kalau diminta, katakan terus terang bahwa fitur itu belum ada.",
].join("\n");

// Batas token per jawaban yang dipakai saat membuat ollamaClient di index.ts.
// Sekitar 1024 token cukup untuk beberapa paragraf (~20 detik di RTX 3050).
export const MAX_REPLY_TOKENS = 1024;

export const EMPTY_REPLY_FALLBACK =
  "Hmm, aku nggak dapat jawaban kali ini. Coba tanya dengan kalimat lain, ya.";
export const TRUNCATED_NOTICE =
  "\n\n(Jawaban terpotong karena terlalu panjang. Minta lanjutannya kalau perlu.)";

export type Assistant = {
  reply(userText: string): Promise<string>;
};

// Buat assistant di atas ollamaClient.
// Dipanggil dari index.ts; hasilnya diinject ke createBot() sehingga handler tidak tahu
// apa-apa soal Ollama. Di test, Assistant bisa diganti objek palsu.
export function createAssistant(client: OllamaClient): Assistant {
  return {
    // Kirim satu pesan user (tanpa riwayat) dan kembalikan teks jawaban yang siap dikirim.
    // Error dari client (OllamaError) dibiarkan naik ke handler untuk dijadikan pesan user.
    async reply(userText) {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText },
      ];

      const result = await client.chat(messages);
      const text = cleanModelOutput(result.content);

      if (text.length === 0) {
        return EMPTY_REPLY_FALLBACK;
      }
      if (result.doneReason === "length") {
        return text + TRUNCATED_NOTICE;
      }
      return text;
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
