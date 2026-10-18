# Contributing

Panduan kerja untuk project Kera. Project ini dikerjakan sendiri, tapi aturan di sini
menjaga kode dan riwayat Git tetap rapi dan mudah dibaca ulang.

## Alur kerja per milestone

Setiap milestone mengikuti urutan:

1. Plan: tujuan, file yang berubah, keputusan dan alternatifnya, acceptance criteria.
2. Implement: perubahan kecil dan koheren.
3. Test: `npm run typecheck` dan `npm test`, ditambah uji manual bila perlu.
4. Document: update dokumen yang terdampak di milestone yang sama.
5. Review: rangkuman, keterbatasan, dan milestone berikutnya.

Keputusan arsitektural yang signifikan dicatat sebagai ADR di `docs/decisions/`.

## Sebelum commit

```
npm run typecheck
npm test
```

Keduanya harus lulus. Jangan commit `.env` atau secret apa pun.

## Pesan commit

Pakai [Conventional Commits](https://www.conventionalcommits.org/) dalam bahasa Inggris:

```
<type>(<scope>): <ringkasan singkat>
```

| Type | Dipakai untuk |
| --- | --- |
| `feat` | Fitur baru |
| `fix` | Perbaikan bug |
| `docs` | Perubahan dokumentasi saja |
| `test` | Menambah atau memperbaiki test |
| `refactor` | Perubahan struktur tanpa mengubah perilaku |
| `chore` | Tooling, dependency, konfigurasi |

Contoh: `feat(bot): reply to /start command`

## Gaya kode

- TypeScript strict. Hindari `any`; kalau terpaksa, jelaskan alasannya di komentar.
- Hanya sintaks yang bisa dibuang oleh Node type stripping: tidak ada `enum`,
  `namespace`, atau parameter properties di constructor. Lihat ADR-0002.
- Import relatif selalu pakai ekstensi `.ts`.
- Import yang hanya berisi tipe pakai `import type`.
- Fungsi pendek dengan nama deskriptif. Error ditangani eksplisit.
- Komentar dalam bahasa Indonesia di setiap fungsi/tipe yang berisi logic:
  apa fungsinya, dipanggil dari mana, input, output, dan kenapa. Identifier tetap
  bahasa Inggris.
- Dokumen dan komentar memakai ASCII: tanpa emoji, pakai `->` untuk panah.

## Dependency baru

Sebelum menambah dependency, tulis alasannya (masalah apa yang diselesaikan dan
kenapa tidak cukup dengan fitur bawaan Node) di dokumen milestone terkait.
