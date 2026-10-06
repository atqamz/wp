# Brainstorm: Wedding Planner PWA (`wp.atqamz.com`)

Dokumen diskusi, bukan keputusan final. Riset per 2026-10-06; semua halaman docs yang dikutip dicek tanggal itu.

> **Privasi.** Repo ini publik. Dokumen ini cuma membahas *struktur* spreadsheet (nama sheet, kolom, tipe, formula, dropdown). Nggak ada nama, nomor HP, alamat, nama tamu, nama vendor, nominal, atau tanggal asli. Contoh pakai placeholder karangan seperti `Nama A`, `+62 8xx-xxxx-xxxx`, `Rp X`.

Ringkasnya: satu Cloudflare Worker yang sekaligus nyajiin static assets dan `/api/*`, data di D1, login pakai Cloudflare Access (email OTP), frontend HTML/CSS/JS tanpa build step dengan layer data yang dipisah dari view. Data disimpan lokal di IndexedDB biar bisa offline, lalu sync ke D1. Detail dan alasannya di bawah.

---

## 1. Inventaris sheet

### Temuan umum

- **File ini hasil export dari template Google Sheets.** Buktinya: formula `FILTER` di sheet Kontak Vendor tersimpan sebagai `__xludf.dummyfunction(...)` dengan nilai cache, dan ada catatan template yang nyuruh "File > Make a Copy". Akibatnya formula `FILTER` itu **beku** di ODS: kalau dibuka di LibreOffice, isinya nggak ikut update.
- **Nggak ada satu pun formula lintas sheet.** Tiap sheet berdiri sendiri. Penghubungnya cuma:
  - menu hyperlink di kolom B tiap sheet (11 link internal ke sel `A1` tiap sheet);
  - dua chart yang sumber datanya sheet itu sendiri;
  - hubungan *konsep* yang diisi manual (lihat [ringkasan dependensi](#ringkasan-dependensi)).
- **Layout-nya "form", bukan tabel.** Header ada di baris 4–7, data mulai kolom F, dan beberapa sheet punya 2–12 blok tabel bersebelahan. Jadi script import harus baca berdasarkan koordinat sel, bukan "baris pertama = header".
- **Ada sisa template yang rusak:** 10 named expression mengarah ke `#REF!`, dan beberapa conditional format pakai `#ref!`. Aman diabaikan.
- **Sebagian sheet tampaknya masih berisi data contoh dari template atau data uji** (misalnya isian vendor yang kelihatan asal ketik). Sebelum import, perlu dipilah mana data asli.

### 1.1 DASHBOARD

- **Fungsi:** halaman depan. Isinya menu, label nama pasangan, tanggal pernikahan, countdown, dan catatan template.
- **Field:** label pasangan (string); tanggal pernikahan (date).
- **Formula:** countdown `=[.F10]-TODAY() & " Days"`. Hasilnya string, bukan angka.
- **Validasi:** `val1` (isi harus tanggal) dipasang di blok `E10:E18` dan sel tanggal.
- **Lainnya:** 11 hyperlink menu dan blok "Catatan Penting" berisi teks template.

### 1.2 Timeline

- **Fungsi:** checklist persiapan plus grid Gantt 8 minggu.
- **Header:**
  - `Tanggal Dimulai` (date);
  - `Tampilkan Minggu` (integer, offset minggu yang ditampilkan grid);
  - label wedding (string, nama pasangan diketik ulang; duplikat dari DASHBOARD).
- **Tabel tugas** (baris 8–52, 45 slot):

  | Kolom | Tipe | Isi / formula |
  |---|---|---|
  | E (no) | number | `=IF([.F8]<>"";ROW([.D1]);"")` |
  | `Persiapan` | string | nama tugas |
  | `Start Date` | date | validasi `val2` (harus tanggal) |
  | `End Date` | date | validasi `val2` |
  | durasi | number | `=IF([.H8]="";""; DATEDIF([.G8];[.H8];"d"))`, tampil "N Hari" |
  | `Status` | string | `=IF([.F8]="";""; IF([.K8]=1;"Selesai";"Proses"))` |
  | K | boolean | checkbox selesai |

- **Total hari:** `=SUM(H8:H52)-SUM(G8:G52)+1`.
- **Grid Gantt `L:BO`** (56 kolom hari):
  - baris header: "Minggu N", tanggal, dan singkatan hari lewat `INDEX({"Sen"|…|"Mgg"};WEEKDAY(…;2))`;
  - tanggal awal grid: `=G4-WEEKDAY(G4;1)+2+7*(J4-1)`.
- **Conditional formatting:** highlight hari ini; bar antara start–end; bar progress `checkbox × durasi`; warna untuk status Selesai/Proses.
- **Isi tugas:** template generik (lamaran, berkas KUA, vendor/WO, seserahan, undangan, fitting, honeymoon, dan sejenisnya).

### 1.3 Skenario Budget

- **Fungsi:** referensi statis. Ada 6 tabel skenario dengan total budget berbeda.
- **Kolom tiap tabel:** `NO` (number), `LIST PERSIAPAN` (string), `BIAYA` (currency). Isinya 10 item per skenario.
- **Formula:** `Total = SUM(BIAYA)` per tabel.
- **Nggak dirujuk sheet lain.**

### 1.4 Anggaran Pernikahan

- **Fungsi:** tagihan dan pembayaran per kegiatan.
- **Tiga tabel kegiatan:** `ANGGARAN LAMARAN` (10 slot), `ANGGARAN AKAD` (5 slot), `ANGGARAN RESEPSI` (10 slot).
- **Kolom:**

  | Kolom | Tipe | Formula |
  |---|---|---|
  | `No` | number | – |
  | `Kegiatan` | string | – |
  | `Tagihan (Awal)` | number | – |
  | `DP/Lunas`, `Termin 1`, `Termin 2` | number | – |
  | `Total Dibayar` | number | `=IF([.G18]="";"";SUM([.I18:.K18]))` |
  | `Tagihan (Sisa)` | number | `=IF([.L18]="";"";[.H18]-[.L18])` |

  Tiap tabel ditutup baris `Total` = `SUM` per kolom.
- **Matriks ringkasan:**
  - baris: Tagihan (Awal), DP/Lunas, Termin 1, Termin 2, Total Dibayar, Tagihan (Sisa);
  - kolom: LAMARAN, AKAD, RESEPSI, SUBTOTAL KEGIATAN;
  - isinya `SUM` dari tabel di bawahnya.
- **Bug di sheet:**
  - Baris `Subtotal Kategori` = `SUM` keenam baris ringkasan. Artinya tagihan, pembayaran, dan sisa dijumlah jadi satu (double count), jadi angkanya nggak bermakna.
  - Sel AKAD × Termin 1 di ringkasan diisi teks `---`, bukan formula.
- **Chart (Object 1):** bar chart Total Dibayar vs Tagihan (Sisa) (kolom subtotal).
- **Batasan:** pembayaran dikunci 3 kolom (DP, T1, T2). Nggak ada tanggal jatuh tempo maupun tanggal bayar.

### 1.5 Target Tabungan

- **Dropdown:** tahun (`val3`, daftar 5 tahun) dan bulan (`val4`, Januari–Desember, 14 slot baris).
- **Kolom:** bulan (string dari dropdown), `Masuk` Calon Mempelai Pria (number), `Masuk` Calon Mempelai Wanita (number).
- **Formula:** `TARGET` diisi konstan; `TERKUMPUL = SUM(G6:G19)+SUM(H6:H19)`.
- **Chart (Object 2):** TARGET vs TERKUMPUL.
- **Belum ada:** sisa kekurangan, target per bulan, maupun proyeksi.

### 1.6 List Seserahan

- **Kolom:**
  - `Kebutuhan` (string);
  - `Link Pembelian` (URL short-link marketplace);
  - `Harga (Rp)` (number);
  - `Kategori` (dropdown `val5`: Perangkat Alat Solat, Make Up & Skin Care, Peralatan Mandi, Pakaian Dalam, Pakaian Luar, Kebutuhan Lain);
  - `Status` (dropdown `val6`: Selesai, On Proses, Belum Selesai).
- **Formula:** `ESTIMASI BIAYA = SUM(Harga)`.
- **Ukuran:** sekitar 37 baris terisi, slot sampai baris 50.

### 1.7 List Administrasi

- **Kolom:**
  - `No`;
  - `Dokumen Pernikahan` (string);
  - `Nominal`, `Detail`, `Jumlah` (semuanya kosong);
  - `Status` (dropdown `val7`: Selesai, Belum).
- **Isi:** dokumen untuk KUA, misalnya pendaftaran, fotokopi identitas calon pengantin dan orang tua, surat keterangan sehat, vaksin, surat pengantar kelurahan, pas foto, materai, dan mahar untuk pengajuan.
- **Blok `CATATAN`:** teks panjang alur ngurus surat nikah: RT/RW → kelurahan (formulir N1/N2/N4) → KUA asal (rekomendasi numpang nikah) → KUA tujuan.
- **Formula:** nggak ada.

### 1.8 Kontak Vendor

- **Tabel kiri `LIST RENCANA VENDOR`:**
  - `Ops Vendor` (dropdown `val8`: Venue, Decoration, Wedding Organizer, MUA, Catering, Photography, Attire, Hand Bouquet, MC, Entertaiment; typo-nya memang dari sumber);
  - `Nama Vendor` (string);
  - `No Tlp`: disimpan sebagai **number**. Nol di depan dan `+62` hilang, jadi saat import harus dinormalisasi;
  - `PIC` (string);
  - `Action` (dropdown `val9` dengan satu opsi: `FIX`).
- **Tabel kanan `FIX KERJASAMA VENDOR`:**
  - kolom: `No` (`=IF([.O5]<>"";ROW(...);"")`), `Vendor`, `Nama Vendor`, `No Tpl`, `Catatan`;
  - isinya hasil `FILTER(F5:I37,(J5:J37="FIX"))` versi Google Sheets, yang di ODS jadi nilai cache beku.
  - Header kolom ke-4 di kanan (`Catatan`) beda dengan kolom kiri (`PIC`), jadi labelnya nggak cocok.

### 1.9 List Tamu

- **Struktur:** dua sisi, `LIST TAMU MEMPELAI LAKI-LAKI` (kolom F–Q) dan `LIST TAMU MEMPELAI PEREMPUAN` (kolom U–AF).
- **Per sisi ada 6 kategori:** Teman, Kolega, Keluarga, Tetangga, Teman Orang Tua, VIP.
- **Tiap kategori = 2 kolom:** nama (string) dan jumlah (number, kemungkinan jumlah orang per undangan).
- **Formula:** header kolom jumlah = `SUM` baris 5–36 (32 slot).
- **Saat ini kosong.**
- Bentuknya *wide* (12 blok). Di app diubah jadi *long*: satu baris per tamu.

### 1.10 Rundown Acara

- **Dua tabel:** `RUNDOWN ACARA LAMARAN` dan `RUNDOWN RESEPSI DAN PERNIKAHAN` (akad dan resepsi digabung).
- **Kolom:**
  - checkbox (boolean, diisi formula `TRUE()`/`FALSE()`);
  - `No`;
  - `Waktu`: **string** rentang `HH.MM - HH.MM`, bukan tipe time;
  - `Acara`, `PIC`, `Keterangan`;
  - khusus tabel lamaran: `Highlights` (teks multi-baris).
- **Conditional formatting:** baris di-highlight kalau checkbox dicentang; nomor di-highlight kalau `Acara` kosong.

### 1.11 List Lagu

- **Kolom:** `No`, `Judul`, `Penyanyi`.
- **Formula:** nggak ada.
- **Belum ada:** kolom momen (misalnya "masuk pengantin").

### Ringkasan dependensi

**Formula di dalam sheet** (nggak ada yang lintas sheet):

- **Anggaran:** ringkasan ← tiga tabel kegiatan.
- **Tabungan:** TERKUMPUL ← entri bulanan.
- **Seserahan:** ESTIMASI ← kolom harga.
- **Tamu:** header kategori ← kolom jumlah.
- **Vendor:** tabel FIX ← tabel rencana (lewat `FILTER`, beku di ODS).
- **Dashboard:** countdown ← tanggal pernikahan.

**Dependensi konsep** (diisi manual, rawan beda angka):

```
Skenario Budget ──acuan──▶ Anggaran Pernikahan ◀──baris "Seserahan"── List Seserahan (estimasi)
                                   ▲    ▲
             vendor FIX ───────────┘    └──── biaya KUA / mahar ──── List Administrasi
Dashboard (tanggal, nama) ◀──diketik ulang──▶ Timeline (label wedding)
Timeline (tugas) ──menyebut──▶ seserahan, administrasi/KUA, vendor, undangan, tamu, rundown
Target Tabungan ──dibandingkan manual──▶ total Anggaran
```

---

## 2. Feature map dan MVP cut

### Pemetaan sheet → app

| Sheet | Di app | Status |
|---|---|---|
| DASHBOARD | Home: countdown, ringkasan budget, progress tabungan, 5 tugas/pembayaran terdekat | MVP |
| Timeline | List tugas (start, end, selesai), urut tanggal, badge "telat". Grid Gantt **dibuang** | MVP (disederhanakan) |
| Skenario Budget | Dibuang. Kalau perlu, nanti jadi "preset" saat setup awal | Drop |
| Anggaran Pernikahan | Item anggaran per kegiatan (lamaran/akad/resepsi) + **baris pembayaran** (DP/termin jadi baris bebas, ada due date) | MVP |
| Target Tabungan | Entri setoran per bulan per orang + progress ke target | MVP |
| List Seserahan | List generik (harga, link, kategori, status, total) | MVP |
| List Administrasi | Checklist generik (dokumen, nominal, detail, jumlah, selesai). Catatan alur KUA jadi teks statis | MVP |
| Kontak Vendor | Satu tabel vendor dengan status `opsi`/`fix` (tabel FIX jadi filter) + tombol telepon/WhatsApp | MVP (merge) |
| List Tamu | Satu tabel tamu (sisi, kategori, nama, jumlah orang) + total per sisi/kategori | MVP (merge) |
| Rundown Acara | Rundown per acara + **mode hari-H** (offline, sorot "sekarang/berikutnya", centang) | MVP |
| List Lagu | List generik (judul, penyanyi, catatan) | MVP |

**Dibuang:**

- grid Gantt dan `Tampilkan Minggu`;
- menu hyperlink (diganti bottom nav);
- chart (diganti `<progress>` native, lihat [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/progress));
- Skenario Budget;
- teks catatan template.

**Digabung:**

- tanggal dan nama pasangan (DASHBOARD + label Timeline) → satu tabel `settings`;
- vendor rencana + FIX → satu tabel;
- DP/Termin 1/Termin 2 → tabel `payments`;
- 12 blok tamu → satu tabel.

### Cara paling malas: satu generic list screen

Tujuh dari sebelas sheet bentuknya sama: baris dengan beberapa field, status/checkbox, dan satu total. Jadi bikin **satu** komponen list+form yang dikonfigurasi per tabel (field, tipe input, kolom yang dijumlah, group by), daripada tujuh layar terpisah.

Layar khusus cuma tiga:

1. Dashboard.
2. Anggaran (pembayaran nested di bawah item).
3. Rundown mode hari-H.

Tipe input pakai elemen native:

- `<input type="date">` dan `<input type="time">`;
- `<input type="month">` untuk tabungan. Didukung di Chrome Android dan iOS Safari, tapi **nggak** di Safari/Firefox desktop menurut [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/month) dan [browser-compat-data](https://github.com/mdn/browser-compat-data). Mobile-first, jadi aman;
- `<datalist>` untuk saran kategori, jadi kategori tetap bebas tapi ada pilihan.

### Definisi MVP: "spreadsheet bisa dipensiunkan"

1. Kalian berdua bisa login, dan data sinkron di dua HP.
2. Semua data dari sheet bisa dilihat, ditambah, diubah, dan dihapus, termasuk saat offline.
3. Dashboard menampilkan countdown, total tagihan/dibayar/sisa, progress tabungan, dan yang terdekat.
4. Rundown hari-H bisa dibuka tanpa sinyal.
5. Import sekali dari ODS.

### Tambahan murah yang ikut MVP

Semuanya cuma hitungan di client atau satu link:

- **Countdown:** dari `settings.wedding_date`.
- **Due date pembayaran:** badge "lewat jatuh tempo" dan daftar "7 hari ke depan".
- **Progress tabungan:** plus "perlu nabung `Rp X`/bulan" = (target − terkumpul) / sisa bulan sampai hari-H.
- **Tap-to-call dan WhatsApp:**
  - telepon: `tel:+628xxxxxxxxxx`;
  - WhatsApp: `https://wa.me/628xxxxxxxxxx` (format resmi click-to-chat, [WhatsApp FAQ](https://faq.whatsapp.com/5913398998672934)).

  Keduanya butuh nomor yang sudah dinormalisasi ke format internasional.
- **Rundown offline:** datanya sudah ada di IndexedDB, jadi tinggal view-nya.

### Backlog (urut prioritas)

1. **"Tambah ke Kalender"** untuk due date pembayaran dan tugas. Bentuknya file `.ics` yang di-generate di client, lalu reminder ditangani kalender HP. Nol kode server. Ini pengganti push yang paling murah.
2. **Export CSV** per tabel, untuk backup dan arsip setelah acara. D1 Time Travel cuma 7 hari di free plan, lihat [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
3. **Field tamu tambahan:** nomor HP, undangan terkirim, status hadir, dan link WA undangan.
4. **Share rundown** ke WhatsApp sebagai teks (`https://wa.me/?text=…`, teks di-URL-encode; [WhatsApp FAQ](https://faq.whatsapp.com/5913398998672934)).
5. **Web Push reminder.** Hanya kalau `.ics` ternyata kurang, lihat §5.6.
6. **Halaman RSVP publik.** Hanya kalau benar-benar perlu, lihat biaya privasinya di §4.
7. **Lampiran** (foto nota, moodboard) di R2. Butuh langganan R2 dengan checkout, lihat §3.
8. **Realtime** (Durable Objects + WebSocket). Kemungkinan besar nggak pernah perlu untuk dua orang.

### Spesifik pernikahan Indonesia yang tersirat di sheet

- **Tiga kegiatan:** lamaran, akad, resepsi. Jadi enum `event` di anggaran, dan pengelompokan rundown (sheet menggabung akad + resepsi dalam satu rundown).
- **Seserahan:** kategori persis seperti dropdown sheet; ada estimasi total dan link beli.
- **Administrasi:** checklist dokumen KUA dan catatan alur N1/N2/N4 serta numpang nikah.
- **Mahar:** muncul di anggaran dan di administrasi.
- **Tamu:** dipisah per pihak mempelai pria/wanita.

---

## 3. Arsitektur di Cloudflare free plan

### 3.1 Hosting: Workers static assets vs Pages

| | Workers + static assets | Pages |
|---|---|---|
| Request ke file statis | "free and unlimited", nggak dihitung ke kuota Worker ([docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)) | statis gratis; request ke Pages Functions dihitung ke kuota Workers ([docs](https://developers.cloudflare.com/pages/platform/limits/)) |
| API | Worker yang sama (`/api/*`) | Pages Functions (tetap runtime Workers) |
| Fitur | Cron Triggers, Workers Logs, Gradual Deployments ada di Workers, nggak ada di Pages ([matriks migrasi](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)) | lebih sedikit |
| Batas file | 20.000 file/versi, 25 MiB/file ([docs](https://developers.cloudflare.com/workers/platform/limits/)) | 20.000 file, 25 MiB/file, 500 build/bulan ([docs](https://developers.cloudflare.com/pages/platform/limits/)) |
| Custom domain | Custom Domain butuh zone Cloudflare yang aktif ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)). Zone `atqamz.com` sudah di Cloudflare, lihat §8 | subdomain bisa via CNAME tanpa zone ([docs](https://developers.cloudflare.com/pages/configuration/custom-domains/)). Keunggulan ini nggak relevan di sini |

**Pilih Workers + static assets:** satu unit deploy, file statis gratis tanpa batas, dan fitur tambahan (cron untuk reminder) tersedia kalau nanti perlu.

### 3.2 Storage: D1 vs KV vs R2 vs Durable Objects

- **D1 (pilih).**
  - SQL beneran, cocok dengan bentuk data yang tabular.
  - Batch statement jalan sebagai transaksi SQL ([docs](https://developers.cloudflare.com/d1/worker-api/d1-database/)).
  - Ada `wrangler d1 export`, migrations, dan Time Travel 7 hari di free plan sebagai jaring pengaman kalau ada data ketimpa ([limits](https://developers.cloudflare.com/d1/platform/limits/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)).
- **KV (nggak).**
  - Free plan cuma 1.000 write/hari ([pricing](https://developers.cloudflare.com/kv/platform/pricing/)) dan 1 write/detik per key ([limits](https://developers.cloudflare.com/kv/platform/limits/)).
  - Eventually consistent: perubahan bisa butuh "up to 60 seconds or more" untuk terlihat di lokasi lain ([how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)).
  - Jelek untuk dua orang yang ngedit list yang sama.
- **R2 (belum).**
  - Untuk file/lampiran, bukan data baris.
  - Perlu "an R2 subscription" lewat checkout ([get started](https://developers.cloudflare.com/r2/get-started/)), artinya harus pasang metode pembayaran walau masih di free tier.
  - Taruh di backlog.
- **Durable Objects (alternatif, nggak dipilih).**
  - Free plan cuma boleh SQLite-backed ([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). Kuotanya mirip D1 dan ada WebSocket untuk realtime.
  - Tapi butuh class, binding, migrations DO, dan routing ke instance. Lebih banyak kode untuk konsistensi yang sudah cukup dari D1 (satu database, satu primary).
  - Simpan sebagai opsi kalau realtime benar-benar dibutuhkan.

Alternatif super-malas yang sengaja **nggak** dipilih: satu tabel `items(kind, data JSON)`. Lebih sedikit migration, tapi kehilangan constraint SQL dan bikin import/agregasi lebih ribet.

### 3.3 API: satu Worker, dua endpoint

Router manual dengan `switch` di `pathname`, tanpa framework. Kontraknya:

```
GET  /api/sync?since=<rev>   → { rev, changes: { <table>: [rows...] } }
POST /api/sync               ← { mutations: [{ id, table, op: "create"|"update"|"delete", row_id, patch }] }
                             → { rev, rows: { <table>: [rows setelah diterapkan] } }
GET  /api/login              → 302 ke "/" (cuma dipakai untuk memicu login Access, lihat §5.5)
```

Tabel dan kolom di-whitelist di Worker. Detail sync ada di §5.

### 3.4 Gambaran

```
HP Partner A / HP Partner B (PWA: Service Worker + IndexedDB)
        │  HTTPS wp.atqamz.com
        ▼
Cloudflare Access (Worker-level, email OTP) ──tolak kalau bukan 2 email itu
        ▼
Worker "wp"
  ├─ static assets (public/)  → gratis, nggak makan kuota request
  └─ /api/sync, /api/login    → D1 "wp"
```

### 3.5 Limit free plan (dicek 2026-10-06)

| Layanan | Limit free | Kalau kena | Sumber |
|---|---|---|---|
| Workers requests | 100,000/day per akun, reset tengah malam UTC (jam 7 pagi WIB) | Error 1027. Rute "fail open" melewati Worker; "fail closed" menampilkan halaman 1027. Untuk app ini artinya API mati sampai reset | https://developers.cloudflare.com/workers/platform/limits/ |
| Static assets | request "free and unlimited". Path di `run_worker_first` tetap memanggil Worker | path `run_worker_first` dapat 429 saat kuota habis | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ |
| Workers CPU | 10 ms per HTTP request dan per Cron Trigger | Error 1102 "Worker exceeded resource limits" | https://developers.cloudflare.com/workers/platform/limits/ |
| Workers lainnya | memory 128 MB; subrequest 50/request; ukuran Worker 64 MiB; 100 Worker; **5 Cron Triggers per akun**; 20.000 file aset/versi; 25 MiB/file | deploy ditolak / error | https://developers.cloudflare.com/workers/platform/limits/ |
| D1 rows read | 5 million / day (dihitung baris yang *di-scan*, bukan yang dikembalikan) | query D1 error sampai reset 00:00 UTC | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 rows written | 100,000 / day (index menambah 1 baris tulis per index yang kena) | query D1 error sampai reset | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 storage | 5 GB total akun; 500 MB per database; 10 database; 50 query per invocation; Time Travel 7 hari | harus hapus data sebelum bisa insert/alter lagi | https://developers.cloudflare.com/d1/platform/limits/ |
| KV | 100,000 read/day; 1,000 write/day; 1,000 delete/day; 1,000 list/day; 1 GB; 1 write/detik per key | operasi jenis itu error sampai 00:00 UTC | https://developers.cloudflare.com/kv/platform/pricing/ · https://developers.cloudflare.com/kv/platform/limits/ |
| R2 | 10 GB-month/bulan; Class A 1 million/bulan; Class B 10 million/bulan; egress gratis; hanya Standard storage | wajib langganan R2 via checkout. Di atas free tier ditagih sesuai harga di halaman pricing. **Belum terverifikasi** apakah bisa dipasang batas keras | https://developers.cloudflare.com/r2/pricing/ · https://developers.cloudflare.com/r2/get-started/ |
| Durable Objects | SQLite-backed saja; 100,000 request/day; 13,000 GB-s/day; 5 million rows read/day; 100,000 rows written/day; 5 GB | operasi error sampai 00:00 UTC; storage penuh → `SQLITE_FULL` | https://developers.cloudflare.com/durable-objects/platform/pricing/ · https://developers.cloudflare.com/durable-objects/platform/limits/ |
| Access (Zero Trust Free) | gratis "for up to 50 users". Seat terpakai saat user melakukan autentikasi | user ke-51 nggak bisa ditambah. **Belum terverifikasi** di docs resmi apa persisnya yang terjadi | https://developers.cloudflare.com/reference-architecture/architectures/sase/ · https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/ |
| Access onboarding | saat setup Zero Trust harus isi detail pembayaran. Untuk Free plan "you will not be charged" | – | https://developers.cloudflare.com/cloudflare-one/setup/ |
| Access session | dari langsung habis sampai satu bulan; default global dan aplikasi 24 jam | user harus login ulang (kode OTP baru) | https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/ |
| Workers Builds (CI) | 3,000 build minutes/bulan; 1 build bersamaan; timeout 20 menit | build antre / gagal | https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ |

### 3.6 Estimasi pemakaian dan apa yang jebol duluan

Asumsi kasar: tiap buka app = 1 pull + beberapa push.

- **Workers requests:** 2 orang × 30 kali buka × 3 request ≈ 180 request/hari, kurang dari 0,2% dari 100,000.
- **D1 rows read:** total data kira-kira ribuan baris. Pull pakai index `rev`, jadi cuma baris yang berubah yang dibaca. Kalaupun full pull 1.000 baris × 60 kali/hari = 60 ribu rows read, sekitar 1,2% dari 5 million.
- **D1 rows written:** 1 edit ≈ 1 baris tabel + 1 baris index `rev` + 1 baris `sync_state` ≈ 3. Jadi 300 edit/hari ≈ 900, di bawah 1% dari 100,000.

Untuk dua orang, nggak ada yang jebol **kecuali ada bug**. Urutan risikonya:

1. **Loop polling atau retry.** Polling 1×/detik = 86.400 request/hari per HP. Dua HP sudah lewat 100,000. Aturannya: **jangan pernah polling.** Sync hanya saat app dibuka atau fokus, setelah ada perubahan, dan saat event `online`.
2. **Full scan berulang.** `SELECT *` tanpa index di dalam loop bisa menghabiskan 5 million rows read. Pakai index `rev`.
3. **Kuota dipakai bareng.** Kuota Workers dihitung per akun, dan 5 Cron Triggers juga per akun. Kalau akun yang sama dipakai proyek lain, kuotanya kebagi. **Belum terverifikasi:** apakah ada Worker lain di akun kamu.
4. **KV kalau dipakai untuk session/counter.** 1,000 write/hari cepat habis. Jangan pakai KV.
5. **CPU 10 ms.** Jangan parse ODS di Worker; import dilakukan offline (§7). Verifikasi JWT pakai WebCrypto native, jadi aman.

---

## 4. Auth untuk dua orang

| Opsi | Kode yang ditulis | UX di HP | Biaya | Catatan |
|---|---|---|---|---|
| **Cloudflare Access + email one-time PIN** | ±0 (konfigurasi dashboard) + validasi JWT | ketik email → kode di email (berlaku 10 menit) → masuk. Ulang tiap habis session (maks 1 bulan) | gratis s.d. 50 user, tapi onboarding minta detail pembayaran | identitas email tersedia di JWT. [OTP docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) |
| Access + identity provider (mis. Google) | sama | tap "Login with Google". Lebih cepat kalau dua-duanya punya Google | sama | perlu bikin OAuth client di Google |
| Magic link buatan sendiri di Workers | tabel token, kirim email, cookie session, expiry, CSRF | klik link di email | gratis. Kirim ke *verified destination addresses* gratis di semua plan ([Email Service](https://developers.cloudflare.com/email-service/)), tapi butuh Email Routing aktif di zone | kode keamanan milik sendiri |
| Passkey (WebAuthn) di Workers | registrasi + assertion + simpan challenge + verifikasi COSE | paling enak (Face ID/sidik jari) | gratis | paling banyak kode. `@simplewebauthn/server` cuma menyebut Node dan Deno ([docs](https://simplewebauthn.dev/docs/packages/server)); dukungan Workers **belum terverifikasi** |
| "Device key" cookie (paling simpel) | ±20 baris: `/setup?key=…` cek secret → set cookie HttpOnly bertanda tangan | buka link setup sekali per HP, selesai | gratis, tanpa kartu | link setup = kredensial. Bocor = akses. Revoke dengan ganti secret |
| HTTP Basic Auth | ±10 baris | perilaku di PWA standalone iOS **belum terverifikasi** (prompt bisa muncul berulang) | gratis | nggak disarankan |

### Rekomendasi: Cloudflare Access dengan email OTP

Alasannya: kode auth yang ditulis nol, dikelola Cloudflare, dan revoke cukup dengan edit policy.

**Setup:**

1. Pasang Access di **level Worker**. Mode ini otomatis melindungi Custom Domain, `workers.dev`, dan preview URL sekaligus ([Workers + Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)).
2. Bikin policy Allow dengan Include berisi tepat 2 alamat email ([policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)).
3. Set session ke maksimum 1 bulan supaya jarang login ulang.

**Jebakan yang harus ditangani:**

- **`ctx.access` nggak tersedia.** Worker dengan static assets jalan di belakang router internal, dan router itu "does not pass `ctx.access` to the user Worker" ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)). Jadi validasi header `Cf-Access-Jwt-Assertion` sendiri pakai JWKS `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)). Library `jose` mendukung Cloudflare Workers ([README](https://github.com/panva/jose)). Ini dependency yang layak karena menyangkut keamanan. Email dari JWT dipakai untuk kolom `updated_by`.
- **Manifest.** Manifest yang butuh kredensial harus pakai `crossorigin="use-credentials"`, "even if the manifest file is in the same origin" ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)). Tanpa itu, manifest kena redirect login dan install bisa gagal.
- **Session habis di dalam PWA.** Request API kena redirect ke halaman login. Cara menanganinya ada di §5.5.
- **Onboarding Zero Trust minta detail pembayaran** walaupun Free ([setup](https://developers.cloudflare.com/cloudflare-one/setup/)). Kalau ini nggak bisa diterima, pakai **Plan B: device-key cookie**: paling sedikit kode, tanpa pihak ketiga, dan offline-friendly.
- **Cookie jar PWA iOS terpisah.** Di iOS, cookie web app di Home Screen terpisah dari Safari, jadi login harus dilakukan *di dalam* PWA. Ini **belum terverifikasi** di docs resmi Apple, jadi perlu dites di hari pertama.

### Bagian publik dan biaya privasinya

Sheet nggak punya kolom RSVP, jadi MVP **nggak punya bagian publik sama sekali**. Kalau nanti mau RSVP:

**Biaya privasi:**

- Siapa pun yang pegang link bisa lihat nama tamu, tanggal, dan lokasi acara.
- Link undangan pasti diteruskan di grup WhatsApp.
- Endpoint publik bisa di-enumerate atau di-spam.

**Mitigasi minimal:**

- Pisahkan ke hostname lain (mis. `rsvp.atqamz.com`), atau buat aplikasi Access terpisah untuk satu path dengan action **Bypass** ([policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)). Access bisa dipasang per path, misalnya `example.com/login` ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)).
- Satu token acak per tamu. Endpoint cuma mengembalikan baris tamu itu, tanpa listing.
- Tulisan dibatasi ke field RSVP saja.

**Saran:** jangan dibangun kecuali benar-benar perlu. Jaga juga agar `workers.dev` dan preview URL nggak terbuka publik: set `workers_dev: false`, `preview_urls: false`, atau lindungi lewat Access level Worker ([wrangler config](https://developers.cloudflare.com/workers/wrangler/configuration/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)).

---

## 5. Offline dan sync

### 5.1 Strategi Service Worker

- **App shell** (HTML, CSS, JS, ikon, vendor lib) di-*precache* dengan nama cache berversi, lalu cache-first.
- **Navigasi:** selalu dilayani dari `index.html` di cache, jadi app tetap kebuka tanpa sinyal.
- **`/api/*`:** **network-only**, nggak pernah masuk Cache API. Data hidup di IndexedDB.
- **Update:** SW baru menampilkan banner "Versi baru, muat ulang". `skipWaiting` dipanggil saat banner di-tap.
- **Tanpa Workbox.** Sekitar 20 baris sudah cukup:

```js
const CACHE = 'wp-v1';
const SHELL = ['/', '/index.html', '/app/main.js', '/app/style.css', '/manifest.webmanifest'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('/index.html').then(r => r || fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
```

### 5.2 Baca dan tulis offline

- **IndexedDB** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)) adalah sumber data UI.
  - Satu object store per tabel, plus store `outbox` dan `meta` (yang menyimpan `rev` terakhir).
  - Pakai wrapper `idb` (sekitar 3,4 KB gzip, diukur dari `build/index.js` versi 8.0.3), atau tulis promise wrapper sendiri sekitar 30 baris. Dexie (sekitar 31 KB gzip) berlebihan untuk kebutuhan ini.
- **Tulis:**
  1. Update store lokal (UI langsung berubah).
  2. Tambahkan mutation `{ id: crypto.randomUUID(), table, op, row_id, patch }` ke `outbox`.
  3. Coba flush.
- **Kapan flush:** setelah menulis, saat app dibuka, saat `visibilitychange` ke visible, dan saat event `online`.
- **Jangan andalkan Background Sync.** `SyncManager` nggak didukung Safari maupun Firefox (data [browser-compat-data](https://github.com/mdn/browser-compat-data), lihat juga [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)). Outbox cuma terkirim saat app terbuka, dan itu cukup.
- **Batasi isi batch.** Flush maksimal sekitar 20 mutation per request karena free plan membatasi 50 query D1 per invocation ([limits](https://developers.cloudflare.com/d1/platform/limits/)). Apakah satu `batch()` dihitung 1 atau N query **belum terverifikasi**, jadi ambil aman.
- **Baca:** `GET /api/sync?since=<rev>`, lalu merge ke IndexedDB dan simpan `rev` baru.
- **ID dibuat di client** (`crypto.randomUUID()`, didukung Safari 15.4+ menurut [browser-compat-data](https://github.com/mdn/browser-compat-data)), jadi baris yang dibuat offline nggak bentrok.

### 5.3 Konflik antar dua HP

Untuk dua orang, strategi ini cukup tanpa CRDT:

- **`rev` dari server.** Satu counter global di `sync_state`. Tiap request tulis menaikkan counter itu dalam satu `batch()` (transaksi), dan semua baris yang ditulis mendapat `rev` tersebut. Pull pakai `WHERE rev > ?`. Cursor ini nggak bergantung jam HP.
- **Last-write-wins per field.** Client cuma mengirim field yang berubah (`patch`). Jadi kalau Partner A ubah harga dan Partner B ubah status di baris yang sama, dua-duanya selamat. Kalau field-nya sama, yang sampai server belakangan menang.
- **Kelihatan siapa yang ngubah.** Kolom `updated_by` dan `updated_at` ditampilkan. Kalau hasil pull menimpa field yang baru diedit lokal, munculkan toast "diubah Partner B barusan".
- **Hapus = tombstone** (`deleted_at`). Kalau satu orang menghapus dan satu lagi mengedit, hapus yang menang. Undo cukup dengan mengosongkan `deleted_at`.
- **Urutan list** (rundown, tugas) pakai `sort REAL` (fractional index: sisipkan di antara dua angka). Memindah satu baris cuma menulis satu baris, jadi nggak ada konflik renumber.
- **Kasus sisa:** kalau ack hilang lalu mutation dikirim ulang telat, edit orang lain di field yang sama bisa ketimpa. Risiko ini diterima. Jaring pengamannya `updated_by` dan D1 Time Travel 7 hari.

Contoh tulis di Worker (diterapkan dalam satu `env.DB.batch([...])`):

```sql
UPDATE sync_state SET rev = rev + 1 WHERE id = 1;
UPDATE vendors
   SET phone = ?1, status = ?2,
       rev = (SELECT rev FROM sync_state WHERE id = 1), updated_at = ?3, updated_by = ?4
 WHERE id = ?5;
```

### 5.4 Install di Android dan iOS

**Android (Chrome):**

- Kriteria install: manifest dengan `name`/`short_name`, ikon 192 px dan 512 px, `start_url`, `display` standalone (atau sejenisnya), dan HTTPS.
- Ada juga heuristik engagement: pernah tap sekali dan ±30 detik di halaman ([web.dev](https://web.dev/articles/install-criteria)).
- Event `beforeinstallprompt` cuma ada di Chromium ([browser-compat-data](https://github.com/mdn/browser-compat-data)). Bisa dipakai untuk tombol "Install" sendiri.

**iOS/iPadOS:**

- Nggak ada `beforeinstallprompt`. Install manual lewat Share → Add to Home Screen ([web.dev](https://web.dev/learn/pwa/installation-prompt)). Sejak iOS 16.4, browser pihak ketiga juga boleh menawarkan Add to Home Screen dari menu Share ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)), tapi Safari tetap jalur yang paling pasti.
- Sejak Safari 26, "every website added to the Home Screen opens as a web app" secara default, dan manifest nggak lagi wajib ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
- Tampilkan banner petunjuk sekali saja untuk Safari iOS.

**Kenapa harus install ke Home Screen (khususnya iOS):**

- **Penghapusan 7 hari.** Aturan ITP yang menghapus storage setelah 7 hari tanpa interaksi nggak berlaku untuk web app Home Screen: "We do not expect the first-party in such a web application to have its website data deleted" ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
- **Persistent storage.** `navigator.storage.persist()` dikabulkan WebKit berdasarkan heuristik "like whether the website is opened as a Home Screen Web App" ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- **Kuota.** Kuota Home Screen web app sama dengan browser app, hingga 60% disk.
- Tetap saja D1 yang jadi sumber kebenaran. IndexedDB cuma cache yang bisa dibangun ulang.

### 5.5 Access + offline

- **Offline:** app shell dari cache dan data dari IndexedDB tetap jalan walau session Access sudah habis. Tulisan masuk antrean outbox.
- **Online tapi session habis:** request API kena redirect ke login. Deteksi seperti ini:

  ```js
  const res = await fetch(`/api/sync?since=${rev}`, { redirect: 'manual' });
  if (res.type === 'opaqueredirect' || res.status === 401) showLoginBanner();
  ```

- **Tombol "Login ulang" menavigasi ke `/api/login`.** Navigasi ke `/` nggak bisa dipakai, karena `/` dilayani SW dari cache dan nggak pernah sampai ke Access. Path `/api/*` dilewati SW, jadi Access mencegat, user login, lalu Worker me-redirect ke `/`.
- **Belum terverifikasi:** apakah Access menjawab fetch non-navigasi dengan 302 atau 401. Kode di atas menangani dua-duanya. **Tes di HP asli.**

### 5.6 Web Push untuk reminder: realistis?

**Platform:**

- **Android Chrome:** bisa.
- **iOS:**
  - Mulai iOS/iPadOS 16.4, dan hanya untuk web app yang sudah di-*add to Home Screen*.
  - Izin harus diminta dari interaksi user langsung, dan manifest dengan `display` standalone/fullscreen ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  - `PushManager` di Safari iOS sejak 16.4 ([browser-compat-data](https://github.com/mdn/browser-compat-data)).

**Free plan:**

- **Penjadwal:** Cron Trigger (5 per akun, CPU 10 ms per run; [limits](https://developers.cloudflare.com/workers/platform/limits/), [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)). Cron jalan dalam UTC.
- **Kirim push:**
  - Butuh tanda tangan VAPID ES256 ([RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)).
  - Payload harus dienkripsi ([RFC 8291](https://datatracker.ietf.org/doc/html/rfc8291): ECDH + HKDF + AES-GCM).
  - Semua algoritma itu ada di WebCrypto Workers ([docs](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)).
- **Trik malas:** kirim push **tanpa payload** (nggak perlu enkripsi). Di event `push`, SW fetch `/api/reminders` lalu `showNotification`. Kalau session Access habis, tampilkan teks generik.

**Kesimpulan:** bisa, tapi bukan MVP. Lebih murah:

1. **`.ics` "Tambah ke Kalender"** untuk tiap due date. Nol server, dan reminder ditangani kalender HP.
2. **Email digest harian** lewat Cron + `send_email` ke dua alamat terverifikasi. Gratis di semua plan ([Email Service](https://developers.cloudflare.com/email-service/)), tapi butuh Email Routing di zone. Saat ini `atqamz.com` belum punya record MX (dicek via DNS, lihat §8).

---

## 6. Frontend tanpa build step

### 6.1 Prinsip

- **ES modules native** plus satu **import map** untuk menamai library vendor. Import map didukung Chrome 89, Safari 16.4, dan Firefox 108 ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), [browser-compat-data](https://github.com/mdn/browser-compat-data)).
- **Library di-*vendor*** ke `public/vendor/` dengan versi dipin. Nggak ada CDN saat runtime, supaya offline aman dan nggak ada pihak ketiga yang melihat trafik.
- **Pemisahan layer:**

```
public/
  index.html            import map, <link rel="manifest" crossorigin="use-credentials">
  manifest.webmanifest
  sw.js
  app/
    main.js             boot, register SW, router
    router.js           hash router (#/budget, #/vendor/…)
    domain/             fungsi murni: total anggaran, sisa, countdown, progress tabungan, normalisasi nomor
    store/              db.js (IndexedDB), sync.js (outbox + pull), api.js (fetch + deteksi login)
    views/              satu file per layar + generic-list.js. HANYA layer ini yang diganti framework
    ui/                 helper kecil (escape HTML, format Rupiah via Intl.NumberFormat('id-ID'))
  vendor/               lib pihak ketiga (dipin)
src/worker.js           API
migrations/0001_init.sql
wrangler.jsonc
```

**Aturan yang bikin migrasi framework murah:**

1. `views/` nggak boleh `fetch` atau sentuh IndexedDB. View cuma memanggil `store` (misalnya `list(table)`, `save(table, row)`, `remove(table, id)`, `subscribe(fn)`) dan fungsi `domain`.
2. `domain/` murni (input → output, tanpa DOM), dites dengan `node --test` tanpa dependency.
3. Store mengirim event perubahan (`EventTarget`). Framework apa pun bisa subscribe: React lewat [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore), Vue lewat `ref`, Svelte lewat store.
4. Routing pakai hash: nol konfigurasi server, aman dengan SW, dan router framework umumnya punya mode hash. Navigation API baru ada di Safari 26.2 dan URLPattern di Safari 26 ([browser-compat-data](https://github.com/mdn/browser-compat-data)). Terlalu baru, lewati dulu.
5. Teks dari user selalu di-escape sebelum masuk `innerHTML`, atau pakai `textContent`.

### 6.2 Decision matrix (bahan diskusi dengan Partner B, sengaja **nggak** diputuskan di sini)

Ukuran = gzip `-9` dari file ESM yang dipublikasikan, diukur 2026-10-06. Versi dan tanggal rilis dari npm registry.

| Opsi | Tanpa build? | Ukuran | Kurva belajar | Jalur migrasi nanti | Cocok offline/PWA | Status maintenance |
|---|---|---|---|---|---|---|
| A. Vanilla + Web Components ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)) | ya | 0 KB | rendah untuk dasar, makin bertele-tele saat UI tumbuh | custom element bisa dipakai di framework mana pun; view ditulis ulang | ya | standar web |
| B. Lit 3 ([docs](https://lit.dev/docs/getting-started/)) | ya (tanpa decorator TS) | ±6,1 KB (`lit-core.min.js`) | sedang | tetap web components; mudah dibungkus framework lain | ya | aktif (3.3.3, Mei 2026) |
| C. Preact + htm (+hooks) ([no-build guide](https://preactjs.com/guide/v10/no-build-workflows/)) | ya | ±4,9 + 1,6 + 0,6 KB | sedang (gaya React) | ke React/Preact+JSX nyaris mekanis (tagged template `html` → JSX) | ya | aktif. **Preact 11.0.0 baru rilis 2026-09-30**; 10.x (10.29.8) masih tersedia. htm stabil tapi rilis terakhir 2022 |
| D. Alpine.js ([docs](https://alpinejs.dev/essentials/installation)) | ya | ±19,9 KB | rendah (atribut HTML) | ditulis ulang. Kurang rapi untuk SPA multi-layar | ya | aktif (3.17.4, Sep 2026) |
| E. Vue 3 browser build ([docs](https://vuejs.org/guide/quick-start.html)) | ya (template dikompilasi di browser) | ±62,9 KB (`vue.esm-browser.prod.js`) | sedang | natural ke Vue SFC + Vite | ya | aktif (3.5.43, Sep 2026) |
| F. HTMX ([docs](https://htmx.org/docs/)) | ya | ±16,8 KB (`htmx.min.js`) | rendah | – | **jelek**: tiap layar butuh HTML dari server, bertabrakan dengan offline-first | aktif |
| G. petite-vue ([repo](https://github.com/vuejs/petite-vue)) | ya | kecil | rendah | ke Vue | ya | **mandek**: rilis terakhir 0.4.1, Jan 2022 |

**Pertanyaan pemandu untuk diskusi:**

- Siapa yang bakal maintain setelah acara?
- Mau belajar sesuatu yang dipakai di kerjaan (React/Vue), atau mau yang paling sedikit abstraksi?
- Seberapa penting "nanti tinggal pindah ke Vite"?

Apa pun pilihannya, `store/`, `domain/`, Worker, dan skema D1 nggak berubah.

---

## 7. Sketsa data model (D1)

Konvensi:

- uang = `INTEGER` rupiah (jangan float);
- tanggal = `TEXT 'YYYY-MM-DD'`, jam = `TEXT 'HH:MM'`, bulan = `TEXT 'YYYY-MM'`;
- boolean = `INTEGER 0/1`;
- `id` = UUID dari client.

Setiap tabel data punya kolom sync yang sama dan index pada `rev`.

```sql
CREATE TABLE sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), rev INTEGER NOT NULL);
INSERT INTO sync_state (id, rev) VALUES (1, 0);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE vendors (
  id TEXT PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  pic TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'opsi' CHECK (status IN ('opsi', 'fix')),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE budget_items (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL CHECK (event IN ('lamaran', 'akad', 'resepsi')),
  name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  vendor_id TEXT REFERENCES vendors (id),
  note TEXT,
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  budget_item_id TEXT NOT NULL REFERENCES budget_items (id),
  label TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  due_date TEXT,
  paid_on TEXT,
  note TEXT,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE savings_entries (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  contributor TEXT NOT NULL CHECK (contributor IN ('pria', 'wanita')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  note TEXT,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE seserahan_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  price INTEGER CHECK (price >= 0),
  category TEXT,
  status TEXT NOT NULL DEFAULT 'belum' CHECK (status IN ('belum', 'proses', 'selesai')),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE admin_docs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount INTEGER CHECK (amount >= 0),
  detail TEXT,
  qty INTEGER,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  side TEXT NOT NULL CHECK (side IN ('pria', 'wanita')),
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  pax INTEGER NOT NULL DEFAULT 1 CHECK (pax >= 0),
  note TEXT,
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE rundown_items (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  pic TEXT,
  note TEXT,
  highlights TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE songs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  note TEXT,
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE INDEX settings_rev ON settings (rev);
CREATE INDEX tasks_rev ON tasks (rev);
CREATE INDEX vendors_rev ON vendors (rev);
CREATE INDEX budget_items_rev ON budget_items (rev);
CREATE INDEX payments_rev ON payments (rev);
CREATE INDEX payments_item ON payments (budget_item_id);
CREATE INDEX savings_entries_rev ON savings_entries (rev);
CREATE INDEX seserahan_items_rev ON seserahan_items (rev);
CREATE INDEX admin_docs_rev ON admin_docs (rev);
CREATE INDEX guests_rev ON guests (rev);
CREATE INDEX rundown_items_rev ON rundown_items (rev);
CREATE INDEX songs_rev ON songs (rev);
```

### Pemetaan sheet → tabel

| Sheet | Tabel | Catatan mapping |
|---|---|---|
| DASHBOARD + Timeline (label) | `settings` | `wedding_date`, `couple_label` |
| Timeline (header) | `settings` | `timeline_start` (opsional) |
| Timeline (tugas) | `tasks` | checkbox K → `done` |
| Anggaran (3 tabel) | `budget_items` + `payments` | `event` dari tabel asal. DP/Lunas, Termin 1, Termin 2 yang terisi → masing-masing satu baris `payments` dengan `paid_on` kosong (tanggal bayar asli nggak tercatat di sheet; isi manual atau tandai "sudah dibayar" tanpa tanggal). `Total Dibayar`/`Sisa` **nggak disimpan**, dihitung |
| Target Tabungan | `savings_entries` + `settings.savings_target` | tahun (dropdown) + bulan (dropdown) → `month`. Dua kolom `Masuk` → dua baris (`pria`/`wanita`) |
| List Seserahan | `seserahan_items` | Selesai → `selesai`, On Proses → `proses`, Belum Selesai → `belum` |
| List Administrasi | `admin_docs` | Selesai → `done = 1`, Belum → `0` |
| Kontak Vendor (kiri) | `vendors` | Action `FIX` → `status = 'fix'`. Tabel kanan **diabaikan** (turunan beku). Nomor HP dinormalisasi ke `+62…` |
| List Tamu (12 blok) | `guests` | blok kiri → `side='pria'`, kanan → `'wanita'`. Judul blok → `category`. Kolom jumlah → `pax` |
| Rundown (2 tabel) | `rundown_items` | `Waktu` "HH.MM - HH.MM" → `start_time`/`end_time` "HH:MM". Judul tabel → `event` |
| List Lagu | `songs` | – |
| Skenario Budget | – | nggak diimpor |

### Jalur import sekali jalan

Data pribadi **nggak boleh** masuk repo.

1. **Pilah dulu** mana data asli dan mana data contoh template.
2. **Baca ODS langsung** dengan script Python stdlib (`zipfile` + `xml.etree`) dari `content.xml`. Ambil atribut `office:value`, `office:date-value`, dan `office:boolean-value`, bukan teks tampilan, supaya tanggal dan angka nggak rusak oleh format lokal. Koordinat sel per sheet di-hardcode sesuai §1.
   - Alternatif: export semua sheet ke CSV dengan LibreOffice. Token ke-12 filter CSV `-1` mengekspor tiap sheet ke file sendiri ([LibreOffice help](https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html)). Tapi CSV kehilangan tipe data (tanggal, currency "Rp."), jadi kurang disarankan.
3. **Script menghasilkan `import.sql`** berisi `INSERT` dengan `rev = 1` dan `updated_by = 'import'`.
   - Script-nya boleh ada di repo (cuma koordinat dan struktur, tanpa data).
   - Input dan outputnya disimpan **di luar repo** (mis. `~/wp-private/`) atau di folder yang di-`.gitignore`.
4. **Hapus `BEGIN TRANSACTION`/`COMMIT`** kalau ada ([D1 import](https://developers.cloudflare.com/d1/best-practices/import-export-data/)).
5. **Jalankan import:**
   ```
   npx wrangler d1 migrations apply wp --remote
   npx wrangler d1 execute wp --remote --file=../wp-private/import.sql
   ```
   Batas file import 5 GiB, jauh di atas kebutuhan.
6. **Cocokkan** jumlah baris dan total (anggaran, seserahan, tabungan) dengan spreadsheet secara lokal. Jangan tempel angkanya di issue atau PR.
7. **Hapus `import.sql`.** Spreadsheet di-arsip, bukan dihapus.

---

## 8. Domain dan deployment

### Yang sudah dicek (2026-10-06, query DNS publik via DoH `cloudflare-dns.com`, read-only)

- NS `atqamz.com` = `chloe.ns.cloudflare.com`, `ray.ns.cloudflare.com`. Artinya zone memakai nameserver Cloudflare (full setup).
- Apex `atqamz.com` resolve ke IP Cloudflare, jadi sudah proxied.
- `wp.atqamz.com` belum ada (NXDOMAIN), jadi bebas dipakai.
- Belum ada record MX. Ini cuma relevan kalau nanti pakai Email Routing (opsi magic link atau email digest).
- Repo `atqamz/wp` publik dan masih kosong (cek via `gh repo view`).

### Yang belum terverifikasi dan harus benar

- Zone `atqamz.com` ada di **akun Cloudflare yang sama** dengan Worker, dan statusnya aktif. Custom Domain mensyaratkan "An active Cloudflare zone" ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
- Hostname `wp` belum punya record CNAME. Custom Domain nggak bisa dibuat di hostname yang sudah punya CNAME.
- Ada atau nggaknya Worker lain di akun yang ikut memakai kuota 100,000/day dan 5 cron.

### Cara `wp.atqamz.com` disajikan

Pakai Worker **Custom Domain**. Cloudflare membuat record DNS dan sertifikat sendiri, dan semua path diarahkan ke Worker ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)). Sketsa `wrangler.jsonc` ([referensi config](https://developers.cloudflare.com/workers/wrangler/configuration/)):

```jsonc
{
  "name": "wp",
  "main": "src/worker.js",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "wp.atqamz.com", "custom_domain": true }],
  "assets": { "directory": "./public" },
  "d1_databases": [{ "binding": "DB", "database_name": "wp", "database_id": "<hasil wrangler d1 create>" }]
}
```

Catatan:

- Dengan hash routing, mode `not_found_handling: "single-page-application"` nggak perlu.
- Kalau nanti pindah ke path routing, aktifkan mode SPA dan tambahkan `run_worker_first: ["/api/*"]`. Alasannya: di mode SPA, navigasi browser ke path API justru dilayani HTML ([docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)), dan `/api/login` butuh sampai ke Worker.

### Alur deploy

| | Workers Builds (Git integration) | GitHub Actions + `wrangler-action` |
|---|---|---|
| Setup | sambungkan repo GitHub di dashboard. Push ke branch produksi → deploy. Branch lain → preview ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/)) | workflow YAML + API token Cloudflare disimpan di GitHub secrets ([repo](https://github.com/cloudflare/wrangler-action)) |
| Free | 3,000 build minutes/bulan, 1 build bersamaan ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)) | kuota GitHub Actions repo publik |
| Rahasia di GitHub | nggak ada | ada (API token) |

**Saran: Workers Builds.**

- Deploy command: `npx wrangler d1 migrations apply wp --remote && npx wrangler deploy` ([migrations](https://developers.cloudflare.com/d1/reference/migrations/)).
- **Preview build:** "Preview URLs are public by default", dan D1 cuma terisolasi "when you bind the Preview to a separate resource" ([Previews](https://developers.cloudflare.com/workers/previews/)). Artinya, tanpa setting tambahan, preview dari branch bisa membaca DB asli lewat URL publik. Pilih salah satu: matikan preview (`preview_urls: false`), lindungi dengan Access level Worker, atau bind preview ke D1 terpisah. Apakah opsi isolasi ini tersedia di free plan **belum terverifikasi**.
- **`.gitignore` awal** (repo publik): `.wrangler/`, `node_modules/`, `.dev.vars`, `*.ods`, `*.xlsx`, `*.csv`, `import*.sql`, `wp-private/`.
- **Dev lokal:** `wrangler dev` dengan D1 lokal yang di-seed **data palsu** saja.

---

## 9. Risiko dan pertanyaan terbuka (urut dari paling penting)

1. **Sisa waktu sampai hari-H.** Kalau tinggal hitungan minggu, MVP harus dipangkas lagi ke tiga hal: anggaran + pembayaran, rundown offline, dan vendor dengan tombol telepon/WA. Sisanya tetap di spreadsheet.
2. **Kebocoran data pribadi lewat repo publik.** Jalurnya bisa lewat file import, seed, fixture tes, screenshot di PR, atau preview URL terbuka. Mitigasi: `.gitignore` sejak commit pertama, data palsu untuk dev, preview dimatikan atau dilindungi, dan `workers_dev: false`.
3. **Friksi Access + PWA.**
   - Redirect saat session habis.
   - Manifest butuh `crossorigin="use-credentials"`.
   - Cookie jar terpisah di PWA iOS.
   - `ctx.access` nggak tersedia bersama static assets.

   Tes di dua HP asli di hari pertama. Kalau menyebalkan, pindah ke Plan B (device-key cookie).
4. **Data ketimpa karena konflik.** Mitigasi: patch per field, `updated_by` ditampilkan, tombstone, dan D1 Time Travel 7 hari. Tambah export CSV berkala.
5. **Keunikan iOS.**
   - App harus di-install ke Home Screen supaya storage aman dan push mungkin.
   - Nggak ada Background Sync, jadi outbox cuma terkirim saat app dibuka.
6. **Kuota akun dipakai bareng** dengan Worker lain, atau bug polling. Mitigasi: jangan polling, dan cek dashboard usage setelah seminggu.
7. **Onboarding Zero Trust minta detail pembayaran** (nggak ditagih di Free). Perlu persetujuan kamu.
8. **Kualitas data dari template:**
   - data contoh bercampur data asli;
   - nomor HP tersimpan sebagai angka;
   - formula `FILTER` beku;
   - baris "Subtotal Kategori" yang salah hitung.

   Import harus memvalidasi, bukan menyalin mentah.
9. **Debat framework berlarut.** Mitigasi: layer `store/` + `domain/` dibangun dulu, view vanilla. Keputusan framework bisa menyusul tanpa membuang kerja.
10. **Setelah acara.** Siapa yang maintain, dan apakah data mau diarsip (export) lalu Worker dimatikan?

**Pertanyaan terbuka untuk kalian:**

- Berapa lama lagi sampai hari-H?
- Data mana di spreadsheet yang asli?
- Partner B pakai Android atau iPhone? Ini menentukan prioritas install dan push.
- Oke isi detail pembayaran untuk Zero Trust Free? Kalau nggak, pakai device-key.
- Butuh RSVP publik? Atau undangan digital pakai layanan lain saja?
- Dua-duanya akses penuh ke semua data? (Asumsi: ya.)
- Skenario Budget mau dipertahankan sebagai referensi?

---

## 10. Rekomendasi

**Next step konkret (satu malam):**

1. **Putuskan dulu:** auth (Access OTP atau device-key) dan sisa waktu sampai hari-H. Framework *belum* perlu diputuskan.
2. **Spike end-to-end di `wp.atqamz.com`** dengan **satu** tabel saja (`budget_items` + `payments`):
   - Worker + static assets + D1 + Access level Worker;
   - outbox IndexedDB, `GET/POST /api/sync`, SW app shell;
   - view vanilla.
3. **Tes di dua HP asli** (Android dan iOS):
   - install ke Home Screen;
   - login OTP di dalam PWA;
   - edit offline di kedua HP lalu online bersamaan (konflik);
   - session habis → tombol login ulang.
4. **Kalau lolos:** tambah generic list screen untuk 7 sheet lainnya, lalu rundown hari-H, lalu jalankan import sekali (§7). Spreadsheet resmi pensiun.
5. **Setelah MVP jalan:** diskusi framework dengan Partner B pakai matriks §6.2. Migrasinya cuma mengganti `views/`.
