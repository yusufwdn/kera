# ADR-0002: Run TypeScript with Node type stripping

Status: Accepted (2026-10-18)

## Context

Kode ditulis dalam TypeScript, tapi Node.js menjalankan JavaScript. Perlu dipilih cara
mengubah atau menjalankan TypeScript, baik saat development maupun saat bot dijalankan
sehari-hari.

Node 24 mendukung type stripping secara default: file `.ts` bisa dijalankan langsung,
dan Node membuang anotasi tipe tanpa memeriksanya.

## Decision

- Jalankan `src/index.ts` langsung dengan `node` (type stripping bawaan).
- Pakai `tsc --noEmit` (`npm run typecheck`) hanya untuk memeriksa tipe.
- Aktifkan `erasableSyntaxOnly`, `allowImportingTsExtensions`, dan
  `verbatimModuleSyntax` di `tsconfig.json`, supaya `tsc` menolak kode yang tidak bisa
  dijalankan Node.

## Alternatives considered

- Node type stripping (dipilih)
  - Pro: tidak ada dependency tambahan untuk menjalankan kode. `node --watch` dan
    `--env-file` sudah bawaan. Tidak ada folder build.
  - Kontra: hanya sintaks yang bisa dibuang (tidak ada `enum`, `namespace`, parameter
    properties). Import wajib pakai ekstensi `.ts`. Path alias dari `tsconfig` tidak didukung.
- `tsx`
  - Pro: mendukung semua sintaks TypeScript, sangat populer.
  - Kontra: menambah dependency untuk hal yang sudah bisa dilakukan Node. Sama-sama
    tidak memeriksa tipe, jadi tetap butuh `tsc`.
- Kompilasi dengan `tsc` ke `dist/`, lalu jalankan JavaScript
  - Pro: pemisahan source dan output jelas, cara paling umum di production.
  - Kontra: ada langkah build, dev loop lebih lambat, dan risiko menjalankan `dist/`
    yang belum di-build ulang.

## Consequences

- Kesalahan tipe tidak menghentikan `npm run dev`. `npm run typecheck` wajib dijalankan
  sebelum commit (lihat CONTRIBUTING.md).
- Konstanta pilihan ditulis dengan union type atau object `as const`, bukan `enum`.
- Contoh yang terverifikasi saat setup: file dengan `enum`, salah tipe, dan import tanpa
  ekstensi ditolak `tsc` (TS1294, TS2322, TS2834), sedangkan `node` langsung crash saat
  runtime karena tidak memeriksa apa pun.

## Revisit when

- Butuh fitur yang tidak didukung type stripping (misalnya decorator untuk library tertentu).
- Kera di-deploy ke lingkungan yang Node-nya tidak mendukung type stripping.
- Waktu startup menjadi masalah (kompilasi di depan bisa sedikit lebih cepat saat start).
