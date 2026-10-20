# Milestone 2 - Connect Telegram to Local Ollama

## 1. Tujuan

Pesan teks dari user yang diizinkan dijawab oleh model lokal lewat Ollama, dengan
indikator "typing...", timeout, validasi respon, pesan error yang jelas, dan tanpa
pernah meneruskan penalaran model ke user.

## 2. Prasyarat

- Milestone 1 selesai, bot bisa dihubungi dari Telegram.
- Ollama berjalan di `http://127.0.0.1:11434` (`curl http://127.0.0.1:11434/api/version`).
- Model default sudah di-pull: `ollama pull qwen3:4b-instruct`.

## 3. Konsep yang dipelajari

- REST API lokal: `POST /api/chat` dan `POST /api/show` milik Ollama.
- Format pesan chat (`system`, `user`, `assistant`) dan system prompt.
- `fetch`, `AbortSignal.timeout`, dan beda error jaringan, timeout, serta status HTTP.
- Output model sebagai input yang tidak dipercaya: divalidasi bentuknya, dibersihkan isinya.
- Model "thinking" vs "instruct".
- Token, `num_predict`, dan `done_reason`.
- Timer (`setInterval`) dan membersihkannya di `finally`.
- Generic `<T>` di TypeScript.
- Fake timers dan dependency injection di test.

## 4. Kenapa milestone ini perlu

Ini MVP: setelah milestone ini Kera sudah berguna sebagai asisten tanya jawab. Telegram
sudah stabil di Milestone 1, jadi semua masalah baru pasti berasal dari integrasi model.

## 5. Urutan pengerjaan

1. Uji Ollama langsung dengan `curl` untuk melihat format asli dan latensi (bagian 11).
2. Pull `qwen3:4b-instruct` dan ukur ulang (ADR-0003).
3. Tambah konfigurasi Ollama di `src/config/env.ts` + test.
4. `src/ai/ollamaClient.ts` + test dengan fetch palsu, lalu cek dengan Ollama asli.
5. `src/ai/assistant.ts` + test.
6. `src/bot/replyChunks.ts`, `src/bot/typing.ts`, handler, `createBot`, `index.ts` + test.
7. Mutation check, test integrasi ke Ollama asli, cek jalur startup.
8. Dokumentasi.
9. Uji manual lewat Telegram (bagian 18).

## 6. File

| File | Status |
| --- | --- |
| `src/ai/ollamaClient.ts`, `.test.ts`, `.integration.test.ts` | Baru |
| `src/ai/assistant.ts`, `.test.ts` | Baru |
| `src/bot/replyChunks.ts`, `.test.ts` | Baru (menggantikan `buildEchoReply`) |
| `src/bot/typing.ts`, `.test.ts` | Baru |
| `src/errors.ts`, `.test.ts` | Baru (`describeError` dipindah dari `createBot.ts`) |
| `src/bot/handlers.ts`, `.test.ts` | Diubah: echo diganti assistant, tambah `/ping`, `userMessageForError` |
| `src/bot/createBot.ts`, `.test.ts` | Diubah: menerima `BotDependencies` |
| `src/config/env.ts`, `.test.ts` | Diubah: variabel `OLLAMA_*`, nilai kosong dianggap tidak diisi |
| `src/index.ts` | Diubah: merakit client dan assistant, cek Ollama saat startup |
| `package.json` | Diubah: script `test` meng-exclude test integrasi, tambah `test:ollama` |
| `.env.example` | Diubah |
| `docs/decisions/ADR-0003-default-model-qwen3-instruct.md` | Baru |

`describeError` dipindah ke `src/errors.ts` karena sekarang dipakai bot, handler, dan
`index.ts`, dan harus mengenal error grammY maupun Ollama. Kalau tetap di `createBot.ts`,
`handlers.ts` harus mengimpor `createBot.ts` yang juga mengimpor `handlers.ts` (import melingkar).

## 7. Tanggung jawab file

Lihat tabel komponen di `02-application-architecture.md`.

