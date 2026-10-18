# Milestone 1 - Telegram Bot Foundation

## 1. Tujuan

Bot Telegram minimal yang bisa start, membalas `/start`, menerima pesan teks dan
membalas echo, hanya untuk user di allowlist, dengan konfigurasi tervalidasi, error
yang tidak menjatuhkan proses, dan shutdown yang rapi.

## 2. Prasyarat

- Milestone 0 selesai.
- Akun Telegram dan akses ke @BotFather.

## 3. Konsep yang dipelajari

- Telegram Bot API, token bot, dan update.
- Long polling dan `update_id` / offset (lihat `03-request-and-data-flow.md`).
- Middleware dan `next()`.
- Validasi runtime dengan zod: schema, `safeParse`, `transform`.
- Async/await dan bagaimana error mengalir lewat `await next()`.
- Error boundary.
- Signal proses (SIGINT, SIGTERM) dan graceful shutdown.
- Unit test vs integration test tanpa jaringan.

## 4. Kenapa milestone ini perlu

Telegram adalah pintu masuk semua fitur berikutnya. Dengan memakai echo dulu, kita
bisa membuktikan koneksi, auth, dan penanganan error tanpa melibatkan model AI. Di
Milestone 2 yang berubah hanya isi `handleText`.

## 5. Urutan pengerjaan

1. Pasang `grammy`, `zod`, `vitest`.
2. `src/config/env.ts` + test. Semua modul lain bergantung pada `Config`.
3. `src/bot/auth.ts`, `handlers.ts`, `createBot.ts`, `logger.ts`.
4. Test: unit (`auth`, `handlers`, `describeError`) dan integrasi (`createBot` dengan update palsu).
5. `src/index.ts`: menjalankan long polling dan shutdown.
6. Verifikasi jalur gagal startup tanpa token asli.
7. Dokumentasi.
8. Uji manual dengan bot asli (bagian 18).

## 6. File

| File | Status |
| --- | --- |
| `src/config/env.ts`, `env.test.ts` | Baru |
| `src/bot/createBot.ts`, `createBot.test.ts` | Baru |
| `src/bot/auth.ts`, `auth.test.ts` | Baru |
| `src/bot/handlers.ts`, `handlers.test.ts` | Baru |
| `src/bot/logger.ts` | Baru |
| `src/index.ts` | Diubah: dari "hello" menjadi entry point bot |
| `.env.example` | Diubah: `TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS` |
| `package.json` | Diubah: dependency `grammy`, `zod`, dev dependency `vitest` |
| `docs/learning/02-*.md`, `03-*.md` | Baru |

## 7. Tanggung jawab file

Lihat tabel komponen di `02-application-architecture.md`.

## 8. Penjelasan fungsi penting

### `loadConfig(env)` - `src/config/env.ts`

- Input: objek env (default `process.env`). Di test diisi objek biasa.
- Validasi lewat `envSchema.safeParse(env)`. `safeParse` tidak melempar; ia
  mengembalikan `{ success: true, data }` atau `{ success: false, error }`. Ini contoh
  discriminated union: setelah `if (!result.success)`, TypeScript tahu bahwa di bawahnya
  `result.data` pasti ada (type narrowing).
- `TELEGRAM_BOT_TOKEN`: di-trim, wajib ada, harus cocok pola `<angka>:<huruf/angka/_/->`.
- `ALLOWED_USER_IDS`: default `""`, lalu `transform(parseUserIds)` mengubah string
  menjadi `Set<number>`. `transform` mengubah tipe output schema: input `string`,
  output `Set<number>`.
- Gagal -> `ConfigError` dengan daftar masalah. Nilai variabel tidak pernah dimasukkan
  ke pesan, karena bisa berupa secret.

Kenapa `Set` dan bukan array: pertanyaan yang diajukan auth adalah "apakah ID ini
ada?", dan `Set.has` menjawabnya langsung serta otomatis menghapus duplikat.

Kenapa ID dicek dengan regex `^\d+$` selain `Number()`: `Number("1e5")` = 100000 dan
`Number("0x10")` = 16, keduanya lolos sebagai angka padahal jelas salah ketik.

### `createAuthMiddleware(allowedUserIds, logger)` - `src/bot/auth.ts`

Middleware adalah fungsi `(ctx, next) => ...`. grammY menjalankan middleware sesuai
urutan pemasangan; memanggil `next()` berarti "lanjut ke middleware berikutnya", tidak
memanggilnya berarti "berhenti di sini".

