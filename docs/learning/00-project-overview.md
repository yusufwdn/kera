# 00 - Project Overview

## Masalah yang diselesaikan

Asisten AI yang umum dipakai berjalan di cloud: percakapan, catatan, dan jadwal pribadi
dikirim ke server pihak ketiga, dan biasanya butuh langganan berbayar. Kera adalah
asisten pribadi yang:

- diakses dari Telegram, aplikasi yang sudah ada di HP, tanpa membangun UI sendiri;
- memakai model bahasa lokal (Ollama) di laptop sendiri, gratis dan tidak mengirim
  isi percakapan ke penyedia AI;
- menyimpan data pribadi (catatan, tugas, reminder) di database lokal.

Selain sebagai alat, project ini adalah bahan belajar software engineering dan
portofolio, sehingga kejelasan kode dan dokumentasi sama pentingnya dengan fitur.

## Goals

- Satu pengguna (pemilik) bisa ngobrol dengan model lokal lewat Telegram.
- Kera bisa mengingat konteks percakapan terbatas.
- Kera bisa mengelola catatan, tugas, dan reminder.
- Model bisa meminta aksi aplikasi secara terkontrol (tool calling yang divalidasi).
- Setiap bagian terdokumentasi sehingga bisa dipahami dan dibangun ulang dari nol.

## Non-goals

- Melayani banyak pengguna publik atau skala besar.
- Ketersediaan 24/7. Kera hanya aktif selama laptop menyala dan proses berjalan.
- Mengeksekusi perintah shell atau kode arbitrer atas permintaan model.
- UI web atau aplikasi mobile sendiri.
- Memakai API AI berbayar (bisa dipertimbangkan nanti dengan ADR tersendiri).

## Pengguna dan use case

Pengguna utama: pemilik bot (satu orang), mungkin ditambah beberapa orang terpercaya
lewat allowlist.

Contoh use case:

- Tanya jawab singkat atau minta penjelasan konsep.
- "Catat: ide project X" -> tersimpan sebagai note.
- "Ingatkan aku jam 7 malam untuk bayar listrik" -> reminder dikirim ke Telegram.

## Lingkup MVP dan roadmap

| Milestone | Isi | Status |
| --- | --- | --- |
| 0 | Setup project, toolchain, dokumentasi awal | Selesai |
| 1 | Bot Telegram dasar: `/start`, terima pesan, allowlist | Direncanakan |
| 2 | Hubungkan Telegram ke Ollama (`qwen3:4b`) | Direncanakan |
| 3 | Konteks percakapan terbatas, terisolasi per chat | Direncanakan |
| 4 | Persistensi dengan SQLite | Direncanakan |
| 5 | Notes dan tasks | Direncanakan |
| 6 | Reminder (default timezone Asia/Jakarta) | Direncanakan |
| 7 | Tool calling terkontrol | Direncanakan |
| 8 | Hardening dan quality review | Direncanakan |

MVP dianggap tercapai setelah Milestone 2: pesan Telegram dijawab oleh model lokal.

## Functional requirements (rencana)

- Bot merespons perintah dan pesan teks hanya dari pengguna yang diizinkan.
- Bot meneruskan pesan ke model lokal dan mengirim balik jawabannya.
- Data catatan, tugas, dan reminder bertahan setelah aplikasi restart.

## Non-functional requirements

- Keamanan: secret hanya di environment, tidak pernah di-log. Input dari luar
  (Telegram, output model) divalidasi saat runtime.
- Keandalan: error di satu pesan tidak menjatuhkan proses. Ada timeout untuk
  panggilan ke layanan luar.
- Biaya: nol biaya operasional; semua tool gratis dan lokal.
- Maintainability: kode TypeScript strict, modul kecil, dokumentasi sesuai kode.
- Sumber daya: model harus muat di GPU 6 GB VRAM.

## Constraints dan asumsi

- Hardware: RTX 3050 6 GB VRAM, RAM 16 GB. Ini membatasi ukuran model (sekitar 4B
  parameter) dan panjang konteks.
- Laptop harus menyala dan terhubung internet agar bot bisa menerima pesan dan
  mengirim reminder.
- Telegram Bot API dapat diakses dari jaringan pengguna.

## Kriteria sukses

- Pemilik bisa memakai Kera sehari-hari untuk tanya jawab, catatan, dan reminder.
- Setiap milestone punya test yang lulus dan dokumen yang akurat.
- Seseorang yang membaca `docs/learning/` bisa memahami dan membangun ulang project.