## 8. Penjelasan fungsi penting

### `createOllamaClient(options)` - `src/ai/ollamaClient.ts`

Mengembalikan objek `{ chat, checkModelAvailable }`. Fungsi dalam (`postJson`) bisa memakai
`options` dari fungsi luar karena closure: fungsi di JavaScript "mengingat" variabel di
tempat ia dibuat.

`postJson(path, body, timeoutMs)` adalah satu-satunya tempat yang menyentuh HTTP:

1. `fetch(url, { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })`.
   Gagal di sini -> `toRequestError`: `TimeoutError` -> `timeout`, selain itu -> `unreachable`.
2. `response.text()`. Body dibaca sebagai teks dulu (bukan langsung `.json()`), supaya
   kalau status error, isi body tetap bisa dipakai untuk pesan.
3. `!response.ok` -> `toHttpError`: 404 -> `model_not_found`, lainnya -> `http_error`.
4. `JSON.parse` gagal -> `invalid_response`.

`chat(messages)` lalu memvalidasi JSON dengan `chatResponseSchema`. Kalau tidak cocok ->
`invalid_response`. Hasil: `{ content, doneReason }`.

Kenapa `fetch` bisa diinject (`options.fetch`): test bisa mensimulasikan Ollama mati,
lambat, atau mengirim sampah tanpa menjalankan Ollama.

Timeout dari `AbortSignal.timeout` berlaku sampai body selesai dibaca. Dengan
`stream: false`, Ollama baru mengirim body setelah seluruh jawaban selesai, jadi
timeout 120 detik mencakup seluruh waktu generate.

### `OllamaError` dan `OllamaErrorKind`

`OllamaErrorKind` adalah union type dari string literal. Di `userMessageForError`,
`switch (error.kind)` mencakup kelima nilai. Karena tidak ada `default`, kalau suatu saat
ada kind baru yang lupa ditangani, fungsi itu akan jatuh ke pesan generik di bawahnya.

`super(message, options)` dengan `{ cause }` menyimpan error asli (misalnya TypeError dari
fetch) untuk debugging, tanpa mencampurnya ke pesan.

### `createAssistant(client)` dan `cleanModelOutput` - `src/ai/assistant.ts`

`reply(userText)` menyusun `[system, user]`, memanggil `client.chat`, lalu:

- `cleanModelOutput` membuang semua teks sampai `</think>` terakhir, lalu trim.
- Kosong -> `EMPTY_REPLY_FALLBACK`.
- `doneReason === "length"` -> tambahkan `TRUNCATED_NOTICE`.

`SYSTEM_PROMPT` meminta teks polos tanpa Markdown karena balasan dikirim tanpa
`parse_mode`, dan menyebut fitur yang belum ada supaya model tidak berpura-pura bisa.

### `createTextHandler(assistant, logger)` - `src/bot/handlers.ts`

Factory: fungsi yang mengembalikan handler. Dua jalur error dipisah dengan sengaja:

- Error dari `assistant.reply` ditangkap di handler -> pesan ramah ke user. Ini kegagalan
  yang diharapkan (Ollama mati) dan user perlu tahu.
- Error dari `ctx.reply` (Telegram) tidak ditangkap -> naik ke error boundary. Kalau
  Telegram sendiri gagal, tidak ada gunanya mencoba membalas lewat Telegram.

### `withTypingIndicator(ctx, work, refreshMs)` - `src/bot/typing.ts`

Status typing di Telegram hilang sekitar 5 detik, jadi dikirim ulang tiap 4 detik dengan
`setInterval`. `try { return await work(); } finally { clearInterval(timer); }` menjamin
timer berhenti, baik `work` berhasil maupun gagal. `await` di dalam `try` wajib: tanpa
`await`, `finally` berjalan sebelum promise selesai dan timer berhenti terlalu cepat.

Generic `<T>`: `withTypingIndicator(ctx, () => assistant.reply(text))` bertipe
`Promise<string>` karena `T` disimpulkan (type inference) dari tipe hasil `work`.