- User tidak diizinkan -> log `warn` dengan ID, `return` tanpa `next()`.
- User diizinkan -> `await next()`. `await` penting: tanpa itu, error dari handler
  tidak akan kembali melewati middleware ini menuju error boundary.

Keputusan logika ada di `isUserAllowed()` (fungsi murni) supaya bisa di-test tanpa grammY.

### `createBot(config, logger, botConfig?)` - `src/bot/createBot.ts`

1. `new Bot(token, botConfig)`. `botConfig` dipakai test untuk memberi `botInfo`
   sehingga bot tidak perlu memanggil `getMe`.
2. `bot.errorBoundary(logUpdateError)` mengembalikan composer; semua middleware
   dipasang di composer itu sehingga error-nya tertangkap.
3. Urutan: auth -> `/start` -> `message:text` -> `message`. Handler yang lebih spesifik
   dipasang lebih dulu karena handler yang cocok tidak memanggil `next()`.
4. `bot.catch(logUpdateError)` sebagai jaring pengaman polling.

### `describeError(error)` - `src/bot/createBot.ts`

Parameter bertipe `unknown` karena di JavaScript apa saja bisa di-`throw`. `instanceof`
mempersempit tipe (narrowing):

- `GrammyError`: Telegram menjawab tapi menolak (400, 403, 409, 401).
- `HttpError`: request tidak sampai (jaringan).
- `Error` biasa, lalu fallback `String(error)`.

Hanya field tertentu yang diambil. `payload` (isi pesan) dan error di dalam `HttpError`
tidak dicetak.

### `buildEchoReply(text)` - `src/bot/handlers.ts`

Pesan user bisa sampai 4096 karakter, dan prefix `Kamu bilang: ` membuat balasan bisa
melebihi batas `sendMessage`. Teks dipotong per code point (`Array.from`), bukan per
unit UTF-16, supaya emoji tidak terbelah.

### `main()` dan `stopOnSignals()` - `src/index.ts`

`await bot.start()` baru selesai setelah `bot.stop()` dipanggil. Selama itu event loop
Node tetap hidup karena ada request polling yang terbuka. `stopOnSignals` mendaftarkan
`process.once("SIGINT" | "SIGTERM")` yang memanggil `bot.stop()`.

## 9. Alur data dan kontrol

Lihat `03-request-and-data-flow.md` untuk alur startup, pesan, error, dan shutdown.

## 10. Tipe dan dependency

| Nama | Dari | Arti |
| --- | --- | --- |
| `Config` | `env.ts` | Konfigurasi tervalidasi; `allowedUserIds` bertipe `ReadonlySet<number>` sehingga tidak bisa diubah setelah dibuat |
| `Logger` | `logger.ts` | `Pick<Console, "info" \| "warn" \| "error">`: ambil tiga method dari tipe `Console` |
| `Context` | grammY | Objek per update: `ctx.from`, `ctx.chat`, `ctx.message`, `ctx.reply()` |
| `Filter<Context, "message:text">` | grammY | Context yang dijamin punya `message.text` |
| `CommandContext<Context>` | grammY | Context untuk handler command |
| `MiddlewareFn<Context>` | grammY | Tipe fungsi middleware |
| `BotError` | grammY | Pembungkus error middleware; `err.error` adalah error asli, `err.ctx` konteksnya |

| Package | Versi | Alasan |
| --- | --- | --- |
| `grammy` | 1.46.0 | Library Telegram (ADR-0001) |
| `zod` | 4.6.7 | Validasi runtime; dipakai lagi untuk respon Ollama (M2) dan argumen tool (M7) |
| `vitest` | 5.0.5 (dev) | Test runner |

## 11. Keputusan dan alternatif

- Long polling, grammY, allowlist: ADR-0001.
- Validasi config dengan zod vs manual: zod dipilih karena tipe dan validasi berasal dari
  satu sumber. Alternatif manual lebih sedikit dependency tapi mudah tidak sinkron.
- Penyimpangan dari rencana: `ALLOWED_USER_IDS` boleh kosong (semua ditolak). Alasannya
  memecahkan masalah "ayam dan telur": pemilik belum tahu ID-nya sendiri saat setup.
  Alternatifnya meminta pemilik memakai bot pihak ketiga seperti @userinfobot.
