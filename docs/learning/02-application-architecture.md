# 02 - Application Architecture

Dokumen ini menjelaskan struktur kode yang sudah ada. Bagian yang belum dibangun
ditandai "rencana".

## Komponen

```mermaid
flowchart LR
  TG[Telegram Bot API] <-->|long polling| IDX
  OL[Ollama<br/>127.0.0.1:11434]

  subgraph Proses Kera
    IDX[index.ts<br/>rakit dan jalankan]
    CFG[config/env.ts<br/>validasi env]
    BOT[bot/createBot.ts<br/>rakit Bot]
    AUTH[bot/auth.ts<br/>allowlist]
    HND[bot/handlers.ts<br/>command dan pesan]
    AST[ai/assistant.ts<br/>persona dan pembersihan]
    OC[ai/ollamaClient.ts<br/>HTTP ke Ollama]
    IDX --> CFG
    IDX --> OC
    IDX --> AST
    IDX --> BOT
    BOT --> AUTH
    BOT --> HND
    HND --> AST
    AST --> OC
  end

  OC -->|POST /api/chat| OL
```

| Modul | Tanggung jawab | Tidak boleh |
| --- | --- | --- |
| `src/index.ts` | Membaca config, merakit client -> assistant -> bot, cek Ollama, long polling, shutdown | Berisi logika balasan |
| `src/config/env.ts` | Satu-satunya tempat yang membaca `process.env`; menghasilkan `Config` bertipe | Mengetahui Telegram atau Ollama |
| `src/bot/createBot.ts` | Urutan middleware, error boundary | Memanggil `bot.start()` |
| `src/bot/auth.ts` | Memutuskan siapa boleh memakai bot | Membalas pesan |
| `src/bot/handlers.ts` | Menerjemahkan update Telegram ke panggilan assistant dan kembali; pesan error untuk user | Membuat request HTTP ke Ollama |
| `src/bot/replyChunks.ts` | Memecah teks panjang sesuai batas Telegram | |
| `src/bot/typing.ts` | Status "typing..." selama menunggu | |
| `src/ai/assistant.ts` | Persona Kera (system prompt), menyusun messages, membersihkan output model | Mengetahui Telegram |
| `src/ai/ollamaClient.ts` | HTTP ke Ollama: request, timeout, validasi respon, klasifikasi error | Mengetahui persona atau Telegram |
| `src/errors.ts` | `describeError`: ringkasan error yang aman untuk log | |

## Kenapa dipisah seperti ini

- Config terpusat: error konfigurasi muncul saat startup, bukan di tengah percakapan.
- Membuat bot dipisah dari menjalankan bot: test bisa menyuntikkan update palsu, dan
  webhook bisa ditambahkan nanti tanpa mengubah handler (ADR-0001).
- Auth sebagai middleware pertama: tidak ada handler yang "lupa" dicek.
- Bot tidak tahu Ollama, Ollama client tidak tahu Telegram. Handler hanya memanggil
  `assistant.reply(text)`. Kalau suatu saat model diganti ke API lain, yang berubah hanya
  `src/ai/`.
- `assistant` dipisah dari `ollamaClient`: client mengurus "bagaimana berbicara HTTP
  dengan Ollama", assistant mengurus "apa yang dikatakan Kera". Riwayat percakapan
  (Milestone 3) akan masuk ke assistant, bukan ke client.
- Dependency dioper sebagai parameter (`BotDependencies`, `fetch` di `OllamaClientOptions`),
  bukan diimpor global. Ini dependency injection versi paling sederhana: test bisa
  memberi versi palsu tanpa library mocking.

## Alur konfigurasi

```
.env -> (node --env-file-if-exists) -> process.env -> loadConfig() -> Config
  Config.telegramBotToken, allowedUserIds -> createBot()
  Config.ollama                          -> createOllamaClient()
```

## Alur error

| Sumber error | Ditangani di | Hasil |
| --- | --- | --- |
| Env tidak valid | `loadConfigOrExit()` di `index.ts` | Daftar masalah dicetak, exit code 1 |
| Ollama mati / model belum ada saat startup | `warnIfModelUnavailable()` di `index.ts` | Warning di log, bot tetap jalan |
| Token ditolak (401) atau ada instance lain (409) | `main().catch` di `index.ts` | `Kera failed: ...`, exit code 1 |
| Ollama gagal saat menjawab pesan | `createTextHandler()` di `handlers.ts` | Pesan ramah ke user sesuai `OllamaError.kind`, detail di log |
| Telegram gagal saat mengirim balasan | Error boundary di `createBot()` | Di-log, update berikutnya tetap diproses |
| Gagal mengirim status typing | `withTypingIndicator()` | Diabaikan (best effort) |

Semua pesan log dibentuk oleh `describeError()` yang hanya mengambil field aman,
sehingga token dan isi pesan user tidak ikut tercetak.

## Yang sengaja dibuat sederhana

- Logging memakai `console`.
- Update diproses berurutan (bawaan `bot.start()`). GPU juga hanya bisa mengerjakan satu
  jawaban pada satu waktu, jadi paralelisme tidak mempercepat apa pun untuk satu pengguna.
- Tidak ada retry ke Ollama. Gagal sekali langsung dilaporkan ke user.
- Belum ada folder `services/` dan `db/`.

## Kapan arsitektur ini perlu diubah

- Ada lebih dari satu pengguna aktif: satu jawaban lambat menahan pengguna lain.
  Pertimbangkan `@grammyjs/runner` dengan antrean per chat.
- Logika bisnis tumbuh (notes, reminder): pindahkan ke `services/` supaya handler hanya
  menerjemahkan Telegram ke pemanggilan service.