### `splitMessage(text, limit)` - `src/bot/replyChunks.ts`

Selama sisa teks lebih panjang dari `limit`: ambil jendela `limit` karakter, potong di baris
baru terakhir, kalau tidak ada di spasi terakhir, kalau tidak ada juga potong paksa.
Diolah per code point agar emoji tidak terbelah.

### `dropEmptyValues(env)` - `src/config/env.ts`

`.env.example` berisi baris seperti `OLLAMA_MODEL=`. Setelah disalin ke `.env`, nilainya
`""` (string kosong), bukan `undefined`, sehingga `.default()` zod tidak berlaku dan
validasi gagal. Fungsi ini menghapus key yang nilainya kosong sebelum validasi.

Jebakan lain yang dihindari: `z.coerce.boolean()` memakai `Boolean("false")`, yang hasilnya
`true` karena string tidak kosong. Karena itu `OLLAMA_THINK` divalidasi sebagai
`z.enum(["true", "false"])`.

## 9. Alur data dan kontrol

Lihat `03-request-and-data-flow.md`: startup, satu pesan dari pemilik, jawaban panjang,
Ollama gagal, dan shutdown.

## 10. Tipe dan dependency

| Nama | Dari | Arti |
| --- | --- | --- |
| `ChatMessage` | `ollamaClient.ts` | `{ role: "system" \| "user" \| "assistant", content }` |
| `ChatResult` | `ollamaClient.ts` | `{ content, doneReason }` hasil validasi |
| `OllamaClient` | `ollamaClient.ts` | `{ chat, checkModelAvailable }` |
| `OllamaClientOptions` | `ollamaClient.ts` | `OllamaConfig & { maxOutputTokens, fetch? }`; `&` = intersection type, gabungan dua tipe |
| `Assistant` | `assistant.ts` | `{ reply(userText): Promise<string> }` |
| `BotDependencies` | `createBot.ts` | Semua yang dibutuhkan bot dari luar |
| `OllamaConfig` | `env.ts` | `{ baseUrl, model, think, timeoutMs }` |

Tidak ada dependency npm baru. `fetch`, `AbortSignal`, `Response`, dan `DOMException`
sudah bawaan Node 24.

## 11. Keputusan dan alternatif

Keputusan yang disetujui sebelum implementasi:

- Model default `qwen3:4b-instruct`: ADR-0003, termasuk pengukuran yang mendasarinya.
- Non-streaming + typing, bukan streaming dengan edit pesan.
  Streaming lebih responsif tapi butuh parsing NDJSON per baris, terkena rate limit
  edit pesan Telegram, dan jauh lebih sulit di-test. Dengan model instruct, jawaban pendek
  sudah keluar di bawah 1 detik dan jawaban beberapa paragraf sekitar 5 detik.
- `fetch` bawaan + zod, bukan package `ollama`.
  Package resmi memberi tipe lengkap, tapi menyembunyikan detail HTTP yang ingin dipelajari,
  dan respon tetap perlu divalidasi karena tipe TypeScript tidak memeriksa data saat runtime.
- Pesan yang masuk saat bot mati tetap diproses.

Keputusan kecil:

- Teks polos tanpa `parse_mode`. Markdown dari model sering tidak valid untuk Telegram
  (error 400), dan output model tidak dipercaya. Akibatnya kalau model tetap menulis `**`,
  tanda itu tampil apa adanya.
- `num_predict` 1024 (`MAX_REPLY_TOKENS`), sekitar 20 detik di RTX 3050.
- Timeout default 120 detik, bisa diatur lewat `OLLAMA_TIMEOUT_MS`.
- Cek Ollama saat startup hanya warning, karena Ollama bisa dinyalakan belakangan.
- `/ping` (dari latihan Milestone 1) dijadikan command yang tidak memanggil model.

Penyimpangan dari rencana: tidak ada.

## 12. Trade-off dan keterbatasan

