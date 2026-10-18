# 01 - Development Environment

## Versi yang terverifikasi

Dicek pada 2026-10-18 di mesin development:

| Komponen | Versi | Cara cek |
| --- | --- | --- |
| OS | Windows 11 Home | `winver` |
| Node.js | v24.20.0 | `node -v` |
| npm | 12.0.2 | `npm -v` |
| Git | 2.47.1.windows.2 | `git --version` |
| TypeScript | 7.0.2 (dev dependency project) | `npx tsc -v` |
| Ollama | 0.40.6 | `ollama --version` |
| Model | `qwen3:4b` (2.5 GB) | `ollama list` |
| GPU | NVIDIA RTX 3050, 6144 MiB | `nvidia-smi` |

## Konsep: bagaimana TypeScript dijalankan di project ini

TypeScript adalah JavaScript plus anotasi tipe. Komputer tidak menjalankan tipe;
tipe hanya dipakai untuk memeriksa kesalahan sebelum kode jalan. Ada dua pekerjaan
yang berbeda:

1. Menjalankan kode. Node 24 bisa membaca file `.ts` langsung dengan cara membuang
   anotasi tipe (type stripping). Contoh: `const n: number = 1` dijalankan sebagai
   `const n = 1`.
2. Memeriksa tipe. Dilakukan oleh `tsc --noEmit`. `--noEmit` artinya hanya periksa,
   jangan tulis file JavaScript hasil kompilasi.

Karena Node tidak memeriksa tipe, kode dengan kesalahan tipe tetap bisa dijalankan
dan baru gagal saat runtime. Itulah kenapa `npm run typecheck` harus dijalankan
terpisah. Alasan memilih cara ini ada di
[ADR-0002](../decisions/ADR-0002-run-typescript-with-node-type-stripping.md).

## Penjelasan `package.json`

| Field | Arti |
| --- | --- |
| `"private": true` | Mencegah project ter-publish ke npm secara tidak sengaja. |
| `"type": "module"` | File diperlakukan sebagai ES Modules (`import`/`export`), bukan CommonJS (`require`). |
| `"engines"` | Dokumentasi versi Node minimum. npm hanya memberi peringatan, tidak memblokir. |
| `scripts.dev` | `node --watch` me-restart proses setiap file berubah. `--env-file-if-exists=.env` memuat `.env` kalau ada. |
| `scripts.start` | Sama dengan `dev` tanpa watch. |
| `scripts.typecheck` | `tsc --noEmit`, hanya periksa tipe. |
| `scripts.test` | `vitest run`, jalankan test sekali (dipasang di Milestone 1). |

Fitur `--env-file-if-exists` bawaan Node menggantikan package `dotenv`.

## Penjelasan `tsconfig.json`

Opsi dikelompokkan berdasarkan tujuannya:

Target dan modul

- `target` / `lib: es2024`: fitur JavaScript yang boleh dipakai, sesuai yang didukung Node 24.
- `module` / `moduleResolution: nodenext`: TypeScript meniru cara Node mencari file
  saat `import`, termasuk aturan ESM bahwa import relatif wajib pakai ekstensi.
- `types: ["node"]`: hanya muat tipe global dari `@types/node`.

Supaya cocok dengan type stripping

- `noEmit`: `tsc` tidak menghasilkan file, hanya memeriksa.
- `allowImportingTsExtensions`: mengizinkan `import ... from "./x.ts"`. Node butuh
  ekstensi asli file karena tidak ada langkah kompilasi yang mengganti `.ts` jadi `.js`.
- `erasableSyntaxOnly`: menolak sintaks TypeScript yang menghasilkan kode JavaScript
  (misalnya `enum`, `namespace`, parameter properties). Sintaks seperti itu tidak bisa
  sekadar "dibuang", jadi Node tidak bisa menjalankannya.
- `verbatimModuleSyntax`: import yang isinya hanya tipe wajib ditulis `import type`,
  supaya Node tahu import itu aman dihapus seluruhnya.

Pemeriksaan ketat

- `strict`: mengaktifkan semua pemeriksaan dasar, termasuk `null`/`undefined` harus ditangani.
- `noUncheckedIndexedAccess`: `arr[0]` bertipe `T | undefined`, karena array bisa kosong.
- `exactOptionalPropertyTypes`: properti opsional `x?: string` tidak boleh diisi
  `undefined` secara eksplisit. Membedakan "tidak ada" dari "ada tapi kosong".
- `noImplicitOverride`, `noFallthroughCasesInSwitch`: mencegah bug klasik di class dan `switch`.

Lain-lain

- `skipLibCheck`: tidak memeriksa ulang file `.d.ts` milik library, mempercepat typecheck.
- `forceConsistentCasingInFileNames`: mencegah bug di Windows ketika `Env.ts` dan
  `env.ts` dianggap sama, padahal di Linux berbeda.

## Line ending

Windows memakai CRLF, Linux/macOS memakai LF. `.gitattributes` berisi
`* text=auto eol=lf` supaya file teks tersimpan dengan LF di repository, sehingga
diff tidak penuh perubahan line ending.

## Ollama

Ollama berjalan sebagai service lokal di `http://127.0.0.1:11434`. Cek dengan:

```
curl http://127.0.0.1:11434/api/version
```

Ollama hanya boleh listen di localhost. Jangan set `OLLAMA_HOST=0.0.0.0` tanpa desain
keamanan, karena API Ollama tidak punya autentikasi.
