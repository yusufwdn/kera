# Milestone 0 - Project Discovery and Setup

## 1. Tujuan

Menyiapkan fondasi project yang bisa dijalankan dan diperiksa: package, TypeScript
strict, konfigurasi environment, aturan Git, dan dokumentasi awal. Belum ada fitur bot.

## 2. Prasyarat

- Node.js 24+, npm, Git terpasang (lihat `01-development-environment.md`).
- Folder project kosong `C:\Personal\codes\kera`.

## 3. Konsep yang dipelajari

- `package.json` dan npm scripts.
- ES Modules (`"type": "module"`).
- Beda menjalankan TypeScript (type stripping) dan memeriksa tipe (`tsc --noEmit`).
- Environment variable dan file `.env`.
- `.gitignore` vs `.gitattributes` vs `.git/info/exclude`.

## 4. Kenapa milestone ini perlu

Semua milestone berikutnya butuh perintah yang sama untuk menjalankan, memeriksa, dan
menguji kode. Kalau toolchain bermasalah, error-nya tercampur dengan error fitur dan
sulit dilacak. Dengan membuktikan toolchain lebih dulu, error di Milestone 1 pasti
berasal dari kode bot.

## 5. Urutan pengerjaan

1. Inspeksi environment: versi Node, npm, Git, Ollama, GPU (hasil di `01-development-environment.md`).
2. Buat `package.json` dengan `"type": "module"` dan scripts.
3. Pasang dev dependency: `typescript`, `@types/node`.
4. Buat `tsconfig.json` untuk type stripping + strict mode.
5. Buat `.gitignore`, `.gitattributes`, `.env.example`.
6. Buat `src/index.ts` minimal.
7. Verifikasi: `npm run typecheck`, `npm start`, dan uji negatif.
8. Tulis dokumentasi.
9. Inisialisasi Git (dijalankan manual, lihat bagian 16).

## 6. File yang dibuat

| File | Tanggung jawab |
| --- | --- |
| `package.json` | Metadata project, scripts, daftar dependency |
| `package-lock.json` | Versi persis setiap dependency (dibuat otomatis oleh npm, wajib di-commit) |
| `tsconfig.json` | Aturan pemeriksaan tipe |
| `.gitignore` | File yang tidak boleh masuk Git (`node_modules/`, `.env`) |
| `.gitattributes` | Normalisasi line ending ke LF |
| `.env.example` | Template konfigurasi tanpa secret |
| `src/index.ts` | Entry point; saat ini hanya mencetak satu baris |
| `README.md`, `CONTRIBUTING.md` | Pintu masuk project dan aturan kerja |
| `docs/learning/00-*.md`, `01-*.md` | Gambaran project dan environment |
| `docs/decisions/ADR-0001-*.md`, `ADR-0002-*.md` | Keputusan arsitektur awal |

## 7. Penjelasan kode

`src/index.ts` hanya mendeklarasikan `const appName: string` lalu mencetaknya bersama
`process.version`. Anotasi `: string` sengaja ditulis untuk membuktikan Node bisa
menjalankan file berisi sintaks TypeScript.

## 8. Alur kontrol

```
npm start
  -> npm membaca scripts.start di package.json
  -> node --env-file-if-exists=.env src/index.ts
       -> Node memuat .env (kalau ada) ke process.env
       -> Node membuang anotasi tipe dari index.ts
       -> menjalankan console.log
  -> proses selesai, exit code 0
```

## 9. Keputusan dan alternatif

- Arsitektur dan stack: [ADR-0001](../../decisions/ADR-0001-initial-architecture.md).
- Cara menjalankan TypeScript: [ADR-0002](../../decisions/ADR-0002-run-typescript-with-node-type-stripping.md).
- `@types/node` dikunci ke `^24` supaya tipe sesuai versi Node yang dipakai. Versi
  terbaru (26) bisa menawarkan API yang belum ada di Node 24.
- `dotenv` tidak dipakai karena Node punya `--env-file-if-exists`.
- `grammy`, `zod`, `vitest` belum dipasang karena belum dipakai; dipasang di Milestone 1.
- Linter dan formatter belum dipasang. Akan dievaluasi setelah ada cukup kode.

## 10. Trade-off dan keterbatasan

- `npm run dev` tetap jalan walaupun ada kesalahan tipe. Typecheck harus dijalankan sendiri.
- `engines` di `package.json` hanya peringatan, tidak mencegah instalasi di Node lama.

## 11. Konfigurasi

Belum ada environment variable. `.env.example` sudah disiapkan untuk Milestone 1.

## 12. Keamanan

- `.env` dan variasinya (`.env.*`) di-ignore; hanya `.env.example` yang boleh di-commit.
- Ollama diverifikasi hanya listen di `127.0.0.1`.

## 13. Perintah dan hasil verifikasi

Semua dijalankan dari root project.

| Perintah | Tujuan | Hasil aktual |
| --- | --- | --- |
| `npm install --save-dev typescript@^7 @types/node@^24` | Pasang dev dependency | 4 package, 0 vulnerabilities |
| `npm run typecheck` | Periksa tipe | Lulus, exit 0 |
| `npm start` | Jalankan app | `Kera is running on Node v24.20.0`, exit 0 |

Uji negatif dengan file sementara `src/_probe.ts` (sudah dihapus) berisi `enum`, salah
tipe, dan import tanpa ekstensi:

- `npx tsc --noEmit` -> exit 1 dengan TS1294, TS2322, TS2834.
- `node src/_probe.ts` -> crash saat runtime.

Ini membuktikan `tsconfig` menangkap kode yang tidak bisa dijalankan Node.

## 14. Verifikasi manual

```
npm install
npm run typecheck
npm start
```

Output yang diharapkan dari `npm start`: `.env not found. Continuing without it.`
(kalau `.env` belum ada) lalu `Kera is running on Node v24.x.x`.

## 15. Troubleshooting

Lihat tabel troubleshooting di `README.md`.

## 16. Setup Git

Dijalankan manual dari root project:

```
git init -b main
```

`-b main` membuat branch awal bernama `main`. Tanpa opsi itu Git memakai `master`,
karena `init.defaultBranch` belum di-set di konfigurasi global.

File lokal milik tool pribadi yang tidak boleh masuk repo dicatat di
`.git/info/exclude`, bukan `.gitignore`. Bedanya: `.gitignore` ikut di-commit dan
berlaku untuk semua orang, sedangkan `.git/info/exclude` hanya berlaku di clone lokal.

Cek bahwa `.env` tidak akan ter-commit:

```
git status --ignored
```

## 17. Gap dan milestone berikutnya

Belum ada fitur. Milestone 1 menambahkan bot Telegram dengan validasi konfigurasi,
allowlist, handler `/start` dan pesan teks, serta test pertama.
