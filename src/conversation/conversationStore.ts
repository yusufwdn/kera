// Satu giliran percakapan: pesan user dan jawaban model untuk pesan itu.
// Riwayat disimpan per giliran, bukan per pesan, supaya tidak pernah ada pertanyaan
// tanpa jawaban (atau sebaliknya) di riwayat, dan pemotongan selalu membuang pasangan utuh.
export type Turn = {
  user: string;
  assistant: string;
};

// Tempat menyimpan riwayat percakapan per chat. Dipakai assistant.ts.
// Method mengembalikan Promise walaupun versi memori tidak butuh, supaya interface
// tidak perlu berubah saat penyimpanan diganti database di Milestone 4.
export type ConversationStore = {
  // Riwayat chat ini dari yang paling lama ke yang paling baru. Kosong kalau belum ada.
  getHistory(chatId: number): Promise<readonly Turn[]>;
  // Tambahkan satu giliran di akhir riwayat chat ini.
  appendTurn(chatId: number, turn: Turn): Promise<void>;
  // Hapus seluruh riwayat chat ini (/reset).
  clear(chatId: number): Promise<void>;
};

// Batas jumlah giliran yang disimpan per chat. Ini batas jumlah; batas ukuran
// (token) diterapkan terpisah di contextWindow.ts saat prompt disusun.
// 20 giliran cukup untuk satu obrolan, dan mencegah memori tumbuh tanpa batas
// kalau bot berjalan lama.
export const MAX_STORED_TURNS = 20;

// Buat store yang menyimpan riwayat di memori proses (Map chatId -> giliran).
// Dipanggil dari index.ts. Riwayat hilang saat proses berhenti.
// Key-nya chat.id, jadi setiap chat (pribadi atau grup) punya riwayat sendiri.
export function createInMemoryConversationStore(
  maxTurns: number = MAX_STORED_TURNS,
): ConversationStore {
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new RangeError("maxTurns must be a positive integer");
  }

  const turnsByChat = new Map<number, Turn[]>();

  return {
    // Kembalikan salinan, supaya pemanggil tidak bisa mengubah isi store secara tidak sengaja.
    async getHistory(chatId) {
      return [...(turnsByChat.get(chatId) ?? [])];
    },

    // Simpan giliran baru; kalau melebihi maxTurns, giliran paling lama dibuang.
    async appendTurn(chatId, turn) {
      const turns = turnsByChat.get(chatId) ?? [];
      turns.push({ user: turn.user, assistant: turn.assistant });
      if (turns.length > maxTurns) {
        turns.splice(0, turns.length - maxTurns);
      }
      turnsByChat.set(chatId, turns);
    },

    async clear(chatId) {
      turnsByChat.delete(chatId);
    },
  };
}
