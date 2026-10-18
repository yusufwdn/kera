# ADR-0001: Initial architecture and stack

Status: Accepted (2026-10-18)

## Context

Kera adalah asisten AI pribadi untuk satu pengguna, diakses lewat Telegram, berjalan
di laptop Windows dengan GPU 6 GB. Project ini juga bahan belajar, jadi arsitektur
harus mudah dipahami, gratis dijalankan, dan tidak butuh infrastruktur tambahan.

## Decision

1. Modular monolith dalam satu proses Node.js + TypeScript. Kode dibagi per
   tanggung jawab (`bot/`, `config/`, lalu `ai/`, `services/`, `db/` saat dibutuhkan).
2. grammY sebagai library Telegram.
3. Long polling untuk menerima update Telegram.
4. Ollama lokal sebagai runtime model, dimulai dengan `qwen3:4b`.
5. SQLite sebagai arah awal untuk persistensi (diputuskan detailnya di Milestone 4).
6. Akses dibatasi dengan allowlist Telegram user ID.

## Alternatives considered

### Struktur aplikasi

- Modular monolith (dipilih)
  - Pro: satu proses, satu perintah untuk menjalankan, mudah di-debug.
  - Kontra: semua modul ikut mati kalau proses crash.
- Microservices (bot dan AI dipisah)
  - Pro: bisa di-scale dan di-deploy terpisah.
  - Kontra: butuh komunikasi antar-proses, deployment, dan observability. Berlebihan
    untuk satu pengguna.

### Library Telegram

- grammY (dipilih)
  - Pro: ditulis dengan TypeScript, tipe update lengkap, middleware sederhana,
    dokumentasi bagus, aktif dirawat.
  - Kontra: komunitas lebih kecil dibanding Telegraf.
- Telegraf
  - Pro: populer, banyak contoh.
  - Kontra: tipe TypeScript lebih rumit, perkembangan lebih lambat.
- `node-telegram-bot-api`
  - Pro: sangat tipis.
  - Kontra: tanpa middleware, tipe kurang baik, banyak hal harus ditulis sendiri.

### Cara menerima update

- Long polling (dipilih): proses Kera terus memanggil `getUpdates` ke Telegram.
  - Pro: tidak butuh URL publik, HTTPS, atau port terbuka. Jalan di jaringan rumah.
  - Kontra: hanya satu instance boleh polling untuk satu token (kalau dua, Telegram
    membalas 409 Conflict). Ada sedikit overhead koneksi yang selalu terbuka.
- Webhook: Telegram mengirim HTTP POST ke server kita.
  - Pro: efisien, cocok untuk serverless dan skala besar.
  - Kontra: laptop harus bisa diakses dari internet (tunnel atau port forwarding),
    menambah permukaan serangan.

Catatan: cara menerima update tidak bergantung pada di mana model berjalan. Memakai
API model di cloud tetap bisa dengan long polling.

### Runtime model

- Ollama lokal (dipilih)
  - Pro: gratis, privat, API HTTP sederhana, manajemen model mudah.
  - Kontra: kualitas model 4B di bawah model cloud besar, bergantung pada laptop menyala.
- API hosted (OpenAI, Anthropic, dll.)
  - Pro: kualitas jawaban jauh lebih baik, tidak butuh GPU.
  - Kontra: berbayar per token, data dikirim ke pihak ketiga.

### Database

- SQLite (arah awal)
  - Pro: satu file, tanpa server, cukup untuk satu pengguna.
  - Kontra: tidak cocok untuk banyak proses yang menulis bersamaan.
- PostgreSQL
  - Pro: fitur lengkap, standar industri.
  - Kontra: harus menjalankan server database sendiri.

## Consequences

- Seluruh aplikasi dijalankan dengan satu perintah (`npm run dev`).
- Pembuatan bot (`createBot`) dipisah dari cara menjalankannya (`index.ts`), supaya
  webhook bisa ditambahkan nanti tanpa mengubah handler.
- Error handling memakai `bot.errorBoundary()`, bukan hanya `bot.catch()`, karena
  `bot.catch()` hanya berlaku di loop long polling. Dengan boundary, penanganan error
  tetap bekerja kalau nanti dijalankan lewat webhook (ditemukan saat Milestone 1).
- Kera hanya tersedia selama laptop menyala.
- Hanya satu instance Kera yang boleh berjalan dalam satu waktu.

## Revisit when

- Kera perlu tersedia 24/7 -> pindah ke VPS (tetap polling) atau serverless (wajib webhook).
- Kualitas model lokal tidak cukup -> pertimbangkan API hosted dengan ADR baru.
- Ada lebih dari satu proses yang perlu menulis ke database secara bersamaan -> evaluasi ulang SQLite.
