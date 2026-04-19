# ARCHIVE — Project History, Problems & Lessons Learned

Dokumen ini merangkum seluruh riwayat pembangunan aplikasi ARCHIVE: fitur yang dibangun, masalah yang ditemui, root cause, cara penyelesaian, dan countermeasure untuk mencegah terulang.

---

## Daftar Isi

1. [Gambaran Arsitektur](#1-gambaran-arsitektur)
2. [Riwayat Pembangunan Fitur](#2-riwayat-pembangunan-fitur)
3. [Problem Log](#3-problem-log)
4. [Countermeasure & Prinsip Desain](#4-countermeasure--prinsip-desain)

---

## 1. Gambaran Arsitektur

```
ARCHIVE/
├── backend/          FastAPI + SQLite + yt-dlp
│   ├── main.py
│   ├── db.py         SQLite schema + write_lock
│   ├── config.py     DB_PATH, VIDEOS_DIR dari env
│   ├── downloader.py yt-dlp wrapper + progress hook
│   └── routers/
│       ├── download.py   POST /api/download, GET /api/download/:id/status
│       ├── videos.py     CRUD video + search + tag
│       ├── tags.py       list tags
│       └── stream.py     HTTP range streaming
├── frontend/         React + Vite + motion/react
│   └── src/components/
│       ├── LibraryPage.tsx   Hero carousel + carousel rows
│       ├── PlayerPage.tsx    Video player + Up Next
│       └── DownloadModal.tsx Download + progress polling
├── Dockerfile        Multi-stage: node:20 build → python:3.11 serve
├── docker-compose.yml app + nginx, named volumes /videos /data
└── nginx.conf        Reverse proxy ke app:8000, proxy_buffering off
```

**Polling pattern:** Frontend poll `/api/download/:id/status` setiap 2 detik. Tidak ada WebSocket/SSE.

**Progress pattern:** yt-dlp progress hook → UPDATE SQLite langsung → frontend baca saat poll.

---

## 2. Riwayat Pembangunan Fitur

### Fase 1 — Scaffold & Backend (commit `146b5ec` → `277c154`)
- Initial scaffold: spec, design system
- FastAPI backend: SQLite schema, video CRUD, tag system
- yt-dlp download dengan progress polling
- HTTP range streaming (`/stream/:video_id`)
- 27 passing tests

### Fase 2 — Frontend (`e5dc99a`)
- LibraryPage, PlayerPage, DownloadModal
- Mobile responsive

### Fase 3 — Player Enhancement (`b6e6a21` → `3895e63`)
- PlayerPage two-column layout + Up Next panel
- Up Next cards overlay Netflix-style
- Logo, favicon, video delete

### Fase 4 — Docker + VPS (`fbe8ad2` → `60cc00b`)
- Dockerfile multi-stage build
- docker-compose + nginx reverse proxy
- cookies.txt untuk YouTube auth di VPS

### Fase 5 — YouTube Download Fixes (`2b6a622` → `47d7aec`)
- Relax format selector
- n-challenge solver via node EJS
- cookies.txt auto-detect + .env loading

### Fase 6 — UI Enhancement (`1281848`)
- Hero section Netflix-style
- Carousel rows per tag

### Fase 7 — Download Progress Fixes (`95bc4f9` → `54625a0`)
- Remove remote_components (GitHub fetch blokir download)
- Exclude HLS/m3u8 format (no total_bytes)
- Split progress 50/50 untuk dua-file download

### Fase 8 — Polish (`e859971`)
- Logo.png background transparan (remove opaque white pixels via PIL)
- Hero section → auto-sliding carousel (6s interval, pause on hover, dot indicators)

---

## 3. Problem Log

---

### P-01 — Download Error: Format Unavailable

**Commit:** `2b6a622`
**Gejala:** Download langsung error, format tidak tersedia.
**Root Cause:** Format string terlalu ketat: `bestvideo[ext=mp4]+bestaudio[ext=m4a]` — YouTube tidak selalu menyediakan m4a terpisah.
**Resolve:** Relax ke `bestvideo+bestaudio/best` — biarkan yt-dlp pilih codec terbaik yang tersedia.
**Countermeasure:** Selalu sediakan fallback di format string dengan `/`. Jangan hardcode codec spesifik (ext=mp4, ext=m4a).

---

### P-02 — Download Gagal di VPS: Bot Detection / 403

**Commit:** `60cc00b`
**Gejala:** Download berhasil di lokal, gagal di VPS (headless server).
**Root Cause:** YouTube mendeteksi request dari server tanpa browser session. Tidak ada cookies autentikasi.
**Resolve:** Tambah `cookiefile` ke yt-dlp opts. Baca dari `COOKIES_FILE` env var. Mount `cookies.txt` ke Docker container via volume.
**Countermeasure:**
- Simpan cookies.txt di luar repo (`.gitignore`)
- Mount via docker-compose volume, jangan COPY ke image
- Dokumentasikan cara export cookies di README

---

### P-03 — cookies.txt Tidak Terbaca di Docker

**Commit:** `813235a`, `a7c61ea`, `90e2b69`
**Gejala:** `COOKIES_FILE` env var di-set tapi yt-dlp tetap tidak pakai cookies.
**Root Cause (a):** `.env` tidak di-load otomatis saat uvicorn jalan → `os.environ.get("COOKIES_FILE")` return None.
**Root Cause (b):** Path di `.env` relatif → tidak valid saat working directory berbeda dari lokasi `.env`.
**Root Cause (c):** `cookies.txt` tidak ditemukan karena path auto-detect relatif ke cwd, bukan ke lokasi file `downloader.py`.
**Resolve:**
- Load `.env` secara eksplisit dengan `python-dotenv` di `main.py`
- Resolve path `.env` secara absolut (`Path(__file__).resolve().parent`)
- Auto-detect `cookies.txt` relatif ke `downloader.py` bukan cwd:
  ```python
  _DEFAULT_COOKIES = str(Path(__file__).resolve().parent / "cookies.txt")
  ```
**Countermeasure:** Selalu gunakan `Path(__file__).resolve().parent` untuk path yang relatif terhadap file, bukan `os.getcwd()`.

---

### P-04 — YouTube n-challenge Error (nsig)

**Commit:** `47d7aec`, `ff4111c`
**Gejala:** Download error terkait YouTube signature/n-challenge — yt-dlp tidak bisa solve.
**Root Cause:** yt-dlp perlu JavaScript runtime untuk solve YouTube's n-challenge. Tidak ada runtime yang dikonfigurasi.
**Resolve:** Tambah `js_runtimes: {"node": {}}` ke yt-dlp opts. Node.js v22 tersedia di environment.
**Countermeasure:** Pastikan Node.js terinstall di environment (lokal maupun Docker image). Verifikasi dengan `node --version`.

---

### P-05 — 1080p Tidak Tersedia

**Commit:** `ff4111c`
**Gejala:** Download hanya dapat kualitas rendah meski format string minta 1080p.
**Root Cause:** `extractor_args: {"youtube": {"player_client": ["web"]}}` — override client ke `web` membatasi format yang YouTube expose. Client `web` tidak mendapat akses ke semua format.
**Resolve:** Hapus `extractor_args` sepenuhnya. Biarkan yt-dlp pilih client terbaik secara otomatis.
**Countermeasure:** Jangan override `player_client` kecuali ada alasan spesifik. Default yt-dlp sudah optimal.

---

### P-06 — Download Stuck 0%: GitHub Fetch Block

**Commit:** `95bc4f9`
**Gejala:** Download stuck di 0%, tidak bergerak sama sekali.
**Root Cause:** `remote_components: ["ejs:github"]` menyebabkan yt-dlp fetch JavaScript solver dari GitHub setiap kali download dimulai. Request ke GitHub lambat/timeout → blokir seluruh pipeline sebelum download mulai.
**Resolve:** Hapus `remote_components`. yt-dlp sudah bundel solver lokal (`yt.solver.core.js`) di dalam package-nya. `js_runtimes: {"node": {}}` cukup untuk pakai solver lokal.
**Countermeasure:** Jangan pakai `remote_components` di production. Solver sudah tersedia lokal di yt-dlp package. Verifikasi: `ls $(python -c "import yt_dlp; print(yt_dlp.__path__[0])")/extractor/youtube/jsc/_builtin/vendor/`.

---

### P-07 — Download Stuck 0%: HLS/m3u8 Format

**Commit:** `350fb0f`
**Gejala:** Download stuck di 0%, tapi kadang tiba-tiba selesai (finished tanpa progress naik).
**Root Cause:** yt-dlp memilih format HLS (`m3u8`) — format streaming segmen yang tidak punya `total_bytes` di awal. Progress hook hitung `0 / 0 = 0%` selamanya.
**Bukti:** Log yt-dlp menunjukkan `Downloading m3u8 information`.
**Resolve:** Exclude m3u8 dari format string:
```python
"bestvideo[height<=1080][protocol!=m3u8][protocol!=m3u8_native]+bestaudio[protocol!=m3u8][protocol!=m3u8_native]/bestvideo[height<=1080]+bestaudio/best"
```
**Countermeasure:** Selalu exclude `protocol!=m3u8` dan `protocol!=m3u8_native` jika progress bar dibutuhkan. HLS tidak compatible dengan progress tracking berbasis `total_bytes`.

---

### P-08 — Progress Reset ke 0% Saat Download Audio

**Commit:** `54625a0`
**Gejala:** Progress naik normal sampai ~100%, lalu tiba-tiba balik ke 0% dan naik lagi.
**Root Cause:** yt-dlp format `bestvideo+bestaudio` download **dua file terpisah** (video stream + audio stream) lalu merge dengan ffmpeg. Progress hook dipanggil untuk masing-masing file secara independen — file pertama 0→100%, lalu file kedua mulai dari 0% lagi → di UI kelihatan reset.
**Resolve:** Track index file yang sedang didownload. Bagi progress menjadi dua bagian:
- File 1 (video): progress 0% → 50%
- File 2 (audio): progress 50% → 99%
- Merge selesai: 100%
```python
progress = min(int(_file_index[0] * 50 + file_pct / 2), 99)
```
**Countermeasure:** Setiap kali yt-dlp download format gabungan (video+audio), selalu hitung jumlah file yang akan didownload dan normalize progress-nya.

---

### P-09 — Logo Terlihat Berlatar Putih

**Commit:** `e859971`
**Gejala:** Logo ARCH:IVE di header terlihat ada kotak putih di belakang huruf merah.
**Root Cause:** Logo.png tidak benar-benar transparan — pixel background adalah warna putih/near-white dengan alpha=255 (fully opaque). File viewer menampilkan checkerboard (terlihat transparan) tapi browser render background putih.
**Resolve:** Gunakan PIL/Pillow untuk convert semua pixel near-white (R≥200, G≥200, B≥200) yang bukan merah menjadi transparent (alpha=0):
```python
is_bg = (r >= 200) & (g >= 200) & (b >= 200) & ~((r > 180) & (g < 80) & (b < 80))
data[is_bg, 3] = 0
```
**Countermeasure:** Verifikasi transparansi PNG dengan script PIL, bukan hanya secara visual di file viewer. Cek pixel corner: `img.getpixel((0,0))` — alpha harus 0 untuk background transparan.

---

## 4. Countermeasure & Prinsip Desain

### Download (yt-dlp)

| Rule | Alasan |
|------|--------|
| Jangan override `player_client` | Membatasi format yang tersedia (P-05) |
| Jangan pakai `remote_components` | Blokir download dengan network call ke GitHub (P-06) |
| Selalu exclude `protocol!=m3u8` | HLS tidak punya total_bytes, progress selalu 0% (P-07) |
| Selalu sediakan fallback `/` di format string | Format spesifik bisa tidak tersedia (P-01) |
| Gunakan `js_runtimes: {"node": {}}` | Node.js diperlukan untuk n-challenge YouTube (P-04) |
| `cookiefile` wajib di VPS/headless | Bot detection YouTube (P-02) |

### Format String yang Direkomendasikan (current)

```python
# Dengan ffmpeg:
"bestvideo[height<=1080][protocol!=m3u8][protocol!=m3u8_native]+bestaudio[protocol!=m3u8][protocol!=m3u8_native]/bestvideo[height<=1080]+bestaudio/best"

# Tanpa ffmpeg:
"best[height<=1080][ext=mp4][protocol!=m3u8][protocol!=m3u8_native]/best[ext=mp4]/best[ext=webm]/best"
```

### Path & Config

| Rule | Alasan |
|------|--------|
| Gunakan `Path(__file__).resolve().parent` | Path relatif ke file, bukan cwd (P-03) |
| Load `.env` eksplisit di `main.py` | uvicorn tidak auto-load `.env` (P-03) |
| Mount cookies via Docker volume, bukan COPY | Kredensial tidak masuk ke image (P-02) |
| `cookies.txt` selalu di `.gitignore` | Keamanan credentials (P-02) |

### Progress Bar

| Rule | Alasan |
|------|--------|
| Normalize progress jika multi-file download | Tiap file reset ke 0% (P-08) |
| Exclude m3u8 atau handle `total_bytes=0` | HLS tidak punya size upfront (P-07) |
| Cap progress di 99% saat download, 100% saat done | Merge step tidak terefleksi di hook |

### Assets & Frontend

| Rule | Alasan |
|------|--------|
| Verifikasi PNG transparency dengan PIL | File viewer bisa misleading (P-09) |
| Hero carousel: pause on hover, exclude m3u8 | UX best practice |
| Poll interval 2 detik untuk status download | Balance antara responsiveness dan server load |

---

*Dokumen ini di-maintain secara manual. Update setiap kali ada problem baru yang diselesaikan.*
