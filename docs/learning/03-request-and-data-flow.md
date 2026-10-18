# 03 - Request and Data Flow

## Startup

```
npm run dev
  -> node --watch --env-file-if-exists=.env src/index.ts
  -> main()
       1. loadConfigOrExit()                 src/index.ts
            loadConfig(process.env)          src/config/env.ts
              gagal -> cetak masalah, exit 1
       2. allowlist kosong? -> console.warn
       3. createOllamaClient(config.ollama)  src/ai/ollamaClient.ts
       4. warnIfModelUnavailable()           POST /api/show, timeout 5 detik
            gagal -> console.warn, lanjut
       5. createBot({ token, allowedUserIds, assistant, logger })
            errorBoundary -> auth -> /start -> /ping -> message:text -> message
       6. stopOnSignals(bot.stop)            SIGINT/SIGTERM
       7. await bot.start()
            deleteWebhook dan getMe          token salah -> reject -> "Kera failed", exit 1
            onStart -> "Kera is running as @..."
            loop getUpdates                  (long polling)
```

## Konsep: long polling

Bot memanggil `getUpdates` ke Telegram. Kalau belum ada pesan, Telegram menahan
request itu (sampai sekitar 30 detik) lalu menjawab kosong; bot langsung bertanya lagi.
Kalau ada pesan, Telegram langsung menjawab dengan daftar update.

Setiap update punya `update_id`. Pada request berikutnya bot mengirim
`offset = update_id terakhir + 1`, artinya "update sebelum ini sudah diproses".
grammY mengurus offset ini secara otomatis. Hanya satu proses boleh polling dengan
token yang sama; proses kedua mendapat 409 Conflict.

Update yang masuk saat bot mati disimpan Telegram (sampai 24 jam) dan diproses saat bot
hidup lagi, satu per satu.

## Satu pesan teks dari pemilik

Contoh: pemilik (ID `111`) mengirim `ibu kota indonesia?`.

```
Telegram -> getUpdates response
  { update_id: 501, message: { from: { id: 111 }, chat: { id: 111 }, text: "ibu kota indonesia?" } }

grammY menjalankan middleware berurutan:

  errorBoundary(logUpdateError)                 createBot.ts
    -> authMiddleware: 111 ada di allowlist -> await next()
    -> command("start"), command("ping")        bukan command -> lewati
    -> on("message:text") -> createTextHandler  handlers.ts
         withTypingIndicator                    typing.ts
           sendChatAction { action: "typing" }  segera, lalu tiap 4 detik
           assistant.reply("ibu kota indonesia?")             assistant.ts
             messages = [ {system: SYSTEM_PROMPT}, {user: "ibu kota indonesia?"} ]
             ollamaClient.chat(messages)                       ollamaClient.ts
               POST http://127.0.0.1:11434/api/chat
                 { model: "qwen3:4b-instruct", messages, stream: false,
                   think: false, options: { num_predict: 1024 } }
               signal: AbortSignal.timeout(120000)
               <- 200 { message: { role: "assistant", content: "Ibu kota Indonesia adalah Jakarta." },
                        done_reason: "stop", eval_count: 9, ... }
               validasi zod -> { content, doneReason: "stop" }
             cleanModelOutput -> "Ibu kota Indonesia adalah Jakarta."
           clearInterval (di finally)
         splitMessage -> 1 bagian
         sendMessage { chat_id: 111, text: "Ibu kota Indonesia adalah Jakarta." }
         log: "Replied to update 501 in 412 ms (1 message(s))"
```

Telegram dan Ollama berbeda sifat:

| | Telegram Bot API | Ollama API |
| --- | --- | --- |
| Lokasi | Internet, `api.telegram.org` | Laptop sendiri, `127.0.0.1:11434` |
| Arah | Kera bertanya terus (polling), juga mengirim balasan | Kera memanggil, Ollama menjawab |
| Autentikasi | Token di URL | Tidak ada; aman hanya karena listen di localhost |
| Waktu respon | Milidetik | 0.2 detik sampai puluhan detik, tergantung panjang jawaban |
| Format error | `{ ok: false, error_code, description }` | `{ error: "..." }` + status HTTP |

## Jawaban panjang

```
assistant.reply -> teks 9000 karakter
splitMessage -> potong di baris baru / spasi terakhir sebelum 4096
  -> 3 bagian -> 3x sendMessage berurutan
```

Kalau model berhenti karena `num_predict` habis, Ollama mengirim `done_reason: "length"`
dan assistant menambahkan catatan "(Jawaban terpotong ...)".

## Ollama gagal

```
ollamaClient.chat
  fetch melempar TypeError "fetch failed"      -> OllamaError("unreachable")
  fetch melempar TimeoutError (120 detik)      -> OllamaError("timeout")
  status 404                                   -> OllamaError("model_not_found")
  status lain non-2xx                          -> OllamaError("http_error")
  body bukan JSON / bentuk tidak sesuai schema -> OllamaError("invalid_response")

createTextHandler menangkap error:
  logger.error("Assistant failed for update 501: Ollama error (unreachable): ...")
  ctx.reply(userMessageForError(error))  -> "Aku nggak bisa menghubungi Ollama. ..."
  update selesai normal
```

## Pesan dari orang asing

```
update { from: { id: 999 }, text: "halo" }
  -> authMiddleware: 999 tidak di allowlist
       logger.warn("Ignored update ... id=999 ...")
       return tanpa next() -> tidak ada handler, assistant tidak dipanggil, tidak ada balasan
```

## Telegram gagal saat mengirim balasan

```
ctx.reply gagal (jaringan putus, Telegram 400/403)
  -> error naik dari handler -> next() di auth -> errorBoundary
  -> logUpdateError: logger.error("Error while handling update 501: ...")
  -> polling lanjut ke update berikutnya; balasan itu tidak dicoba ulang
```

## Shutdown

```
Ctrl+C -> SIGINT -> stopOnSignals -> bot.stop()
  -> grammY menunggu update yang sedang diproses selesai (termasuk yang sedang menunggu Ollama)
  -> mengirim offset terakhir ke Telegram
  -> bot.start() selesai -> "Kera stopped." -> exit code 0
```
