# 03 - Request and Data Flow

## Startup

```
npm run dev
  -> node --watch --env-file-if-exists=.env src/index.ts
  -> main()
       1. loadConfigOrExit()        src/index.ts
            loadConfig(process.env) src/config/env.ts
              gagal -> cetak masalah, exit 1
       2. allowlist kosong? -> console.warn
       3. createBot(config, console) src/bot/createBot.ts
            pasang errorBoundary -> auth -> /start -> message:text -> message
       4. stopOnSignals(bot.stop)    daftarkan SIGINT/SIGTERM
       5. await bot.start()
            deleteWebhook, getMe     token salah -> reject -> "Kera failed", exit 1
            onStart -> "Kera is running as @..."
            loop getUpdates          (long polling)
```

## Konsep: long polling

Bot memanggil `getUpdates` ke Telegram. Kalau belum ada pesan, Telegram menahan
request itu (sampai sekitar 30 detik) lalu menjawab kosong; bot langsung bertanya lagi.
Kalau ada pesan, Telegram langsung menjawab dengan daftar update.

Setiap update punya `update_id`. Pada request berikutnya bot mengirim
`offset = update_id terakhir + 1`, yang berarti "update sebelum ini sudah diproses".
Itulah cara Telegram tahu update mana yang tidak perlu dikirim ulang. grammY mengurus
offset ini secara otomatis.

Hanya satu proses boleh polling dengan token yang sama. Proses kedua mendapat
409 Conflict.

## Satu pesan teks dari pemilik

Contoh: pemilik (ID `111`) mengirim `halo`.

```
Telegram -> getUpdates response
  { update_id: 501, message: { from: { id: 111 }, chat: { id: 111 }, text: "halo" } }

grammY membungkus update menjadi ctx (Context), lalu menjalankan middleware berurutan:

  errorBoundary(logUpdateError)            createBot.ts
    -> authMiddleware                      auth.ts
         ctx.from.id = 111, ada di allowlist -> await next()
    -> command("start")                    bukan /start -> lewati
    -> on("message:text") -> handleText    handlers.ts
         buildEchoReply("halo") = "Kamu bilang: halo"
         ctx.reply(...) -> sendMessage { chat_id: 111, text: "Kamu bilang: halo" }
    handler tidak memanggil next() -> rantai berhenti,
    on("message") tidak dijalankan

grammY lanjut polling dengan offset 502
```

## Pesan dari orang asing

```
update { from: { id: 999 }, text: "/start" }
  -> authMiddleware: 999 tidak di allowlist
       logger.warn("Ignored update ... id=999 ...")
       return tanpa next() -> tidak ada handler yang jalan, tidak ada balasan
```

## Pesan non-teks (stiker, foto)

```
update { message: { sticker: {...} } }
  -> auth lolos
  -> command("start") lewati, on("message:text") lewati (tidak ada text)
  -> on("message") -> handleUnsupportedMessage -> balasan penjelasan
```

## Error saat membalas

```
ctx.reply gagal (misalnya jaringan putus atau Telegram 400)
  -> error naik dari handleText -> next() di auth -> errorBoundary
  -> logUpdateError: logger.error("Error while handling update 501: ...")
  -> update dianggap selesai, polling lanjut ke update berikutnya
```

Konsekuensi: pesan yang gagal dibalas tidak dicoba ulang. Retry dibahas saat ada
operasi yang lebih mahal (Milestone 2 dan 6).

## Shutdown

```
Ctrl+C -> SIGINT -> stopOnSignals -> bot.stop()
  -> grammY menyelesaikan update yang sedang diproses
  -> mengirim offset terakhir ke Telegram
  -> bot.start() selesai -> "Kera stopped." -> proses keluar dengan exit code 0
```