- Belum ada riwayat: setiap pesan berdiri sendiri. "Terus?" tidak dimengerti model.
- Tidak ada retry ke Ollama.
- Update diproses berurutan. Selama satu jawaban dibuat, pesan berikutnya menunggu.
- Model kecil kadang keluar dari instruksi (memakai Markdown, emoji, atau bahasa lain).
- Ollama melepas model dari VRAM setelah 5 menit tidak dipakai (`keep_alive` default),
  sehingga pesan pertama setelah lama diam terkena load sekitar 7 detik.
- Context window yang dimuat Ollama 4096 token (terlihat di `GET /api/ps`). Cukup untuk
  satu pertanyaan, akan menjadi batasan di Milestone 3.

## 13. Konfigurasi

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Harus http/https; trailing slash dibuang |
| `OLLAMA_MODEL` | `qwen3:4b-instruct` | Nama dari `ollama list` |
| `OLLAMA_THINK` | `false` | `"true"` atau `"false"`; `true` hanya untuk model thinking |
| `OLLAMA_TIMEOUT_MS` | `120000` | 1000 sampai 600000 |

Nilai kosong (`OLLAMA_MODEL=`) diperlakukan sama dengan tidak diisi.

Contoh memakai model thinking:

```
OLLAMA_MODEL=qwen3:4b
OLLAMA_THINK=true
```

## 14. Error handling dan edge case

| Kasus | Perilaku | Terverifikasi |
| --- | --- | --- |
| Ollama mati saat startup | Warning `Ollama check failed ... (unreachable)`, bot tetap jalan | Ya, port salah |
| Model belum di-pull saat startup | Warning `model_not_found ... Run "ollama pull <model>"` | Ya |
| Ollama mati saat menjawab | User: "Aku nggak bisa menghubungi Ollama..." | Test unit + manual |
| Jawaban lebih dari timeout | User: "Aku kelamaan mikir..." | Test unit + client asli dengan timeout 1 ms |
| Respon bukan JSON / bentuk aneh | User: "Ollama membalas dengan respon yang nggak bisa aku pakai..." | Test unit |
| Jawaban terpotong `num_predict` | Jawaban + "(Jawaban terpotong ...)" | Test unit + Ollama asli |
| Model menjawab kosong | "Hmm, aku nggak dapat jawaban kali ini..." | Test unit |
| Penalaran bocor dengan `</think>` | Dibuang sebelum dikirim | Test unit dengan teks yang teramati dari `qwen3:4b` |
| Jawaban lebih dari 4096 karakter | Dikirim sebagai beberapa pesan | Test unit + integrasi bot |
| `/ping` saat Ollama mati | Tetap `pong` | Test integrasi bot |
| Gagal mengirim status typing | Diabaikan, jawaban tetap dikirim | Test unit |
| `OLLAMA_THINK=yes`, `OLLAMA_TIMEOUT_MS=10` | Exit 1 dengan pesan per variabel | Ya |

## 15. Keamanan

- Ollama API tidak punya autentikasi. Default `127.0.0.1` dan `.env.example` mengingatkan
  untuk tidak mengubahnya ke alamat publik.
- Output model tidak dipercaya: divalidasi bentuknya (zod), dibersihkan dari penalaran,
  dikirim sebagai teks polos (model tidak bisa menyisipkan format atau link tersembunyi
  lewat `parse_mode`), dan dipecah sesuai batas Telegram.
- Log hanya berisi metadata (update_id, durasi, jumlah pesan) dan jenis error. Isi pesan
  user dan isi jawaban tidak pernah di-log (diuji di `createBot.test.ts`).
- Pesan error ke user tidak berisi URL, status HTTP, atau pesan internal (diuji di
  `handlers.test.ts` dan `createBot.test.ts`).
- Prompt injection: user bisa menyuruh model mengabaikan system prompt. Saat ini dampaknya
  kecil karena model tidak punya akses ke data atau aksi apa pun. Ini menjadi penting di
  Milestone 7 (tool calling).
- `num_predict` dan timeout membatasi berapa lama GPU dipakai untuk satu pesan.

## 16. Perintah

