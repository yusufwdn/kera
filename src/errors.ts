import { GrammyError, HttpError } from "grammy";
import { OllamaError } from "./ai/ollamaClient.ts";

// Ubah error menjadi satu baris yang aman untuk di-log.
// Dipanggil dari error boundary bot, handler teks, dan index.ts.
// Sengaja hanya mengambil field yang diketahui aman (nama, kode, deskripsi), bukan
// seluruh objek error, supaya data request (payload berisi pesan user, URL berisi
// token) tidak ikut tercetak.
export function describeError(error: unknown): string {
  if (error instanceof GrammyError) {
    // Telegram menjawab, tapi menolak request (misalnya 400 Bad Request, 403 bot diblokir user).
    return `Telegram API error ${error.error_code} in ${error.method}: ${error.description}`;
  }
  if (error instanceof HttpError) {
    // Request tidak sampai ke Telegram (jaringan putus, DNS, timeout).
    return `Network error while contacting Telegram: ${error.message}`;
  }
  if (error instanceof OllamaError) {
    // Pesan OllamaError dibuat sendiri di ollamaClient.ts dan tidak berisi isi percakapan.
    return `Ollama error (${error.kind}): ${error.message}`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return `Unknown error: ${String(error)}`;
}
