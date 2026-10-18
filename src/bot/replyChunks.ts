// Batas panjang teks satu pesan yang dikirim lewat Bot API.
export const TELEGRAM_MESSAGE_LIMIT = 4096;

// Pecah teks panjang menjadi beberapa bagian yang masing-masing muat dalam satu pesan.
// Dipanggil oleh handler teks sebelum mengirim jawaban model.
// Input: teks dan batas per bagian (default 4096). Output: array berisi minimal satu
// bagian kalau teks tidak kosong; array kosong kalau teks kosong.
// Aturan pemotongan, dari yang paling disukai:
//   1. di baris baru terakhir dalam batas (paragraf tetap utuh),
//   2. di spasi terakhir (kata tidak terpotong),
//   3. dipotong paksa di batas (kalau ada "kata" sepanjang 4096 karakter).
// Teks diolah per code point (Array.from) supaya emoji tidak terbelah.
export function splitMessage(
  text: string,
  limit: number = TELEGRAM_MESSAGE_LIMIT,
): string[] {
  const chunks: string[] = [];
  let remaining = Array.from(text);

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const cut = findCutIndex(window);
    chunks.push(window.slice(0, cut).join("").trimEnd());
    remaining = trimStartChars(remaining.slice(cut));
  }

  const last = remaining.join("").trim();
  if (last.length > 0) {
    chunks.push(last);
  }
  return chunks;
}

// Cari posisi potong terbaik di dalam window. Posisi 0 tidak dipakai, karena akan
// menghasilkan bagian kosong dan loop tidak maju.
function findCutIndex(window: string[]): number {
  const newline = window.lastIndexOf("\n");
  if (newline > 0) {
    return newline + 1;
  }
  const space = window.lastIndexOf(" ");
  if (space > 0) {
    return space + 1;
  }
  return window.length;
}

// Buang spasi/baris baru di awal bagian berikutnya.
function trimStartChars(chars: string[]): string[] {
  let start = 0;
  while (start < chars.length && /\s/.test(chars[start]!)) {
    start++;
  }
  return chars.slice(start);
}