| Perintah | Tujuan |
| --- | --- |
| `ollama pull qwen3:4b-instruct` | Unduh model default |
| `ollama list` | Lihat model yang terpasang |
| `curl http://127.0.0.1:11434/api/ps` | Lihat model yang sedang dimuat, VRAM, dan context length |
| `npm test` | Test unit dan integrasi bot (tanpa Ollama asli) |
| `npm run test:ollama` | Test integrasi ke Ollama asli (butuh Ollama menyala) |
| `npm run typecheck` | Periksa tipe |
| `npm run dev` | Jalankan bot |

Mencoba Ollama langsung tanpa bot (Git Bash):

```
curl http://127.0.0.1:11434/api/chat -d '{"model":"qwen3:4b-instruct","stream":false,"messages":[{"role":"user","content":"halo"}]}'
```

## 17. Test dan hasil aktual

`npm test`: 9 file, 81 test, semua lulus. `npm run typecheck`: lulus.
`npm run test:ollama`: 4 test, semua lulus terhadap `qwen3:4b-instruct` asli.

| File | Jenis | Yang diuji |
| --- | --- | --- |
| `env.test.ts` | Unit | Default Ollama, nilai kosong = default, nilai kustom, `"false"` menjadi false, URL/boolean/timeout tidak valid |
| `ollamaClient.test.ts` | Unit, fetch palsu | Bentuk request, `done_reason`, unreachable, timeout (termasuk signal benar-benar membatalkan), 404, 500, non-JSON, bentuk respon salah, `/api/show` |
| `assistant.test.ts` | Unit, client palsu | Urutan system/user, trim, catatan terpotong, fallback kosong, error diteruskan, pembersihan `</think>` |
| `replyChunks.test.ts` | Unit | Pemotongan di baris baru, spasi, paksa; tidak ada kata hilang; emoji utuh |
| `typing.test.ts` | Unit, fake timers | Typing dikirim ulang tiap 4 detik, berhenti saat selesai maupun saat error, gagal typing tidak menggagalkan jawaban |
| `handlers.test.ts` | Unit | Pesan per jenis error, tidak membocorkan pesan teknis |
| `createBot.test.ts` | Integrasi bot, tanpa jaringan | `/start` dan `/ping` tanpa model, typing lalu jawaban, jawaban dipecah, log tanpa isi pesan, error Ollama menjadi pesan ramah, stiker, orang asing, error Telegram, bot lanjut setelah error |
| `errors.test.ts` | Unit | `describeError` untuk GrammyError, HttpError, OllamaError, non-Error |
| `ollamaClient.integration.test.ts` | Integrasi, Ollama asli | Model ada, jawaban tidak kosong, `length` saat batas kecil, model tidak ada -> `model_not_found` |

Mutation check:

- `clearInterval` di `typing.ts` dihapus -> 2 test gagal.
- Pembersihan `</think>` dimatikan -> 3 test gagal.
- `AbortSignal.timeout` dihapus -> 2 test gagal.

Client dijalankan langsung ke Ollama asli (skrip sementara, sudah dihapus):

| Skenario | Hasil |
| --- | --- |
| Chat normal | `{"content":"Sebut satu buah: **Mangga**.","doneReason":"stop"}`, 550 ms |
| `checkModelAvailable` | OK, 49 ms |
| Timeout 1 ms | `timeout`, 2 ms |
| Port salah | `unreachable` |
| Model tidak ada | `model_not_found` untuk chat dan `/api/show` |

Startup dengan token palsu: Ollama dicek lebih dulu (`Ollama is ready with model
qwen3:4b-instruct ...`, atau warning kalau model/port salah), lalu berhenti di 401.
Error 401 kadang dilaporkan dari `deleteWebhook`, kadang dari `getMe`, karena grammY
mengirim keduanya bersamaan.

## 18. Verifikasi manual

1. Pastikan Ollama jalan dan model ada: `ollama list` memuat `qwen3:4b-instruct`.
2. `npm run dev`. Harapan: `Ollama is ready with model qwen3:4b-instruct ...` lalu
   `Kera is running as @...`.
