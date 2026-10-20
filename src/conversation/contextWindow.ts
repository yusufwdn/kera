import type { ChatMessage } from "../ai/ollamaClient.ts";
import type { Turn } from "./conversationStore.ts";

// Perkiraan jumlah karakter per token. Diukur dengan prompt_eval_count Ollama pada
// qwen3:4b-instruct: teks Indonesia sekitar 3.07, kode sekitar 2.91, Inggris sekitar 4.42.
// Dipakai 2.5 (lebih kecil dari semua hasil ukur) supaya perkiraan cenderung
// berlebih: lebih baik membuang satu giliran lama daripada prompt dipotong Ollama.
export const CHARS_PER_TOKEN_ESTIMATE = 2.5;

// Token tambahan per pesan untuk penanda role dari chat template model.
// Hasil ukur: 10 pesan "halo" menambah 70 token, jadi sekitar 5 sampai 6 per pesan
// di luar isinya. Dibulatkan ke atas.
export const MESSAGE_OVERHEAD_TOKENS = 8;

// Perkirakan berapa token yang dipakai satu pesan, termasuk overhead role.
// Dipanggil oleh buildPrompt(). Memakai panjang string (UTF-16), jadi emoji dihitung
// 2 karakter; ini ikut membuat perkiraan cenderung berlebih.
export function estimateMessageTokens(content: string): number {
  return (
    Math.ceil(content.length / CHARS_PER_TOKEN_ESTIMATE) +
    MESSAGE_OVERHEAD_TOKENS
  );
}

// Hitung berapa token yang boleh dipakai prompt (system + riwayat + pesan baru).
// Dipanggil dari index.ts saat merakit assistant. Sisa context window disediakan untuk
// jawaban, karena Ollama memakai satu context window untuk input dan output sekaligus.
// Contoh: numCtx 8192, maxOutputTokens 1024 -> 7168 token untuk prompt.
export function promptTokenBudget(
  numCtx: number,
  maxOutputTokens: number,
): number {
  return numCtx - maxOutputTokens;
}

export type BuiltPrompt = {
  messages: ChatMessage[];
  // Jumlah giliran riwayat yang ikut dikirim. Dipakai untuk log.
  historyTurns: number;
};

// Susun messages untuk /api/chat: system prompt, giliran riwayat yang muat, lalu pesan baru.
// Dipanggil oleh assistant.reply() setiap ada pesan masuk.
// System prompt dan pesan baru selalu dikirim. Riwayat diambil dari yang paling baru
// mundur ke yang paling lama, satu giliran (pertanyaan + jawaban) sekaligus, selama
// total perkiraan token masih <= budget. Begitu satu giliran tidak muat, semua giliran
// yang lebih lama ikut dibuang, supaya riwayat yang dikirim selalu berurutan tanpa celah.
// Kalau pesan baru sendiri sudah melebihi budget, riwayat kosong dan prompt tetap
// dikirim apa adanya. Dengan OLLAMA_NUM_CTX minimal 4096 ini tidak terjadi untuk pesan
// Telegram (maksimal 4096 karakter). Kalau tetap terjadi, Ollama menolak dengan HTTP 400
// dan user mendapat pesan error biasa.
export function buildPrompt(input: {
  systemPrompt: string;
  history: readonly Turn[];
  userText: string;
  budget: number;
}): BuiltPrompt {
  let usedTokens =
    estimateMessageTokens(input.systemPrompt) +
    estimateMessageTokens(input.userText);

  let firstKept = input.history.length;
  for (let index = input.history.length - 1; index >= 0; index--) {
    const turn = input.history[index]!;
    const turnTokens =
      estimateMessageTokens(turn.user) + estimateMessageTokens(turn.assistant);
    if (usedTokens + turnTokens > input.budget) {
      break;
    }
    usedTokens += turnTokens;
    firstKept = index;
  }

  const keptTurns = input.history.slice(firstKept);
  const messages: ChatMessage[] = [
    { role: "system", content: input.systemPrompt },
  ];
  for (const turn of keptTurns) {
    messages.push({ role: "user", content: turn.user });
    messages.push({ role: "assistant", content: turn.assistant });
  }
  messages.push({ role: "user", content: input.userText });

  return { messages, historyTurns: keptTurns.length };
}
