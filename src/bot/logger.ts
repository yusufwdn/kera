// Bentuk minimal logger yang dipakai modul bot.
// index.ts mengoper `console`; test mengoper logger palsu supaya bisa memeriksa
// apa yang di-log tanpa mengotori output test.
export type Logger = Pick<Console, "info" | "warn" | "error">;