3. Kirim `halo`. Harapan: muncul "typing...", lalu jawaban dari model. Di log:
   `Replied to update ... in ... ms (1 message(s))`.
4. Kirim `/ping` -> `pong`.
5. Kirim `Jelaskan sejarah internet sepanjang mungkin`. Harapan: jawaban panjang, mungkin
   dengan catatan "(Jawaban terpotong ...)".
6. Matikan Ollama (klik kanan ikon Ollama di system tray -> Quit). Kirim `halo` -> pesan
   "Aku nggak bisa menghubungi Ollama...". Kirim `/ping` -> tetap `pong`. Nyalakan lagi Ollama.
7. Hentikan bot, set `OLLAMA_MODEL=nope:1b` di `.env`, jalankan lagi. Harapan: warning saat
   startup, dan pesan "Model AI-nya belum terpasang..." saat chat. Kembalikan nilainya.
8. Set `OLLAMA_TIMEOUT_MS=1000`, restart, kirim pertanyaan panjang. Harapan: "Aku kelamaan
   mikir...". Kembalikan nilainya.
9. Diamkan bot lebih dari 5 menit, kirim `halo`. Harapan: jawaban pertama sekitar 7 detik
   lebih lama (model dimuat ulang).

Langkah 1 sampai 9 sudah dicoba lewat Telegram di Windows 11 (2026-10-18) dan sesuai harapan.

## 19. Troubleshooting

| Gejala | Penyebab dan solusi |
| --- | --- |
| `Ollama check failed ... (unreachable)` | Ollama belum jalan, atau `OLLAMA_BASE_URL` salah. Cek `curl http://127.0.0.1:11434/api/version` |
| `Ollama check failed ... (model_not_found)` | `ollama pull <nama model>` sesuai `OLLAMA_MODEL` |
| Jawaban selalu "kelamaan mikir" | Timeout terlalu kecil, atau model thinking dipakai. Cek `OLLAMA_TIMEOUT_MS` dan `OLLAMA_MODEL` |
| Jawaban berisi penalaran bahasa Inggris | Model thinking dengan `OLLAMA_THINK=false`. Set `OLLAMA_THINK=true` atau pakai model instruct |
| Jawaban pertama lambat, berikutnya cepat | Normal: model sedang dimuat ke GPU |
| Tanda `**` muncul di jawaban | Model tetap memakai Markdown walaupun diminta tidak. Keterbatasan yang diketahui |
| `npm test` tidak menjalankan test Ollama | Disengaja. Pakai `npm run test:ollama` |

## 20. Latihan

1. Di `typing.ts`, pindahkan `clearInterval(timer)` dari `finally` ke tepat setelah
   `await work()`. Tebak test mana yang gagal, lalu jalankan `npm test`.
2. Ubah `SYSTEM_PROMPT` supaya Kera selalu menjawab dalam bahasa Jawa. Coba lewat Telegram.
   Seberapa patuh model 4B?
3. Kenapa `postJson` membaca `response.text()` lalu `JSON.parse`, bukan langsung
   `response.json()`? Apa yang hilang kalau memakai `response.json()` untuk respon 404?
4. Jalankan `curl` di bagian 16 dengan `"stream": true`. Apa bedanya bentuk respon?
   Apa yang harus diubah di `ollamaClient.ts` untuk mendukungnya?
5. Tambahkan kind baru `"overloaded"` untuk status 503 di `toHttpError`, lengkap dengan
   pesan di `userMessageForError` dan test-nya.

## 21. Gap dan milestone berikutnya

- Tidak ada riwayat percakapan, retry, atau streaming.
- Pertanyaan berat dijawab model kecil tanpa penalaran.

Milestone 3 menambahkan riwayat percakapan terbatas per chat: menyimpan beberapa pesan
terakhir di memori, isolasi antar chat, batas berdasarkan jumlah token atau karakter,
perintah untuk menghapus riwayat, dan pengaruh context window 4096 token.
