# Kera

Kera adalah asisten AI pribadi yang dipakai lewat Telegram. Model bahasa berjalan
lokal di komputer sendiri lewat Ollama, sehingga percakapan tidak dikirim ke layanan
AI pihak ketiga.

Project ini dibangun bertahap per milestone. Setiap milestone punya dokumen
pembelajaran sendiri di `docs/learning/milestones/`.

## Status saat ini

Milestone 0 (setup project) selesai.

| Kemampuan | Status |
| --- | --- |
| Toolchain Node + TypeScript | Selesai |
| Bot Telegram (`/start`, terima pesan) | Direncanakan (Milestone 1) |
| Jawaban dari model lokal (Ollama) | Direncanakan (Milestone 2) |
| Konteks percakapan, database, notes, reminder, tool calling | Direncanakan (Milestone 3-8) |

Saat ini aplikasi belum melakukan apa pun selain mencetak satu baris ke console.

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
- Ollama dengan model `qwen3:4b` (baru dipakai mulai Milestone 2)

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

Belum ada variabel yang wajib diisi di Milestone 0.

## Menjalankan

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Jalankan dengan auto-restart setiap file berubah (`node --watch`) |
| `npm start` | Jalankan sekali tanpa watch |
| `npm run typecheck` | Periksa tipe TypeScript tanpa menjalankan kode |
| `npm test` | Jalankan test (Vitest, mulai Milestone 1) |

Node menjalankan file `.ts` langsung dengan membuang anotasi tipe, tanpa memeriksanya.
Karena itu `npm run typecheck` wajib dijalankan sebelum commit. Penjelasan lengkap ada di
[ADR-0002](docs/decisions/ADR-0002-run-typescript-with-node-type-stripping.md).

## Troubleshooting

| Gejala | Penyebab dan solusi |
| --- | --- |
| `.env not found. Continuing without it.` | Normal kalau `.env` belum dibuat. Salin dari `.env.example`. |
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` atau syntax error di file `.ts` | Versi Node terlalu lama untuk type stripping. Pastikan `node -v` minimal v24. |
| `TS1294 ... erasableSyntaxOnly` | Kode memakai sintaks yang tidak bisa dibuang Node (misalnya `enum`). Ganti dengan union type atau object `as const`. |
| `TS2834 ... need explicit file extensions` | Import relatif wajib pakai ekstensi, contoh `./config/env.ts`. |

## Dokumentasi

- [Gambaran project](docs/learning/00-project-overview.md)
- [Development environment](docs/learning/01-development-environment.md)
- [Milestone 0](docs/learning/milestones/milestone-00.md)
- [Keputusan arsitektur (ADR)](docs/decisions/)
- [Cara berkontribusi](CONTRIBUTING.md)