- Penyimpangan dari rencana: rencana awal hanya memakai `bot.catch()`. Saat test, ternyata
  `bot.catch()` hanya bekerja di loop polling (`handleUpdates` di
  `node_modules/grammy/out/bot.js`), sedangkan `bot.handleUpdate()` (test, webhook) tetap
  melempar. Diganti `bot.errorBoundary()` yang bekerja di semua mode.
- Orang asing tidak dibalas sama sekali vs dibalas "akses ditolak": diam dipilih supaya
  bot tidak mengonfirmasi bahwa ia aktif.
- Pesan yang masuk saat bot mati tetap diproses saat bot hidup lagi (`drop_pending_updates`
  tidak diaktifkan). Untuk echo ini tidak berbahaya; akan dievaluasi ulang saat balasan
  memakai model (pesan lama bisa membanjiri GPU).

## 12. Trade-off dan keterbatasan

- Update diproses satu per satu. Satu balasan lambat menahan update berikutnya.
- Pesan yang gagal dibalas tidak dicoba ulang.
- `node --watch` hanya memantau file yang di-import, tidak memantau `.env`. Setelah
  mengubah `.env`, restart manual.
- Log hanya ke console dan hilang saat terminal ditutup.
- Hanya pesan teks yang dimengerti; command selain `/start` diperlakukan sebagai teks biasa.

## 13. Konfigurasi

| Variabel | Wajib | Format | Contoh |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Ya | `<angka>:<secret>` | `123456:ABC-def` (contoh palsu) |
| `ALLOWED_USER_IDS` | Tidak | ID dipisah koma | `123456789,987654321` |

## 14. Error handling dan edge case

| Kasus | Perilaku |
| --- | --- |
| Token tidak ada / kosong / salah format | Exit 1 sebelum menghubungi Telegram |
| Token format benar tapi tidak valid | `Kera failed: Telegram API error 401 in deleteWebhook: Unauthorized`, exit 1 |
| Dua instance berjalan | Instance kedua: 409 Conflict, exit 1 |
| User di luar allowlist | Tidak dibalas, `warn` di log |
| Update tanpa pengirim (`ctx.from` kosong) | Ditolak oleh auth |
| Stiker/foto/voice | Dibalas "baru bisa membaca pesan teks" |
| Pesan 4096 karakter | Balasan dipotong dengan `...` |
| `sendMessage` gagal | Di-log lewat error boundary, bot lanjut |
| User memblokir bot lalu bot mencoba membalas | 403 di-log, bot lanjut |

## 15. Keamanan

Threat model sederhana untuk milestone ini:

- Token bocor -> orang lain bisa mengendalikan bot. Mitigasi: token hanya di `.env`
  (di-ignore Git), tidak pernah di-log (diuji di `env.test.ts` dan `createBot.test.ts`).
  Kalau bocor, `/revoke` di @BotFather.
- Orang asing menemukan username bot -> diblokir allowlist sebelum handler mana pun.
  Ini belum melindungi dari pemilik akun yang diizinkan tapi akunnya diretas.
- Isi pesan user tidak di-log, baik saat sukses maupun error.
- Log `warn` untuk orang asing berisi ID dan username mereka. Ini data pribadi minimal
  yang diperlukan untuk setup; jangan bagikan log ke pihak lain.

## 16. Perintah

| Perintah | Tujuan |
| --- | --- |
| `npm install grammy@^1.46 zod@^4` | Dependency runtime |
| `npm install --save-dev vitest@^5` | Test runner |
| `npm test` | Jalankan semua test sekali |
| `npm run test:watch` | Jalankan test ulang setiap file berubah |
| `npm run typecheck` | Periksa tipe |
| `npm run dev` | Jalankan bot dengan auto-restart |

## 17. Test dan hasil aktual

`npm test`: 4 file, 30 test, semua lulus. `npm run typecheck`: lulus.

| File | Jenis | Yang diuji |
| --- | --- | --- |
| `env.test.ts` | Unit | Token valid/kosong/salah format, token tidak bocor di pesan error, parsing ID termasuk `1e5`, `0x10`, `-5`, angka di atas batas aman, semua masalah dilaporkan sekaligus |
| `auth.test.ts` | Unit | Di allowlist, di luar, tanpa pengirim, allowlist kosong |
| `handlers.test.ts` | Unit | Prefix echo, pemotongan di batas 4096, emoji tidak terbelah |
| `createBot.test.ts` | Integrasi tanpa jaringan | `/start`, echo, stiker, orang asing diabaikan, error tertangkap boundary, bot lanjut setelah error, `describeError` untuk GrammyError/HttpError tanpa membocorkan payload atau token |

