# ADR-0004: Context window 8192 and a self-managed history budget

Status: Accepted (2026-10-19)

## Context

Milestone 3 menambahkan riwayat percakapan. Model tidak punya ingatan sendiri: setiap
request ke `POST /api/chat` harus membawa ulang system prompt, riwayat, dan pesan baru.
Semuanya, ditambah jawaban, harus muat di context window (`num_ctx`). Kalau `num_ctx`
tidak dikirim, Ollama memakai 4096 token.

Pengukuran di mesin development (RTX 3050 6 GB, Ollama 0.40.6, `qwen3:4b-instruct`):

Perilaku Ollama saat prompt terlalu panjang:

| Percobaan | Hasil |
| --- | --- |
| `num_ctx` 1024, percakapan sekitar 1212 token, fakta penting di pesan pertama | Status 200, tanpa error. `prompt_eval_count` 1003: pesan lama dibuang. Model menjawab salah karena faktanya ikut terbuang |
| Percakapan yang sama dengan `num_ctx` 4096 | `prompt_eval_count` 1212, model menjawab benar |
| `num_ctx` 2048, satu pesan sekitar 2770 token | HTTP 400: `request (2770 tokens) exceeds the available context size (2048 tokens)` |

Rasio karakter per token (`prompt_eval_count` dikurangi baseline):

| Jenis teks | Karakter per token |
| --- | --- |
| Bahasa Indonesia | 3.07 |
| Kode TypeScript | 2.91 |
| Bahasa Inggris | 4.42 |
| Overhead per pesan (penanda role) | sekitar 5 sampai 6 token |

VRAM per `num_ctx` (`GET /api/ps`):

| `num_ctx` | Ukuran model dimuat | Di VRAM |
| --- | --- | --- |
| 4096 | 3.18 GB | 3.18 GB (semua) |
| 8192 | 3.88 GB | 3.88 GB (semua) |
| 16384 | 5.39 GB | 4.27 GB (sisanya di CPU) |

Kecepatan: prompt 5896 token diproses dalam 3.9 detik (sekitar 1500 token/detik).
Request berikutnya yang hanya menambah pesan di akhir diproses dalam 42 ms, karena Ollama
memakai ulang hasil hitungan untuk bagian awal prompt yang sama (prefix cache).

## Decision

- Default `num_ctx` 8192, dikirim di setiap request, bisa diubah lewat `OLLAMA_NUM_CTX`
  (4096 sampai 131072).
- Kera memotong riwayat sendiri sebelum mengirim, tidak mengandalkan Ollama:
  - Budget prompt = `num_ctx` - `MAX_REPLY_TOKENS` (1024). Default: 7168 token.
  - Token diperkirakan `ceil(karakter / 2.5) + 8` per pesan. Angka 2.5 lebih kecil dari
    semua rasio terukur, jadi perkiraan cenderung berlebih (terukur sekitar 1.4x lebih
    besar dari angka asli untuk percakapan bahasa Indonesia).
  - Riwayat diambil dari giliran terbaru mundur, per pasangan pertanyaan + jawaban,
    berhenti di giliran pertama yang tidak muat.
  - Selain budget token, store menyimpan paling banyak 20 giliran per chat.
- Batas bawah 4096 dipilih supaya pesan Telegram terpanjang (4096 karakter, sekitar 1400
  token) ditambah system prompt dan ruang jawaban selalu muat, sehingga HTTP 400 dari
  Ollama tidak terjadi untuk pesan biasa.

## Alternatives considered

- `num_ctx` 4096 (bawaan)
  - Pro: VRAM paling kecil, tidak ada yang berubah.
  - Kontra: hanya sekitar 2800 token untuk riwayat setelah system prompt dan ruang jawaban.
- `num_ctx` 8192 (dipilih)
  - Pro: ruang riwayat kira-kira dua kali lipat, masih seluruhnya di VRAM (+0.7 GB).
  - Kontra: model di-load ulang kalau aplikasi lain memakai model yang sama dengan
    `num_ctx` berbeda. Prompt panjang pertama butuh beberapa detik.
- `num_ctx` 16384
  - Ditolak: tidak muat di VRAM 6 GB, sebagian model pindah ke CPU.
- Membiarkan Ollama yang memotong
  - Ditolak: pemotongan terjadi diam-diam, tidak terlihat di log, dan tidak bisa diatur
    (misalnya menjaga pasangan pertanyaan + jawaban tetap utuh).
- Menghitung token persis dengan tokenizer
  - Ditolak: Ollama tidak menyediakan endpoint tokenize. Library tokenizer terpisah
    terikat ke satu model, padahal model bisa diganti lewat env.

## Consequences

- Log setiap jawaban memuat `prompt N tokens` dan `history N turn(s)`, sehingga perkiraan
  bisa dibandingkan dengan angka asli dari Ollama.
- Karena perkiraan berlebih, ruang riwayat yang benar-benar terpakai lebih kecil dari
  7168 token. Ini disengaja: lebih baik membuang satu giliran lama daripada Ollama
  memotong diam-diam.
- Setiap kali giliran paling lama dibuang, awal prompt berubah dan prefix cache tidak
  terpakai. Request itu memproses ulang seluruh prompt (beberapa detik untuk ribuan token).
- `src/ai/ollamaClient.integration.test.ts` memeriksa dua perilaku Ollama di atas. Kalau
  Ollama mengubahnya, test itu gagal.

## Revisit when

- Model diganti (rasio karakter per token dan VRAM perlu diukur ulang).
- Riwayat disimpan permanen (Milestone 4) dan percakapan menjadi jauh lebih panjang:
  pertimbangkan ringkasan riwayat lama.
- Log menunjukkan `prompt` mendekati `num_ctx`, atau sebaliknya ruang yang terpakai jauh
  di bawah budget.
