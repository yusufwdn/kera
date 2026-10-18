# ADR-0003: Default model qwen3:4b-instruct without thinking

Status: Accepted (2026-10-18)

## Context

Rencana awal memakai `qwen3:4b`. Saat persiapan Milestone 2, model itu diuji langsung
lewat `POST /api/chat` di mesin development (RTX 3050 6 GB):

| Percobaan | Hasil |
| --- | --- |
| `qwen3:4b`, `think: true`, "Apa ibu kota Indonesia?" | 222 token, 12.4 detik (7.2 detik di antaranya load model), penalaran terpisah di field `thinking` |
| `qwen3:4b`, `think: false`, pertanyaan sama | Model tetap bernalar; 973 token, 23 detik; penalaran berbahasa Inggris bocor ke `content` dan diakhiri `</think>` |
| `qwen3:4b`, `think: false` + `/no_think` di prompt | Tetap bernalar, 406 token |
| `qwen3:4b`, `think: true`, "Halo, siapa kamu?" | 2400 token, 59 detik untuk jawaban satu kalimat |

Artinya varian `qwen3:4b` yang terpasang selalu bernalar. Waktu jawab sulit diprediksi
(10 sampai 60 detik atau lebih untuk sapaan), dan penalaran memakan context window yang
default-nya hanya 4096 token.

Registry Ollama menyediakan `qwen3:4b-instruct` (2.5 GB, Q4_K_M, ukuran sama) yang dilatih
tanpa mode bernalar. Hasil uji di mesin yang sama:

| Percobaan | Hasil |
| --- | --- |
| Cold start | 7.0 detik (6.3 detik load model) |
| Warm, jawaban pendek | 0.24 detik |
| Warm, 3 paragraf (231 token) | 5.2 detik, sekitar 45 token/detik |
| `think: true` atau `false` | Diterima, tidak ada efek, tidak ada field `thinking` |

## Decision

- Model default: `qwen3:4b-instruct`, dengan `think: false`.
- Model dan mode thinking bisa diubah lewat env `OLLAMA_MODEL` dan `OLLAMA_THINK`
  tanpa mengubah kode.
- Output model selalu dibersihkan dari sisa `</think>` (`cleanModelOutput` di
  `src/ai/assistant.ts`) sebagai pertahanan kalau model thinking dipakai dengan
  `think: false`.

## Alternatives considered

- `qwen3:4b-instruct` (dipilih)
  - Pro: jawaban percakapan dalam hitungan detik, latensi lebih bisa diprediksi, token
    tidak terbuang untuk penalaran, context lebih awet untuk riwayat (Milestone 3).
  - Kontra: lebih lemah untuk soal yang butuh penalaran bertahap. Butuh unduhan 2.5 GB.
- `qwen3:4b` dengan `think: true`, penalaran dibuang sebelum dikirim
  - Pro: kualitas penalaran lebih baik, tidak perlu unduhan tambahan.
  - Kontra: 10-60 detik untuk sapaan sederhana (terukur), sulit dipakai sebagai chat harian.
- `qwen3:4b` dengan `think: false`
  - Ditolak: terbukti tidak mematikan penalaran, justru lebih lambat dan penalaran bocor ke jawaban.

## Consequences

- Model `qwen3:4b-instruct` harus di-pull: `ollama pull qwen3:4b-instruct`.
- Kedua model berukuran sekitar 3.2 GB di VRAM; hanya satu yang dipakai pada satu waktu.
- Pertanyaan yang butuh penalaran berat bisa dijawab kurang baik. Bisa dicoba dengan
  `OLLAMA_MODEL=qwen3:4b` dan `OLLAMA_THINK=true`.

## Revisit when

- Kualitas jawaban tidak cukup untuk kebutuhan sehari-hari.
- Milestone 7 (tool calling): perlu diuji ulang model mana yang paling patuh memanggil tool.
- Hardware berubah (VRAM lebih besar memungkinkan model yang lebih besar).