Cara kerja test integrasi: `bot.handleUpdate(update)` menyuntikkan update palsu, dan
`bot.api.config.use(...)` (API transformer) mencegat semua panggilan keluar, merekam
method dan payload, lalu mengembalikan jawaban sukses palsu. Yang tidak diverifikasi:
koneksi asli, token asli, dan bentuk update asli dari Telegram.

Mutation check (sengaja merusak kode untuk memastikan test bisa gagal):

- Middleware auth dinonaktifkan -> 1 test gagal (orang asing).
- Error boundary dihapus -> 2 test gagal (error tertangkap, bot lanjut setelah error).

Jalur gagal startup diuji langsung dengan `node src/index.ts`:

- Tanpa env -> `TELEGRAM_BOT_TOKEN: is required`, exit 1.
- Token `salah token`, ID `abc` -> dua masalah dilaporkan, exit 1.
- Token format benar tapi palsu -> `Telegram API error 401 in deleteWebhook: Unauthorized`, exit 1.

## 18. Verifikasi manual

Semua perintah dari root project, di PowerShell.

1. Di Telegram, buka @BotFather -> `/newbot` -> ikuti instruksi. Simpan token.
2. Buka `.env` di editor (bukan di chat), isi `TELEGRAM_BOT_TOKEN=...`, biarkan
   `ALLOWED_USER_IDS=` kosong.
3. `npm run dev`. Harapan: warning allowlist kosong, lalu
   `Kera is running as @<username bot> (long polling)`.
4. Kirim pesan ke bot. Harapan: tidak ada balasan, log
   `Ignored update ... from unauthorized user id=<ID kamu> ...`.
5. Salin ID itu ke `ALLOWED_USER_IDS` di `.env`. Ctrl+C, lalu `npm run dev` lagi
   (watch tidak memantau `.env`).
6. Kirim `/start` -> balasan sapaan dengan nama depanmu.
7. Kirim `halo` -> `Kamu bilang: halo`.
8. Kirim stiker -> `Maaf, untuk sekarang aku baru bisa membaca pesan teks.`
9. Buka terminal kedua, jalankan `npm start`. Harapan: terminal kedua keluar dengan
   409 Conflict, terminal pertama tetap jalan (bisa juga ikut mencatat error 409 sesaat).
10. Ctrl+C di terminal pertama. Harapan: `Received SIGINT, stopping Kera...` lalu `Kera stopped.`

Hasil langkah 9 dan 10 di Windows belum terverifikasi saat dokumen ini ditulis; catat
hasilnya di sini setelah dicoba.

## 19. Troubleshooting

| Gejala | Penyebab dan solusi |
| --- | --- |
| `TELEGRAM_BOT_TOKEN: is required` padahal sudah diisi | `.env` tidak di root project, atau nama variabel salah ketik |
| `does not look like a token from @BotFather` | Ada kutip, spasi di tengah, atau token terpotong |
| `401 ... Unauthorized` | Token salah atau sudah di-revoke |
| `409 ... Conflict` | Ada instance lain berjalan (terminal lain, atau proses yang belum mati). Tutup semuanya |
| Bot tidak membalas, log `Ignored update` | ID belum ada di `ALLOWED_USER_IDS`, atau `.env` diubah tanpa restart |
| Bot tidak membalas, tidak ada log sama sekali | Proses tidak jalan, atau pesan dikirim ke bot lain |
| `Network error while contacting Telegram` | Koneksi internet atau DNS bermasalah |

## 20. Latihan

1. Tukar urutan `protectedBot.on("message", ...)` dan `protectedBot.on("message:text", ...)`
   di `createBot.ts`. Tebak dulu: apa balasan untuk `halo`? Test mana yang gagal?
2. Hapus `await` di depan `next()` di `auth.ts`. Jalankan `npm test`. Kenapa hasilnya begitu?
3. Kenapa `isUserAllowed` menerima `number | undefined`, bukan `number`?
4. Tambahkan command `/ping` yang membalas `pong`, lengkap dengan test di `createBot.test.ts`.

## 21. Gap dan milestone berikutnya

- Balasan masih echo.
- Belum ada retry, pemrosesan paralel, atau log persisten.

Milestone 2 mengganti echo dengan jawaban dari Ollama (`qwen3:4b`): request ke
`/api/chat`, timeout, validasi respon dengan zod, penanganan mode thinking qwen3, dan
indikator "typing" selama model berpikir.
