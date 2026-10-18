# Kera

Kera adalah asisten AI pribadi yang dipakai lewat Telegram. Model bahasa berjalan
lokal di komputer sendiri lewat Ollama, sehingga percakapan tidak dikirim ke layanan
AI pihak ketiga.

Project ini dibangun bertahap per milestone. Setiap milestone punya dokumen
pembelajaran sendiri di `docs/learning/milestones/`.

## Status saat ini

Milestone 2 (jawaban dari model lokal) selesai.

| Kemampuan                                                 | Status                       |
| --------------------------------------------------------- | ---------------------------- |
| Toolchain Node + TypeScript                               | Selesai                      |
| Bot Telegram: `/start`, `/ping`, allowlist user           | Selesai (Milestone 1-2)      |
| Jawaban dari model lokal `qwen3:4b-instruct` lewat Ollama | Selesai (Milestone 2)        |
| Konteks percakapan                                        | Direncanakan (Milestone 3)   |
| Database, notes, reminder, tool calling                   | Direncanakan (Milestone 4-8) |

Keterbatasan saat ini: Kera belum ingat pesan sebelumnya (setiap pesan berdiri sendiri),
hanya mengerti pesan teks, dan hanya aktif selama laptop dan Ollama menyala.

## Arsitektur singkat

Modular monolith: satu proses Node.js yang dibagi menjadi modul per tanggung jawab
(bot Telegram, integrasi AI, layanan bisnis, database). Detail ada di
[ADR-0001](docs/decisions/ADR-0001-initial-architecture.md).

```
Telegram app -> Telegram Bot API -> [proses Kera di laptop] -> Ollama (localhost)
```

## Prasyarat

- Windows 11 (project juga seharusnya jalan di macOS/Linux, tapi belum diuji)
- Node.js 24 atau lebih baru (`node -v`)
- npm (ikut terpasang bersama Node)
- Git
- Ollama, dengan model default sudah di-pull: `ollama pull qwen3:4b-instruct`
  (alasan pemilihan model: [ADR-0003](docs/decisions/ADR-0003-default-model-qwen3-instruct.md))

## Instalasi

Jalankan dari root project:

```
npm install
```

## Konfigurasi

Konfigurasi dibaca dari environment variable. Untuk development, salin template:

```
copy .env.example .env
```

Lalu isi nilainya di `.env`. File `.env` di-ignore oleh Git dan tidak boleh di-commit.

| Variabel             | Wajib | Keterangan                                                                             |
| -------------------- | ----- | -------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Ya    | Token dari @BotFather (`/newbot`). Rahasia.                                            |
| `ALLOWED_USER_IDS`   | Tidak | ID user Telegram yang boleh memakai bot, dipisah koma. Kosong = semua ditolak.         |
| `OLLAMA_BASE_URL`    | Tidak | Default `http://127.0.0.1:11434`. Jangan arahkan ke alamat publik.                     |
| `OLLAMA_MODEL`       | Tidak | Default `qwen3:4b-instruct`.                                                           |
| `OLLAMA_THINK`       | Tidak | `true`/`false`, default `false`. `true` hanya untuk model thinking seperti `qwen3:4b`. |
| `OLLAMA_TIMEOUT_MS`  | Tidak | Batas waktu satu jawaban, default `120000`.                                            |

Variabel yang dibiarkan kosong (`OLLAMA_MODEL=`) memakai nilai default.

Setup pertama: kosongkan `ALLOWED_USER_IDS`, jalankan bot, kirim pesan ke bot, lalu
salin ID kamu dari log `Ignored update ... id=<ID>` ke `.env` dan restart.
Langkah lengkap ada di [Milestone 1](docs/learning/milestones/milestone-01.md#18-verifikasi-manual).

`node --watch` tidak memantau `.env`. Setelah mengubah `.env`, hentikan (Ctrl+C) lalu
jalankan ulang.

## Menjalankan

| Perintah              | Fungsi                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| `npm run dev`         | Jalankan dengan auto-restart setiap file berubah (`node --watch`)       |
| `npm start`           | Jalankan sekali tanpa watch                                             |
| `npm run typecheck`   | Periksa tipe TypeScript tanpa menjalankan kode                          |
| `npm test`            | Jalankan test unit dan integrasi bot sekali (Vitest, tanpa Ollama asli) |
| `npm run test:watch`  | Sama, dijalankan ulang setiap file berubah                              |
| `npm run test:ollama` | Test integrasi ke Ollama asli (Ollama harus menyala)                    |

Node menjalankan file `.ts` langsung dengan membuang anotasi tipe, tanpa memeriksanya.
Karena itu `npm run typecheck` wajib dijalankan sebelum commit. Penjelasan lengkap ada di
[ADR-0002](docs/decisions/ADR-0002-run-typescript-with-node-type-stripping.md).

## Troubleshooting

| Gejala                                                             | Penyebab dan solusi                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `.env not found. Continuing without it.`                           | Normal kalau `.env` belum dibuat. Salin dari `.env.example`.                                                         |
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` atau syntax error di file `.ts` | Versi Node terlalu lama untuk type stripping. Pastikan `node -v` minimal v24.                                        |
| `TS1294 ... erasableSyntaxOnly`                                    | Kode memakai sintaks yang tidak bisa dibuang Node (misalnya `enum`). Ganti dengan union type atau object `as const`. |
| `TS2834 ... need explicit file extensions`                         | Import relatif wajib pakai ekstensi, contoh `./config/env.ts`.                                                       |
| `Invalid configuration: ...`                                       | Isi `.env` belum lengkap atau salah format. Pesan menunjuk variabel yang bermasalah.                                 |
| `Telegram API error 401 ...`                                       | Token salah atau sudah di-revoke di @BotFather.                                                                      |
| `Telegram API error 409 ... Conflict`                              | Ada instance Kera lain yang sedang jalan dengan token yang sama.                                                     |
| Bot tidak membalas                                                 | Cek log: kalau ada `Ignored update`, ID kamu belum ada di `ALLOWED_USER_IDS`.                                        |
| `Ollama check failed ... (unreachable)`                            | Ollama belum jalan. Cek `curl http://127.0.0.1:11434/api/version`.                                                   |
| `Ollama check failed ... (model_not_found)`                        | Jalankan `ollama pull` untuk model di `OLLAMA_MODEL`.                                                                |
| Bot membalas "nggak bisa menghubungi Ollama"                       | Ollama mati. `/ping` tetap bisa dipakai untuk memastikan bot sendiri hidup.                                          |

Troubleshooting lebih lengkap ada di
[Milestone 1](docs/learning/milestones/milestone-01.md#19-troubleshooting) (Telegram) dan
[Milestone 2](docs/learning/milestones/milestone-02.md#19-troubleshooting) (Ollama).

## Dokumentasi

- [Gambaran project](docs/learning/00-project-overview.md)
- [Development environment](docs/learning/01-development-environment.md)
- [Arsitektur aplikasi](docs/learning/02-application-architecture.md)
- [Alur request dan data](docs/learning/03-request-and-data-flow.md)
- [Milestone 0](docs/learning/milestones/milestone-00.md)
- [Milestone 1](docs/learning/milestones/milestone-01.md)
- [Milestone 2](docs/learning/milestones/milestone-02.md)
- [Keputusan arsitektur (ADR)](docs/decisions/)
- [Cara berkontribusi](CONTRIBUTING.md)
