# Riset fitur: wedding dan household hub (wp)

Bahan diskusi, bukan keputusan final. Riset per 2026-10-06. Pelengkap `docs/brainstorm.md` (branch `hand/f00cf2fa15f0e/t1-a2`), yang membahas spreadsheet, arsitektur Cloudflare, auth, dan sync. Dokumen ini membahas **fitur**: apa yang layak dibuat, apa yang sebaiknya diserahkan ke app lain, dan data apa yang dibutuhkan.

> **Privasi.** Repo ini publik. Dokumen ini tidak memuat nama, nomor HP, alamat, nominal, tanggal, atau detail dokumen asli siapa pun. Pasangan ditulis sebagai **Partner A** dan **Partner B**. Contoh angka memakai placeholder (`Rp X`). Angka yang muncul adalah fakta publik tentang produk, regulasi, atau survei, lengkap dengan sumbernya.

## Cara baca

- **Effort:** `S` = sekitar satu hari kerja (satu konfigurasi list dan satu layar, tanpa komponen platform baru). `M` = dua sampai empat hari. `L` = lebih dari seminggu, atau butuh komponen platform baru.
- **Platform need** (hanya catatan agar cocok dengan keputusan stack worker lain, tidak ada rekomendasi stack di sini): `client` = jalan di browser tanpa server; `D1` = database relasional; `R2` = penyimpanan file; `cron` = tugas terjadwal; `push` = notifikasi native; `email` = kirim email; `realtime` = sinkron langsung antar HP; `static` = cukup file statis.
- **Bukti:** link inline. `[UNVERIFIED]` = tidak bisa dikonfirmasi dari sumber yang berhasil dibuka (cuma snippet pencarian, sumber sekunder yang meragukan, atau halaman gagal dimuat). `(dites lokal)` = percobaan penulis di Node v26.10.0 / ICU 78.3, bukan kutipan.
- **Skor di §7** adalah penilaian penulis, bukan data. Rumusnya ditulis di sana supaya bisa dibantah.

**Metode dan batas.**
- Halaman dibaca lewat tool fetch yang meringkas isi, jadi kutipan dan angka yang jadi tumpuan dokumen ini dicek ulang langsung di sumbernya. PMA 30/2024 dibaca dari teks lengkapnya.
- Kuota WebSearch habis di tengah riset. Akibatnya beberapa area tipis dan ditandai di bagian Gap (terutama: kebiasaan pasangan Indonesia memakai spreadsheet/Notion/WhatsApp, kriteria MABIMS terbaru, dan nomor SKB libur 2026).
- Ulasan di Trustpilot dan toko aplikasi condong ke masalah registry, pengiriman, dan vendor, bukan alat planning. Artikel perbandingan banyak yang ditulis kompetitor. Keduanya diberi label.
- Wikipedia dan blog dipakai hanya bila tidak ada sumber primer, dan diberi label sekunder.

## Ringkasan

1. **Pasar.** Planner asing (The Knot, Zola, Joy, Bridebook) gratis untuk pasangan karena uangnya dari vendor atau registry. Produk Indonesia yang ketemu adalah marketplace vendor (Bridestory, Weddingku) dan platform undangan digital. Alat planning berbayar dan terselip (Wevitation). Di riset ini **tidak ketemu** produk yang memodelkan proses KUA, buku vendor + jadwal bayar, dan buku amplop dalam satu app privat. Itu bukan bukti produknya tidak ada.
2. **Pelajaran paling kuat dari riset perilaku:** capture harus cepat, dua orang setara, item default belum di-assign, nudge jarang dan spesifik, tidak ada skor atau streak, dan data bisa dibawa pergi (export).
3. **Core yang disarankan:** satu model `items` generik + layar "Minggu ini" + tugas dari template, anggaran dengan jadwal bayar, buku vendor, dan daftar tamu. Export JSON/CSV dari hari pertama.
4. **Household (setelah nikah):** layak dibuat kecil: tagihan dan perpanjangan berulang (pajak kendaraan, STNK, BPJS, asuransi), target tabungan, buku amplop dan momen keluarga. Lebih baik diserahkan ke app lain: daftar belanja, kalender bersama, brankas scan dokumen, kalkulator KPR, itinerary perjalanan.
5. **Reminder:** layar "Minggu ini" dan tombol "Tambah ke kalender" (`.ics`) dulu. Push belum perlu.
6. **Dokumen sensitif:** jangan simpan scan KTP/KK atau nomor NIK di app. Simpan status siap, tanggal, dan lokasi dokumen.
7. **Uang:** simpan rupiah utuh sebagai integer plus kode mata uang. Ini sengaja menyimpang dari ISO 4217 (§5.7, §6).

---

## 1. Prinsip produk

### 1.1 Siapa, di perangkat apa, di momen apa

**Pengguna:** dua orang dewasa yang setara (Partner A dan Partner B), satu HP masing-masing, akses hanya lewat dua akun Google. Pembaca tambahan (orang tua, WO) baru dipertimbangkan nanti sebagai link baca-saja (W19).

**Perangkat:**
- Android sekitar 79% dan iOS sekitar 21% dari traffic web mobile Indonesia pada September 2026 ([StatCounter](https://gs.statcounter.com/os-market-share/mobile/indonesia): Android 79.16%, iOS 20.79%). Itu hitungan traffic web, bukan kepemilikan HP. App harus nyaman di Android Chrome dan di iOS Safari sebagai PWA terpasang.
- Halaman StatCounter untuk rasio desktop vs mobile di Indonesia menunjukkan desktop 55.83% ([sumber](https://gs.statcounter.com/platform-market-share/desktop-mobile-tablet/indonesia)), yang bertentangan dengan gambaran mobile-first dan tidak bisa direkonsiliasi. Angka itu diabaikan. Keputusan mobile-first diambil dari kebiasaan kalian berdua.
- Konektivitas: 230 juta pengguna internet, penetrasi 80.5% ([DataReportal Digital 2026: Indonesia](https://datareportal.com/reports/digital-2026-indonesia), data Oktober 2025).

**WhatsApp** hampir pasti kanal berbagi utama, tapi tidak ada angka Indonesia yang bersih. DataReportal tidak menerbitkan angka WhatsApp untuk Indonesia, dan Reuters Institute hanya mengukur pemakaian untuk berita: naik 13 poin persentase ke 56% ([DNR 2026 Indonesia](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/indonesia)). Angka 93% (MEF) dan 65% (Statista) cuma snippet pencarian: `[UNVERIFIED]`. Dokumen ini tidak mengutip persentase WhatsApp.

**Momen pemakaian** (turunan dari penelitian di §1.2 dan pola vendor Indonesia di §2):

| Momen | Perangkat | Yang dibutuhkan dalam hitungan detik | Fitur terkait |
|---|---|---|---|
| Di sofa, sesi mingguan berdua | HP, kadang laptop | Lihat "Minggu ini", putuskan yang menggantung, perbarui anggaran | W3, W2, W13 |
| Meeting dengan vendor | HP, sinyal belum tentu bagus | Buka catatan vendor, catat harga penawaran dan DP, telepon atau WhatsApp | W11, W12, W13 |
| Belanja seserahan atau perlengkapan | HP | Tambah item, harga, link; lihat total | W9 |
| Hari-H | HP milik koordinator, bukan pengantin | Run sheet yang terbuka tanpa sinyal, kontak vendor | W20, W21 |
| Rutinitas rumah | HP | "Ingat, pajak motor bulan depan", tandai sudah bayar | H3, H4 |

Soal hari-H: dalam studi [Massimi dkk. (CSCW 2014)](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/03/Real-but-Glossy.pdf), 15 pasangan yang direkrut terutama di Inggris tenggara, banyak pengantin perempuan meninggalkan HP karena semua orang yang perlu dihubungi ada di tempat. Jadi "mode hari-H" ditujukan ke orang yang mengoordinasi, bukan ke pengantin. Sampelnya kecil dan tidak mencakup pernikahan keluarga besar ala Indonesia.

### 1.2 Kenapa app bersama dipakai atau ditinggalkan: bukti

| # | Temuan | Sumber | Artinya untuk wp |
|---|---|---|---|
| 1 | Rumah tangga mengoordinasi tugas lewat lokasi dan ketersediaan, dan melupakan tugas prioritas rendah. Satu orang biasanya jadi "koordinator". 8 rumah tangga, 241 tugas | [Sohn dkk., CSCW 2012](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/38230.pdf) | Momen terbaik adalah "saya sedang di luar" atau "baru ingat". Tambah item harus satu langkah, tanpa field wajib |
| 2 | 70.5% dari 44 keluarga memakai lebih dari satu kalender; 80% punya kalender "awareness" di tempat lewat (kulkas). Kalender online untuk pemakaian pribadi bisa merusak rutinitas koordinasi keluarga | [Neustaedter dkk., ToCHI 2009](https://grouplab.cpsc.ucalgary.ca/grouplab/uploads/Publications/Publications/2009-CalendarCrucial.TOCHI.pdf) | Lawan sebenarnya adalah WhatsApp, catatan di kulkas, Google Calendar. App kedua kalah kecuali ada di tempat yang kalian lewati. Jangan jadi sumber kebenaran untuk semuanya |
| 3 | Pasangan merencanakan nikah dengan spreadsheet, dokumen, to-do, email, dan ingin melibatkan orang di luar pasangan (orang tua, saudara) | [Massimi dkk., CSCW 2014](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/03/Real-but-Glossy.pdf) | Pesaing nyata adalah spreadsheet. Beri export dan link baca-saja, jangan akun ketiga |
| 4 | Pelacak pribadi berhenti karena lupa, repot merawat, melewatkan, atau menangguhkan. Dalam 3 bulan, 26% pengguna alat keuangan berhenti, vs 44-45% untuk alat aktivitas dan lokasi | [Epstein dkk., UbiComp 2015](https://my.eng.utah.edu/~cs5540/au16/readings/PersonalInformatics-Epstein2015.pdf) | Catat uang tahan lama kalau manfaatnya jelas, tapi mati kalau input merepotkan. Model data harus kecil |
| 5 | Reminder mendukung pengulangan tapi menghambat terbentuknya kebiasaan; cue berbasis kejadian membantu | [Stawarz dkk., CHI 2015](https://research-information.bris.ac.uk/en/publications/beyond-self-tracking-and-reminders-designing-smartphone-apps-that/) | Kaitkan pemakaian ke kejadian yang sudah ada: sesi mingguan, selesai telepon vendor. Tanpa streak dan badge |
| 6 | Beban kognitif rumah tangga: mengantisipasi dan memantau cenderung tersangkut di satu pasangan; memutuskan lebih sering bersama | [Daminger, ASR 2019](https://inequality.hks.harvard.edu/publications/cognitive-dimension-household-labor) (temuan dari ringkasan hasil pencarian karena halaman 403: `[UNVERIFIED]` terhadap teks utama) | Checkbox hanya mendukung "melakukan". Yang mahal adalah mengingat apa saja yang harus dilakukan. Template dan layar "Minggu ini" menjawabnya |
| 7 | Pasangan berbagi data tapi mengharapkan privasi; ambiguitas membuat berbagi terasa wajar | [Griggio dkk., CHI 2019](https://www.cs.ubc.ca/labs/edapt/papers/griggio2019_2.pdf) | Tampilkan keadaan item ("dibayar Rabu"), bukan perilaku orang ("terakhir buka app 3 hari lalu") |
| 8 | Aplikasi pengatur tugas rumah dipasang saat kewalahan, dan gagal kalau dianggap solusi tunggal; notifikasi soal ketimpangan memancing defensif | [Petriglieri, MIT SMR 2019](https://sloanreview.mit.edu/article/hacking-inequality-at-home) dan [MIT Technology Review 2022](https://www.technologyreview.com/2022/05/10/1051954/chore-apps/) (tulisan praktisi dan jurnalistik, bukan studi terkontrol) | Pemicu adopsi (pernikahan) sudah ada. Risikonya satu pasangan merasa "dikelola". Jangan assign dengan notifikasi |
| 9 | Notifikasi berulang untuk hal yang sama membuat orang mematikan semua notifikasi | [Apple HIG: Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications) | Maksimal satu nudge spesifik yang jarang |
| 10 | Tutorial onboarding tidak memperbaiki performa tugas; pengguna jarang mengubah default | [NN/g onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/), [NN/g defaults](https://www.nngroup.com/articles/the-power-of-defaults/) | Tanpa tour dan wizard. Buka pertama sudah berisi template yang bisa dihapus |
| 11 | Pembentukan kebiasaan butuh 18 sampai 254 hari, sangat bervariasi | [Lally dkk., 2010](https://api.crossref.org/works/10.1002/ejsp.674) | Antusiasme minggu ketiga sampai kedelapan akan turun. App harus berguna tanpa kebiasaan harian |

Yang **tidak** ditemukan (jangan dianggap fakta): studi yang membandingkan "assign vs claim" di app pasangan; studi soal feed "siapa mengubah apa"; studi pasangan Indonesia soal teknologi pernikahan. Prinsip di §1.3 yang bersandar pada hal itu adalah inferensi, dan ditandai begitu. Statistik populer "25% app dipakai sekali" tidak punya sumber primer yang ketemu: `[UNVERIFIED]`.

### 1.3 Prinsip

1. **Capture adalah produknya.** Satu input di layar pertama, satu ketukan untuk simpan, tanpa field wajib. (Bukti 1, 4)
2. **Dua orang setara.** Keduanya bisa menambah, mengubah, menyelesaikan. Tidak ada admin. (Bukti 6; [Frampton dkk., CHI 2026](https://orca.cardiff.ac.uk/id/eprint/185455): kebanyakan alat manajemen keluarga berorientasi satu pengguna, `[UNVERIFIED]` karena hanya dari ringkasan pencarian)
3. **Item default belum di-assign.** Siapa pun bisa "ambil" dengan satu ketukan. Tidak ada notifikasi assign. Inferensi dari bukti 6 dan 8. Studi Carlson 2025 yang menyebut berbagi per-tugas terasa lebih adil adalah `[UNVERIFIED]` (belum terbit, dilaporkan media kesehatan) dan tidak dijadikan dasar.
4. **Tampilkan keadaan, bukan perilaku.** "Dibayar oleh Partner B, Selasa" boleh. "Partner B belum membuka ini" tidak. (Bukti 7)
5. **Nudge jarang, spesifik, dan terikat kejadian.** Prioritas: layar "Minggu ini", lalu tombol "Tambah ke kalender", lalu satu digest mingguan. Berbagi ke WhatsApp dipicu pengguna, bukan dikirim otomatis. (Bukti 5, 9)
6. **Tanpa onboarding.** Template tugas sudah terisi dan bisa dihapus. (Bukti 10)
7. **Miliki sedikit hal, interop untuk sisanya.** Kalender, daftar belanja, brankas: serahkan, sambungkan lewat `.ics`, link, CSV. (Bukti 2, 3)
8. **Undo di mana-mana.** Soft delete dan layar "baru dihapus", karena dua orang menyunting data yang sama. ([NN/g 10 heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/): pengguna sering melakukan aksi karena salah dan butuh jalan keluar yang jelas; [Apple HIG undo](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/undo-and-redo.json))
9. **Data bisa dibawa pergi.** Export JSON dan CSV dari hari pertama. Terlalu banyak app pasangan dan rumah tangga mati atau berubah pemilik (§5.4).
10. **Indonesia-first.** Rupiah utuh, tanggal `6 Okt 2026`, Hijri sebagai tampilan perkiraan, WhatsApp untuk berbagi, bahasa UI Indonesia santai.

### 1.4 Uji pemakaian mingguan

Setiap fitur yang direkomendasikan harus lolos satu dari tiga:

- **Mingguan:** ada alasan nyata disentuh tiap minggu (mis. anggaran, "Minggu ini", tagihan).
- **Padat-sementara:** disentuh hampir tiap minggu dalam jendela 4 sampai 8 minggu yang jelas (mis. proses KUA, rundown menjelang hari-H).
- **Tebus-nilai tinggi:** jarang dipakai, tapi kalau butuh tidak ada penggantinya (mis. buku amplop saat diundang kondangan).

Fitur yang tidak lolos masuk daftar "tidak dibuat" (§8). Tabel di §3 dan §4 mencantumkan pemicunya di kolom Nilai.

---

## 2. Lanskap

### 2.1 Planner pernikahan internasional

Semua produk besar gratis untuk pasangan. Uangnya dari vendor (iklan, lead) dan registry/stationery, jadi pasangan adalah produknya.

| Produk | Apa | Model uang | Kolaborasi dan ekspor | Sumber |
|---|---|---|---|---|
| The Knot | Marketplace AS dengan alat gratis: checklist, budget, guest list/RSVP, vendor, website, registry | Vendor dan registry; kelompok Knot dimiliki Permira dan Spectrum Equity | Ekspor CSV ada tapi "perlu dibersihkan" (sumber kompetitor); tidak ada API publik yang ketemu | [App Store](https://apps.apple.com/app/id457941553), [Wikipedia: The Knot Worldwide](https://en.wikipedia.org/wiki/The_Knot_Worldwide), [Paperlust](https://paperlust.co/blog/wedding-website-builders-compared/) (penjual stationery, bias) |
| WeddingWire | Direktori vendor AS + alat gratis | Vendor bayar listing; milik Knot Worldwide | Tidak ada API publik; menurut audit pihak ketiga semua "API" WeddingWire adalah scraper tidak resmi | [weddingwire.com](https://www.weddingwire.com/), [Supergood](https://supergood.ai/api-report-card/weddingwire) |
| Hitched | Planner UK dengan marketplace supplier | Dibeli Knot Worldwide dari Immediate Media pada 3 Feb 2020 | Tidak ditemukan | [Siaran pers Knot Worldwide](https://www.theknotww.com/press-releases/theknotworldwide-hitched-acquisition) |
| Zola | Registry-first, plus website, guest list, budget, checklist | Registry commerce, stationery. Planning inti gratis | Satu pasangan per akun: pasangan hanya "akses untuk melihat"; hanya pemegang akun yang bisa memindahkan cash fund. Impor spreadsheet ada | [Zola FAQ](https://www.zola.com/faq/115002422171), [Zola planning](https://www.zola.com/wedding-planning), [Zola import](https://www.zola.com/faq/360038289992-How-do-I-add-guests-from-a-spreadsheet-to-my-guest-list-) |
| Joy | Website-first, gratis | "We make money when guests purchase items couples add to their registry that Joy sells" | Gratis termasuk "multiple editor accounts". Impor dan ekspor CSV guest list terdokumentasi | [Joy pricing](https://withjoy.com/pricing/), [Joy export](https://withjoy.com/help/en/articles/8309207-importing-and-exporting-your-guest-list) |
| Bridebook | App UK: checklist, budget, guest list, cari venue | "every couple can use Bridebook completely free"; supplier membayar paket | Undang pasangan lewat link | [Bridebook help](https://support.bridebook.com/en/support/how-much-does-bridebook-cost), [partner invite](https://support.bridebook.com/en/support/invite-your-partner-to-join-your-wedding-planning) |
| Aisle Planner | Software untuk profesional event (klien, proposal, invoice), bukan untuk pasangan | Langganan mulai $49.99/bln | n/a | [aisleplanner.com/pricing](https://www.aisleplanner.com/pricing) |
| Appy Couple | Website dan app native + RSVP + foto tamu | Harga tidak tertulis | n/a | [appycouple.com](https://appycouple.com/) |

Catatan struktur:
- Dari semua produk couple-facing, hanya Joy yang terverifikasi punya ekspor CSV penuh untuk guest list. Tidak ada yang menampakkan API publik untuk pasangan. Ekspor budget hampir tidak terdokumentasi (hanya forum WeddingWire 2019 yang menyebut tombol "Download": [thread](https://www.weddingwire.com/wedding-forums/printing-my-invite-list-and-budget/b685bfcf5c413105.html), mungkin usang).
- Kontroversi vendor: seorang senator AS menuduh The Knot menagih vendor untuk lead palsu, The Knot membantah dan bilang sedang "reducing spam and ghosting" ([AOL, 29 Okt 2025](https://www.aol.com/articles/republican-senator-wants-investigation-popular-145815916.html), [siaran lanjutan 13 Mei 2026](https://capitolreleases.com/releases/899033c7-10e9-4436-9139-0ff5bf1b6782)). Ini tuduhan, bukan putusan.
- Satu-satunya klaim "offline" yang ketemu, dari WeddingHappy ("No network connection required for almost everything"), `[UNVERIFIED]` (halaman toko gagal dimuat).

### 2.2 Template spreadsheet, Notion, Trello, Airtable

| Template | Isi | Sumber |
|---|---|---|
| Notion "Big Day, Big Plans" (10 template) | Guest list, seating, budget, timeline hari-H, vendor, RSVP | [Notion](https://www.notion.com/en-gb/templates/collections/big-day-big-plans) |
| Trello, 5 board resmi | To-do per lead time, timeline hari-H, wedding party, seating, thank-you | [Atlassian](https://www.atlassian.com/blog/trello/guide-to-planning-a-wedding-with-trello) |
| Airtable "Wedding planning" | 5 tabel: tamu, seating, vendor, perlengkapan/biaya, venue; kalender dan timeline | [Airtable](https://www.airtable.com/templates/wedding-planning/expxNBai7rjuqdJ06) |
| Notion berbayar (Contra, $27) | 19 section termasuk payment tracker, checklist 12 bulan | [Contra](https://contra.com/products/uZSPwsLK-notion-wedding-planner-template-or-budget-timeline-and-checklist) |
| Notion berbayar (notioneverything, $20) | Budget, tamu, vendor, countdown, checklist malam sebelum | [notioneverything](https://www.notioneverything.com/templates/wedding-planner-template) |
| Google Sheets/Excel gratis, 10 tab | Budget, tamu, vendor, checklist, jadwal hari-H, stationery | [weddingplanningspreadsheet.com](https://weddingplanningspreadsheet.com/) |

**Pola yang sama di semua template:** budget, guest list/RSVP, vendor, checklist per lead time, timeline hari-H, seating, pembayaran. Tambahan yang sering muncul: playlist, tracker undangan, tracker ucapan terima kasih, malam sebelum.

**Pengalaman satu orang yang merencanakan nikah dengan spreadsheet:** app "fine" tapi ditinggalkan dalam seminggu; spreadsheet cocok untuk "a lot of moving parts, a fixed deadline, and real money on the line" ([Spreadsheet Point](https://spreadsheetpoint.com/i-planned-my-entire-wedding-with-spreadsheets/), penulis mungkin menjual konten spreadsheet). Satu orang, bukan data.

### 2.3 Produk Indonesia

| Produk | Apa | Melayani | Model uang | Sumber |
|---|---|---|---|---|
| Bridestory | Marketplace vendor + app; Bridestory Pay (cicilan); sejak Sept 2025 "SayYes RSVP" (RSVP, check-in QR) | Pasangan dan vendor | Vendor langganan Silver/Gold; dibeli Tokopedia 2019 | [App Store](https://apps.apple.com/id/app/bridestory-wedding-app-hilda/id1067262519), [versi 3.17.3](https://apps.apple.com/id/app/bridestory/id1067262519), [KrASIA](https://amp.kr-asia.com/bridestory-and-life-after-tokopedias-acquisition-startup-stories), [paket vendor](https://business.bridestory.com/id/blog/mengenal-vendor-subscription-plan-di-bridestory) |
| Weddingku | Direktori vendor + konten, sejak 2002 | Pasangan (browse) dan vendor | Vendor bayar paket Gold Rp13.320.000/tahun, Diamond Rp27.750.000/tahun; iklan | [weddingku.com](https://www.weddingku.com), [partner.weddingku.com](https://partner.weddingku.com). Alat checklist/budget tidak ketemu di halaman yang dibuka |
| Wevitation | Undangan digital + modul "Event Planner" (Budget Planner, To-Do, Vendor, Timeline), QR tamu, kado digital | Pasangan dan tamu | Gratis (terbatas); Premium Rp69K dan Business Rp99K sekali bayar. Modul planner hanya di paket berbayar | [wevitation.com](https://wevitation.com) |
| invi.id | Undangan, amplop digital, buku tamu, ekspor PDF/Excel pesan tamu | Pasangan, reseller | Rp99K dan Rp149K per tahun | [invi.id](https://invi.id) |
| SebarUndangan, Menica, Ze Guest Management, Pentamoo, Digitation | Undangan + RSVP WhatsApp + QR check-in + buku tamu digital | Pasangan dan penyelenggara | Variatif; Ze mulai Rp300.000 | [SebarUndangan](https://sebarundangan.id), [Menica](https://menica.pro), [Ze](https://zeinvitation.com), [Pentamoo](https://pentamoo.id), [Digitation](https://one.digitation.id/) |

Temuan:
- Pencarian App Store Indonesia untuk "wedding planner indonesia" tidak menampilkan developer Indonesia di 9 hasil teratas ([query](https://itunes.apple.com/search?term=wedding%20planner%20indonesia&country=id&entity=software&limit=15), satu query saja). Artikel media Indonesia merekomendasikan app asing: [Kumparan, 17 Apr 2026](https://kumparan.com/how-to-tekno/5-aplikasi-wedding-planner-untuk-memudahkan-persiapan-acara-27E12z0bbmC), [Beautynesia 2021](https://www.beautynesia.id/life/8-aplikasi-populer-yang-wajib-didownload-untuk-bantu-persiapan-pernikahan/b-211274).
- Fitur undangan digital, RSVP WhatsApp, QR check-in, dan amplop digital sudah ramai dilayani platform khusus. Membuatnya sendiri tidak punya alasan kuat (lihat §8).
- Tidak ketemu alat yang mencatat **amplop masuk dan keluar sebagai buku balas-membalas**, padahal praktiknya nyata (§3, W25).
- Tidak ketemu sumber Indonesia tentang pemakaian Google Sheets, Notion, atau grup WhatsApp untuk planning (lihat Gap).

### 2.4 Apa yang disukai dan dikeluhkan pengguna

Peringatan: ulasan condong ke registry, pengiriman, dan vendor. Pasangan yang membahas alat planning murni jarang.

| Produk | Suka/Keluh | Tema | Sumber | Isi |
|---|---|---|---|---|
| Joy | Suka | Tanpa upsell, sederhana | [Trustpilot Joy](https://www.trustpilot.com/review/withjoy.com) | "The website is quite robust, and doesn't push a million products on you" (Sep 2026) |
| Joy | Suka | Guest list dan RSVP bisa diatur | [Trustpilot Joy](https://www.trustpilot.com/review/withjoy.com) | "I love the guest list management and RSVP form customization" (Agu 2026) |
| The Knot | Suka | Semua di satu tempat | [App Store](https://apps.apple.com/app/id457941553) | Pengulas menyebutnya "an all-in-one planning tool" |
| The Knot | Keluh | Data tamu hilang | [Trustpilot Knot](https://www.trustpilot.com/review/theknot.com?stars=1) | "Lost all menu choice guest data right before the wedding" (Agu 2026) |
| The Knot / WeddingWire | Keluh | Spam lead (sisi vendor) | [AOL](https://www.aol.com/articles/republican-senator-wants-investigation-popular-145815916.html), [Trustpilot WeddingWire](https://www.trustpilot.com/review/weddingwire.com) | Vendor mengaku lead palsu dari bot |
| WeddingWire | Keluh | Pasangan diblokir karena kirim ke banyak vendor | [forum](https://www.weddingwire.com/wedding-forums/ww-spam-blocked-me/bbdd14f7e14540be.html) | Utas 2019; usang |
| Zola | Keluh | Grup tamu kaku | [App Store](https://apps.apple.com/us/app/zola-wedding-planner/id852691916) | Pasangan selalu diundang bersama (parafrase) |
| Joy | Keluh | Anggaran/checklist tipis | [App Store](https://apps.apple.com/us/app/joy-wedding-app-website/id994411720) | Satu tema ulasan negatif (bertentangan dengan materi Joy, `[UNVERIFIED]` kedalamannya) |
| Bridestory (iOS) | Suka | Inspirasi, jangkauan vendor | [feed ulasan Apple](https://itunes.apple.com/id/rss/customerreviews/id=1067262519/sortBy=mostRecent/json) | "Apps ini sangat lengkap, mudah digunakan dan sangat bermanfaat" (Jul 2023) |
| Bridestory (iOS) | Keluh | Crash, lambat, gagal login | sama | Tema paling sering di 46 ulasan terbaru (hitungan peneliti, sampel miring ke ulasan lama, bukan representatif): "Aplikasi LEMOT, loading mulu berujung ERROR" (2021) |
| Bridestory (iOS) | Keluh | Tidak ada checklist/anggaran | sama | "No wedding checklist, no budgeting etc...vendors are expensive" (Agu 2020) |
| Honeydue | Suka | Reminder lebih baik dari catatan bersama | [App Store](https://apps.apple.com/app/id1157633945) | "huge step up from sharing a note in my iPhone because we get reminders" |
| Honeydue | Keluh | Sinkron transaksi, dukungan hilang | sama | "the support team seems to have gone completely dark" |
| Splitwise | Keluh | Batas harian di free tier tanpa pemberitahuan | [Trustpilot](https://www.trustpilot.com/review/splitwise.com?page=2) | Ulasan Des 2023 sampai Jul 2024: batas entri harian, jeda 10 detik. Tidak ada pengumuman resmi yang ketemu |
| Money Lover | Keluh | Ekspor sulit bahkan setelah bayar premium | [feed ulasan Apple ID](https://itunes.apple.com/id/rss/customerreviews/id=486312413/sortBy=mostRecent/json) | "useless premium can't export to google sheet" (Mei 2026) |
| Money Lover | Keluh | Tidak ada tautan ke BCA | sama | "Please connect it to BCA (bank cetral asia) indonesia" (Jul 2025) |
| Google Keep | Keluh | Sinkron dan data hilang di list bersama | [App Store](https://apps.apple.com/us/app/google-keep-notes-and-lists/id1029207872) | Update kolaborator tidak muncul; catatan menggandakan atau hilang |
| Wanderlog | Keluh | Trial paksa | [Trustpilot](https://www.trustpilot.com/review/wanderlog.com) | "Forced free trial which I'm not interested in." (Agu 2026); 51 ulasan, sampel kecil |
| Aplikasi chores | Keluh | Menambah kerja manajer, terasa seperti mengasuh pasangan | [MIT Tech Review](https://www.technologyreview.com/2022/05/10/1051954/chore-apps/) | "It doesn't solve the problem: that you're nagging someone else or parenting your partner." |
| Tody | Suka | Mengurangi kelelahan memutuskan | [App Store](https://apps.apple.com/us/app/tody-easy-house-cleaning/id595339588) | "It has helped me to only focus on what's right in front of me." |

**Tema yang berulang:**
- **Suka:** satu tempat untuk semuanya; sederhana tanpa upsell; reminder yang spesifik; kontrol atas tamu/RSVP; tampilan "terakhir dilakukan/akan jatuh tempo".
- **Keluh:** upsell dan paywall; kehilangan data dan sinkron rusak; ekspor terkunci; spam vendor; crash dan login gagal; memaksa satu pasangan jadi manajer.

### 2.5 Keluhan pasangan Indonesia

Jakpat, 26-30 Juni 2025, 798 responden yang berencana menikah ([Katadata](https://databoks.katadata.co.id/en/demographics/statistics/689acb7c92057/budgeting-the-hardest-part-of-wedding-planning)): anggaran adalah hal tersulit bagi 64%, menyeimbangkan kewajiban keluarga 55%, tekanan keluarga/teman 45%, urusan administrasi dan hukum 32%, komunikasi dengan pasangan 30%. Sumber dana (Jakpat, [Katadata](https://databoks.katadata.co.id/en/demographics/statistics/689bf39a83b02/ideal-wedding-budget-according-to-indonesian-youth)): 45% tabungan pribadi, 40% tabungan bersama.

Poin lain dari artikel Indonesia:
- **Pengeluaran melenceng:** survei Bridestory 2017 menemukan hanya 49.1% responden yang berhasil menjaga budget ([laporan](https://business.bridestory.com/blog/2017-indonesia-wedding-industry-report-by-bridestory1520393557); basis respondennya pengguna Bridestory).
- **Tamu tambahan dan porsi:** satu undangan bisa jadi 2-4 orang; aturan katering bervariasi, ada yang menyarankan 2x tamu undangan ([Antara, 29 Jul 2024](https://www.antaranews.com/berita/4224291/cara-hitung-biaya-katering-resepsi-pernikahan)), ada yang 2,5x ([Mojok, 2021](https://mojok.co/terminal/makanan-catering-adalah-tolok-ukur-kesuksesan-hajatanmu-jangan-disepelekan/)). Jadi pengali harus bisa diatur pasangan sendiri.
- **Keluarga ikut campur:** saran umum adalah menyelaraskan dengan pasangan dulu, membuka budget ke yang ikut membiayai, membagi slot undangan per keluarga, dan menuliskan kesepakatan ([IDN Times](https://www.idntimes.com/life/relationship/cara-hadapi-keluarga-terlalu-ikut-campur-persiapan-nikah-c1c2-01-zn5b2-d3brgs)).
- **Pertengkaran:** pembagian tugas yang timpang disebut sebagai salah satu pemicu ([Popbela, 17 Feb 2026](https://www.popbela.com/relationship/married/kenapa-pasangan-sering-bertengkar-saat-persiapan-pernikahan-00-ck827-w0vs7y)).
- **Penipuan WO:** lembaga konsumen menyebut kasus WO bermasalah sebagai "iceberg phenomenon" karena korban tidak tahu harus lapor ke mana ([Kontan, 9 Des 2025](https://nasional.kontan.co.id/news/ylki-soroti-lemahnya-perlindungan-konsumen-dalam-kasus-wedding-organizer-bermasalah)). Alasan kuat untuk menyimpan kontrak, bukti bayar, dan jadwal.
- **Amplop sebagai utang sosial:** sumbangan pernikahan balas-membalas terasa seperti "hutang sosial" ([Mojok](https://mojok.co/liputan/harian/sumbangan-pernikahan-di-jogja-bikin-nelangsa-dan-menderita/)); amplop bernama membentuk "buku besar sosial" informal ([Hipwee](https://www.hipwee.com/feature/7-filosofi-di-balik-tradisi-ngamplop-di-indonesia-biar-nggak-pusing-lagi-kalau-mau-kondangan/)). Tidak ketemu alat yang mencatatnya.
- **Harga dulu:** menurut data internal Bridestory semester I 2026, "70,13% business leads berasal dari aktivitas melihat atau meminta informasi harga" ([Bridestory Business Insight](https://business.bridestory.com/id/blog/bridestory-business-insight-januari-juni-2026)). Itu data sisi vendor, tapi konsisten dengan kebutuhan membandingkan penawaran.

**Peringatan sampel:** survei Bridestory mewakili penggunanya sendiri (2025: 94.3% Jabodetabek). Mereka melaporkan budget modal Rp250-500 juta, sedangkan panel nasional Jakpat menunjukkan Rp50-100 juta ([Bridestory 2025](https://business.bridestory.com/id/blog/bridestory-wedding-trend-survey-report-2025), [Katadata](https://databoks.katadata.co.id/en/demographics/statistics/689bf39a83b02/ideal-wedding-budget-according-to-indonesian-youth)). Jangan pakai satu angka sebagai "normal".

### 2.6 Aplikasi pasangan dan rumah tangga (ringkas, rinci di §4)

| Kategori | Contoh yang diverifikasi |
|---|---|
| Uang bersama | Honeydue (sinkron via Plaid; tidak ada di App Store Indonesia), Splitwise, YNAB, Monarch, Goodbudget |
| Tabungan | Bank Jago Kantong Bersama, blu bluGether |
| Daftar belanja | AnyList, OurGroceries, Bring!, Google Keep |
| Tugas rumah | Tody, Sweepy, Cozi |
| Kalender | Google Calendar, Apple Calendar, TimeTree, Cozi |
| Dokumen | Bitwarden (lampiran terenkripsi, emergency access), Google Inactive Account Manager |
| Rumah dan KPR | Simulasi KPR Rumah123 dan BCA, HomeZada |
| Perjalanan | Wanderlog, TripIt |
| Kenangan dan relasi | Day One, Between, Paired, Gottman Card Decks |

Bukti dan sumber per kategori ada di §4.

### 2.7 Celah yang masuk akal (inferensi)

- **Satu tempat privat untuk dua orang** yang menggabungkan tugas, vendor, jadwal bayar, tamu, dan rundown. Alat-alat di atas memecah ini ke 3-4 app, atau menguncinya di paket berbayar.
- **Proses KUA sebagai checklist bersyarat dengan tenggat dihitung mundur dari hari akad.** Tidak ketemu produk yang melakukannya. Alasan lemah: bisa saja ada dan tidak terjangkau pencarian ini.
- **Buku amplop dan momen keluarga** sebagai ledger balas-membalas.
- **Data milik sendiri:** ekspor penuh, tanpa paywall, tanpa batas harian.

Semua celah ini harus diperlakukan sebagai hipotesis yang dicek ke kalian berdua (§8), bukan sebagai temuan pasar.

---

## 3. Katalog fitur pernikahan per fase

Semua tenggat dihitung mundur atau maju dari **H** = hari akad. `HK` = hari kerja. Kolom **Nilai** menyebut pemicu pemakaian (lihat uji di §1.4). Nama `kind` di kolom Data merujuk ke model di §7. Effort dan Platform pakai legenda di bagian "Cara baca".

### 3.1 Fase 0: Dasar (H-12 bulan dan seterusnya)

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W1 | **Hari-H dan countdown.** Tanggal akad, zona waktu, countdown, tanggal Hijri perkiraan di sebelahnya | Satu angka yang membuat semua tenggat relatif. Terlihat tiap buka app | S | `settings`: tanggal akad (`YYYY-MM-DD`), zona IANA, label Partner A/B | client |
| W2 | **Timeline tugas dari template** dengan offset dari H. Tugas bisa diubah atau dihapus. Satu ketukan untuk "saya ambil". Tanda "perlu keputusan" | Mingguan. App yang mengingat apa saja yang harus dikerjakan mengurangi beban mengantisipasi (§1.2 #6) | M | `task`: judul, `due_on`, `done_on`, `who` (kosong = siapa saja), `group_key` (fase), catatan, flag keputusan | D1 + file template statis |
| W3 | **Layar "Minggu ini".** Tugas jatuh tempo atau telat, pembayaran 7 hari ke depan, keputusan menggantung, perpanjangan dokumen | Jangkar sesi mingguan di sofa. Satu-satunya "reminder" yang tidak butuh infrastruktur | S | Query atas `task`, `payment`, `doc` | client |
| W4 | **Catatan kesepakatan.** Keputusan penting: apa, siapa yang setuju, kapan, alasannya | Saran umum untuk konflik keluarga adalah menuliskan kesepakatan ([IDN Times](https://www.idntimes.com/life/relationship/cara-hadapi-keluarga-terlalu-ikut-campur-persiapan-nikah-c1c2-01-zn5b2-d3brgs)). Dipakai saat ada perdebatan "dulu kita bilang apa" | S | `note`: judul, isi, tanggal, `who` | D1 |

### 3.2 Fase 1: Administrasi nikah (kira-kira H-3 bulan sampai H+7 HK)

Berlaku untuk pasangan Muslim yang menikah lewat KUA. Jalur sipil (non-Muslim) dicatat di Dukcapil dan dilaporkan paling lambat 60 hari sejak perkawinan ([UU 23/2006 Pasal 34(1)](https://pasal.id/peraturan/uu/uu-no-23-tahun-2006), teks dari situs pihak ketiga; [Detik, 31 Mar 2026](https://news.detik.com/berita/d-8423682/syarat-dan-cara-urus-akta-kelahiran-akta-perkawinan-dan-akta-kematian) mengulang aturan itu). Jalur sipil tidak dimodelkan di sini.

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W5 | **Checklist KUA bersyarat.** Daftar langkah dan dokumen dari §3.8, tenggat dihitung mundur dari H. Dokumen tambahan muncul sesuai kondisi (usia, akad di luar kecamatan, janda/duda, TNI/Polri, WNA). Butir yang aturannya beda antar KUA ditandai "tanya KUA" dengan kolom catatan | Padat-sementara: dua bulan penuh aktivitas, dengan tenggat yang berakibat nyata | M | `task` dari template dengan aturan; status siap (bool), tanggal, catatan. **Tanpa nomor NIK, tanpa scan** | D1 + file template statis |
| W6 | **Kalender hari kerja** untuk menghitung "10 HK sebelum akad". Daftar libur nasional dan cuti bersama bisa diedit. Peringatan buffer: 10 HK adalah minimum hukum, bukan jadwal realistis | definisi "hari kerja" di PMA dan perlakuan cuti bersama tidak ditemukan (§3.8). Libur ditetapkan lewat SKB 3 Menteri tiap tahun ([SKB 2026, Setneg](https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026)) | S | `settings`: daftar tanggal libur (seed tahunan, diisi manual) | static + client |
| W7 | **Jalur perjanjian pranikah (opsional).** Empat tugas: putuskan, cari notaris, tanda tangan, beri tahu KUA agar dicatat di Akta dan Buku Nikah | MK mengizinkan perjanjian dibuat sebelum, saat, atau selama perkawinan ([Putusan MK 69/PUU-XIII/2015](https://www.mkri.id/public/content/persidangan/putusan/69_PUU-XIII_2015.pdf)); untuk Muslim dibuat di hadapan notaris dan dicatat KUA ([PMA 30/2024 Pasal 39-40](https://desakarangwuni.gunungkidulkab.go.id/assets/files/dokumen/PERMENAG-30-2024.pdf)). Bukan nasihat hukum. Hanya jika kalian berdua memang memikirkannya | S | `task` (4 butir) | D1 |

### 3.3 Fase 2: Lamaran, seserahan, acara adat

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W8 | **Acara** sebagai grup: lamaran, siraman, midodareni, pengajian, akad, resepsi, ngunduh mantu, tasyakuran. Template yang bisa diedit dan dihapus. Dipakai sebagai `group_key` di tugas, anggaran, rundown | Struktur anggaran dan rundown mengikuti acara. Mana yang dipakai berbeda tiap keluarga dan daerah (ngunduh mantu opsional: [Popbela](https://www.popbela.com/relationship/married/perbedaan-resepsi-dan-ngunduh-mantu-00-925lr-2j6wk6)) | S | `settings`: daftar acara (nama, tanggal opsional, zona) | client |
| W9 | **Daftar seserahan/hantaran.** Nama, harga, link beli, kategori, status (belum/proses/selesai), total | Mingguan selama berburu barang; dipakai di toko. Dari sheet asli (brainstorm §1.6) | S | `item` jenis seserahan: judul, `amount`, link, `group_key`, `status`, `who` | D1 |

Mahar bukan fitur terpisah: catat sebagai butir anggaran atau catatan. PMA 30/2024 tidak menyebut mahar ([PDF](https://desakarangwuni.gunungkidulkab.go.id/assets/files/dokumen/PERMENAG-30-2024.pdf), dicari lewat grep oleh peneliti). Perbedaan hukum mahar vs seserahan tidak berhasil diverifikasi: `[UNVERIFIED]`.

### 3.4 Fase 3: Vendor dan uang (H-12 bulan sampai H-1 bulan)

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W11 | **Buku vendor.** Kategori, status (opsi/fix/batal), kontak, PIC, ketukan untuk telepon dan WhatsApp, fakta kunci kontrak (biaya tambahan di luar kontrak, aturan pembatalan, kontak darurat) | Meeting vendor dan hari-H. Penipuan WO jarang berujung ke mana-mana ([Kontan](https://nasional.kontan.co.id/news/ylki-soroti-lemahnya-perlindungan-konsumen-dalam-kasus-wedding-organizer-bermasalah)), jadi kontrak dan kontak harus mudah ditemukan. Pertanyaan wajib ke WO: biaya tambahan di luar kontrak, rencana cadangan ([Popbela](https://www.popbela.com/relationship/married/pertanyaan-wedding-organizer-00-vmqqn-l796gq)) | S | `vendor`: nama, `group_key` (kategori), `status`, telepon E.164, PIC, `amount` (harga penawaran), link kontrak, catatan | D1 |
| W12 | **Perbandingan penawaran per kategori.** Beberapa vendor opsi berdampingan, harga dulu | Harga adalah pintu masuk: 70,13% lead vendor Bridestory berasal dari lihat atau minta harga ([Bridestory](https://business.bridestory.com/id/blog/bridestory-business-insight-januari-juni-2026)); anggaran adalah hal tersulit bagi 64% responden ([Katadata](https://databoks.katadata.co.id/en/demographics/statistics/689acb7c92057/budgeting-the-hardest-part-of-wedding-planning)) | S | Tampilan atas `vendor` (kelompokkan menurut `group_key`) | client |
| W13 | **Anggaran dan pembayaran.** Butir anggaran per acara (rencana vs terpakai), baris pembayaran (DP, termin, pelunasan) dengan tanggal jatuh tempo dan tanggal bayar, sisa, tanda "telat", daftar "7 hari ke depan". Hasil survei Bridestory 2017: hanya 49.1% yang menjaga budget, jadi selisih rencana vs aktual perlu terlihat | Mingguan. Pembayaran vendor adalah uang dan tenggat nyata. Sheet asli tidak punya tanggal jatuh tempo (brainstorm §1.4) | M | `budget` (judul, `group_key` = acara, `amount` rencana, `parent_id` = vendor opsional) dan `payment` (`parent_id` = butir anggaran, `amount`, `due_on`, `done_on`, `who` = pembayar) | D1 |
| W14 | **Dana nikah.** Target, setoran per orang atau sumber (Partner A, Partner B, orang tua, lainnya), progres, "perlu menabung Rp X per bulan" = (target dikurangi terkumpul) dibagi bulan tersisa | Mingguan sampai bulanan. 45% responden Jakpat mendanai dari tabungan pribadi dan 40% dari tabungan bersama ([Katadata](https://databoks.katadata.co.id/en/demographics/statistics/689bf39a83b02/ideal-wedding-budget-according-to-indonesian-youth)), jadi pencatatan per sumber bermakna. Uang sebenarnya ada di rekening/Kantong; app hanya mencatat | S | `saving` (target, tenggat) dan `contribution` (`parent_id`, `amount`, `done_on`, `who`) | D1 |
| W15 | **Bukti bayar sebagai link** ke Drive/Photos, bukan unggahan. Unggahan ke `R2` baru nanti (lihat W15b di §7) | Jejak penipuan WO dan sengketa. Link murah; upload butuh R2 (§5.3) | S | `payment.data.link` | D1 |

### 3.5 Fase 4: Tamu dan undangan

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W16 | **Daftar tamu satu tabel.** Sisi (Partner A/B), kategori, nama, jumlah orang (pax), nomor HP, status undangan, catatan. Total per sisi dan kategori. **Pengali porsi katering yang bisa diatur** (aturan 2x atau 2,5x berbeda antar sumber: [Antara](https://www.antaranews.com/berita/4224291/cara-hitung-biaya-katering-resepsi-pernikahan), [Mojok](https://mojok.co/terminal/makanan-catering-adalah-tolok-ukur-kesuksesan-hajatanmu-jangan-disepelekan/)). Impor dan ekspor CSV | Mingguan di fase undangan; angka total menggerakkan anggaran katering, yang bisa 40-60% dari anggaran resepsi ([Detik, 2020](https://finance.detik.com/perencanaan-keuangan/d-4892336/hitung-hitung-biaya-kawinan-apa-sih-yang-bikin-boros)) | M | `guest`: nama, `group_key` (sisi dan kategori), `qty` (pax), telepon, `status`, catatan | D1 + client (CSV) |
| W17 | **Tracker undangan** dengan tombol "kirim lewat WhatsApp" per tamu (`wa.me/<nomor>?text=...`, [format resmi](https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat/)) dan penanda terkirim | Mingguan saat mengirim; pesan dikirim manual oleh pengguna, bukan otomatis | S | `guest.status` ("belum/terkirim/konfirmasi/tidak datang") | client |
| W18 | **Impor hasil RSVP/check-in dari layanan undangan digital**, lewat CSV/Excel. Banyak platform menawarkan ekspor, mis. invi.id ([halaman](https://invi.id)) | Hanya bila kalian memakai layanan undangan eksternal (§8: tidak dibuat sendiri) | M | Pencocokan nama ke `guest` | client |
| W19 | **Link baca-saja** untuk orang tua atau WO: rundown, total tamu, kontak vendor. Token acak per link, bisa dicabut | Pasangan ingin melibatkan orang di luar mereka ([Massimi dkk.](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/03/Real-but-Glossy.pdf)). Risiko privasi, jadi ditunda dan dibuat sempit | M | Tabel token (hash), cakupan per link | D1 + endpoint publik |

### 3.6 Fase 5: Hari-H

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W20 | **Rundown per acara.** Waktu mulai dan selesai, acara, PIC, catatan, centang, sorotan "sekarang/berikutnya". Terbuka **tanpa sinyal** | Padat-sementara: dibuka berulang di dua minggu terakhir dan di hari-H. Untuk koordinator, bukan pengantin (§1.1) | M | `rundown`: `group_key` = acara, `due_on` (tanggal), `data` (jam mulai/selesai), judul, PIC, catatan, `done_on` | D1 + `client` (cache offline) |
| W21 | **Bagikan rundown dan kontak vendor** sebagai teks WhatsApp (`wa.me/?text=`) atau cetak. Teks sudah di-URL-encode | Cara paling murah memberi run sheet ke koordinator tanpa akun ketiga | S | Tampilan atas `rundown` dan `vendor` | client |
| W22 | **Daftar lagu per momen** (masuk, akad, makan, penutup) | Sekali-pakai tapi murah. Dari sheet asli (brainstorm §1.11) | S | `song`: judul, penyanyi, `group_key` (momen) | D1 |
| W23 | **Checklist malam sebelum** dan barang bawaan | Template statis | S | `task` dari template | D1 + static |

### 3.7 Fase 6: Setelah nikah (H+1 sampai kira-kira H+90)

| ID | Fitur | Nilai (pemicu) | Effort | Data | Platform |
|---|---|---|---|---|---|
| W24 | **Checklist admin pasca-nikah.** KK baru, perubahan status di KTP-el, BPJS (tambah pasangan), status pajak, bank/asuransi/paspor/STNK. Dibedakan **wajib vs opsional vs belum jelas** (§3.9) | Padat-sementara; berlanjut ke household | S | `task` dari template | D1 + static |
| W25 | **Buku amplop masuk.** Siapa memberi, berapa, di acara apa, catatan. Saat diundang kondangan nanti, lihat apa yang pernah mereka beri (lanjut ke H12) | Tebus-nilai tinggi. Praktiknya terdokumentasi sebagai balas-membalas ([Goodnews from Indonesia](https://www.goodnewsfromindonesia.id/2021/11/24/fenomena-sosial-dan-eksistensi-tradisi-buwuhan-dalam-hajatan), [Hipwee](https://www.hipwee.com/feature/7-filosofi-di-balik-tradisi-ngamplop-di-indonesia-biar-nggak-pusing-lagi-kalau-mau-kondangan/)), dan tidak ketemu alat khusus. **Permintaan belum divalidasi** | S | `gift`: nama pemberi, `group_key` = acara, `amount`, `done_on`, arah (masuk/keluar) di `data`, catatan | D1 |
| W26 | **Penutupan.** Sisa tagihan vendor, daftar ucapan terima kasih, export arsip (JSON + CSV + `.ics`) | Mengakhiri proyek dengan rapi dan menyimpan salinan di luar app | S | Tampilan atas `payment`, `guest` | client |

### 3.8 Detail: proses KUA (dasar W5 dan W6)

Dasar hukum: Peraturan Menteri Agama (PMA) 30/2024 tentang Pencatatan Pernikahan, ditetapkan 24 Desember 2024, berlaku 30 Desember 2024, mencabut PMA 22/2024 ([BPK](https://peraturan.bpk.go.id/Details/321787)). Teks lengkap dibaca dari [salinan PDF](https://desakarangwuni.gunungkidulkab.go.id/assets/files/dokumen/PERMENAG-30-2024.pdf). Tidak ditemukan pengganti per Agustus-September 2026 ([Detik, 9 Sep 2026](https://www.detik.com/hikmah/khazanah/d-8656003/syarat-dan-alur-pendaftaran-nikah-terbaru-kemenag-2026), [Kemenag Kebumen, 3 Sep 2026](https://kebumen.kemenag.go.id/mau-menikah-ini-syarat-dan-tahapan-pendaftaran-nikah-di-kua-sesuai-pma-30-tahun-2024/)). Ini bukan nasihat hukum.

| Langkah | Kapan | Dokumen/hal | Sumber | Status |
|---|---|---|---|---|
| 1. Pilih KUA dan tanggal akad; putuskan di KUA atau di luar | Awal. Saran penulis: tiga bulan atau lebih sebelum H (bukan aturan) | – | PMA Pasal 16 | Aturan terverifikasi; waktu adalah saran |
| 2. Surat pengantar nikah dari kelurahan/desa | Sebelum mendaftar | Pasal 4(1)(a). Kode formulir N1-N4 adalah nama lokal, PMA tidak menyebut kode | PMA; [SIMKAH](https://simkah4.kemenag.go.id/) menyebut "N1-N4" | Terverifikasi. Langkah RT/RW `[UNVERIFIED]` |
| 3. Surat rekomendasi nikah, bila akad di luar kecamatan domisili | Sebelum mendaftar di KUA tempat akad | Pasal 4(1)(e), 17. Satu rekomendasi dari KUA tiap domisili; bila keduanya satu kecamatan cukup satu | PMA | Terverifikasi; lead time `[UNVERIFIED]` |
| 4. Surat keterangan sehat dari fasilitas kesehatan | Sebelum mendaftar. Kemenkes menyarankan pemeriksaan sekitar 3 bulan sebelum ([Ayo Sehat, 2018](https://ayosehat.kemkes.go.id/pentingnya-pemeriksaan-kesehatan-pra-nikah)) | Permenkes 2/2025 Pasal 28 ([PDF](https://jdih.kemkes.go.id/storage/documents/pdfs/2025permenkes002.pdf)). Imunisasi TT tidak disebut di pasal saat ini; apakah KUA meminta kartu TT `[UNVERIFIED]` | PMA 4(1)(f), Permenkes | Terverifikasi |
| 5. Daftar kehendak nikah di KUA atau online lewat SIMKAH | Paling lambat **10 HK sebelum akad**. Kurang dari itu: surat dispensasi camat atau surat pernyataan bermeterai | Pasal 3 | PMA | Terverifikasi (teks lengkap) |
| 6. Datang ke KUA setelah daftar online | Halaman SIMKAH menyebut paling lambat 15 HK; teks PMA tidak memuat aturan itu | – | [SIMKAH](https://simkah4.kemenag.go.id/), [Kompas, 5 Mei 2026](https://cahaya.kompas.com/aktual/26E05112754390/cara-daftar-nikah-di-kua-2026-alur-online-offline-dan-biaya-resminya) | **Bertentangan**, tanya KUA |
| 7. Bimbingan perkawinan | Wajib bagi catin yang sudah mendaftar; sertifikat menjadi syarat pemeriksaan nikah | Pasal 5, 6(2)(d). Durasi dan jadwal `[UNVERIFIED]` | PMA | Wajib terverifikasi |
| 8. Pemeriksaan nikah | Setelah bimwin; calon suami, calon istri, dan wali hadir | Pasal 6 | PMA | Terverifikasi |
| 9. Lengkapi dokumen yang kurang | Paling lambat 1 HK sebelum akad | Pasal 7(2) | PMA | Terverifikasi |
| 10. Biaya | Rp0 di KUA pada hari dan jam kerja. Rp600.000 bila di luar KUA atau di luar jam kerja | PP 59/2018 Pasal 5 ([BPK](https://peraturan.bpk.go.id/Details/99855/pp-no-59-tahun-2018)); jumlahnya ada di lampiran gambar, sehingga angka diambil dari halaman Kemenag ([Purbalingga, Agu 2026](https://purbalingga.kemenag.go.id/dari-rumah-bisa-ini-alur-pendaftaran-nikah-melalui-simkah/), [SIMKAH](https://simkah4.kemenag.go.id/)) | PP, Kemenag | Terverifikasi; konfirmasi ke KUA |
| 11. Akad; Buku Nikah dan Kartu Nikah | Diberikan sesaat setelah akad; bila tidak bisa, paling lambat 7 HK | Pasal 38 | PMA | Terverifikasi (teks lengkap) |

**Dokumen bersyarat (Pasal 4(1)):** izin orang tua/wali bila di bawah 21; dispensasi dari Pengadilan bila di bawah 19 pada hari akad; akta cerai atau kematian untuk janda/duda; izin atasan untuk TNI/Polri; penetapan izin poligami; daftar terpisah untuk WNA (Pasal 4(2)-(3)).

**Yang tidak ada di daftar nasional:** ijazah, pas foto, mahar, NPWP. Persyaratan foto adalah praktik lokal (satu kantor Kemenag menyebut 4x6 cm dan 2x3 cm, latar biru: [Purbalingga](https://purbalingga.kemenag.go.id/mau-nikah-pahami-dulu-persyaratan-pendaftaran-nikahnya/)).

**Elsimil (BKKBN) bukan syarat nasional.** Tidak ada di daftar Pasal 4; BKKBN pernah meminta pemda mewajibkannya untuk surat pengantar ([Antara, 26 Mar 2024](https://www.antaranews.com/berita/4029018/bkkbn-minta-sertifikat-elsimil-jadi-syarat-surat-pengantar-menikah)); Kemendukbangga dan Kemenag sepakat memperkuat pemakaiannya tanpa mandat ([Antara, 5 Mei 2026](https://www.antaranews.com/berita/5556837/kemendukbangga-kemenag-perkuat-elsimil-guna-cegah-perceraian)). Beberapa blog menyebutnya "wajib" di 2026: bertentangan, `[UNVERIFIED]`, anggap praktik lokal.

**SIMKAH:** situs resmi pendaftaran online adalah `simkah4.kemenag.go.id` (nama sistem: Sistem Informasi Manajemen Nikah). Alur: buat akun dengan email dan OTP, pilih "Daftar Nikah", isi data, unggah dokumen, cetak bukti ([Kontan, 29 Mei 2023](https://nasional.kontan.co.id/news/cara-daftar-nikah-online-di-simkah4kemenaggoid-hubungi-nomor-ini-jika-terkendala), mungkin sudah berubah). Saluran pengaduan pungutan tidak resmi: `simdumas.kemenag.go.id` ([Kompas](https://cahaya.kompas.com/aktual/26E05112754390/cara-daftar-nikah-di-kua-2026-alur-online-offline-dan-biaya-resminya)).

**Implikasi desain (saran penulis, bukan fakta):** simpan "tanya KUA" sebagai butir dengan kolom catatan, bukan aturan keras; dokumen bersyarat sebagai aturan sederhana pada template; semua tanggal turunan dari H dan bisa diedit; jangan menyimpan nomor dokumen atau scan.

### 3.9 Detail: admin setelah nikah (dasar W24)

| Butir | Wajib atau opsional | Tenggat | Sumber | Status |
|---|---|---|---|---|
| Buku Nikah di tangan | Prasyarat semua butir lain | Sesaat setelah akad, paling lambat 7 HK | PMA Pasal 38 | Terverifikasi |
| KK baru (keluarga baru) | Praktis wajib untuk BPJS, bank, dll. | Tenggat nasional tidak ketemu; "30 hari" hanya dari satu blog `[UNVERIFIED]` ([blog ITERA](https://blog.itera.ac.id/?p=8862)) | Dukcapil: [KK baru](https://dukcapil.kemendagri.go.id/page/read/penerbitan-kartu-keluarga-baru-karena-membentuk-keluarga-baru) (fotokopi buku nikah, formulir F-1.02) | Syarat terverifikasi |
| Perubahan status di KTP-el | Perubahan data dicatat di Dinas | Tidak ketemu | Dukcapil: [KTP-el](https://dukcapil.kemendagri.go.id/page/read/penerbitan-ktp-el-baru-karena-pindah-perubahan-data-rusak-dan-hilang-untuk-wni) | Syarat terverifikasi |
| BPJS Kesehatan: tambah pasangan | Pasangan adalah anggota keluarga ([Perpres 82/2018 Pasal 5(1)](https://pasal.id/peraturan/perpres/perpres-no-82-tahun-2018), salinan situs pihak ketiga) | Tenggat tambah pasangan tidak ketemu (28 hari di sana untuk bayi baru lahir, bukan pasangan) | Perpres | Hubungan terverifikasi; tenggat `[UNVERIFIED]` |
| Pajak: status K/0, K/1 | Diurus lewat HR atau DJP | Aturan waktu `[UNVERIFIED]` | [PMK 101/2016 berstatus "Berlaku"](https://peraturan.bpk.go.id/Details/121096/pmk-no-101pmk0102016) di BPK | Status regulasi terverifikasi; sisanya tidak |
| BPJS Ketenagakerjaan (ahli waris), paspor, bank/asuransi (penerima manfaat), STNK, formulir HR | Opsional atau sesuai kontrak | Tidak ketemu | – | `[UNVERIFIED]` semuanya |
| Integrasi data SIAK-SIMKAH | Bila aktif, status perkawinan di Dukcapil diperbarui otomatis | Target selesai November 2026, pilot di 2-3 KUA pada Desember 2026; sampai itu KK dan KTP-el diurus terpisah | [Dukcapil, 22 Sep 2026](https://dukcapil.kemendagri.go.id/blog/read/mencegah-fraud-identitas-interkoneksi-data-siak-dan-simkah-ditargetkan-tuntas-november-2026) | Target, belum aktif |

Saran desain: jadikan template ini tugas yang bisa disembunyikan satu per satu, terutama butir KK dan KTP-el kalau integrasi SIAK-SIMKAH sudah berjalan.

---

## 4. Katalog fitur household (setelah menikah)

Pertanyaan yang dijawab untuk tiap kategori: apakah layak dibuat di app privat dua orang, atau lebih baik diserahkan ke app yang ada. Kriterianya: lolos uji §1.4, aplikasi yang ada sudah baik atau gratis, risiko privasi, dan apakah bagian tersulitnya (sinkron instan, integrasi bank, peta) bisa dikerjakan app kecil.

**Fakta yang menentukan banyak keputusan: bank sync ala AS tidak tersedia di Indonesia.**
- Plaid tidak mencantumkan Indonesia di daftar negara Link ([Plaid docs](https://plaid.com/docs/api/link/)); cakupan institusinya AS dan Kanada ([Plaid institutions](https://plaid.com/docs/institutions/)). Absennya Indonesia adalah ketiadaan di daftar, bukan pernyataan eksplisit.
- Honeydue sinkron lewat Plaid dan hanya baca ([CNBC Select, 26 Mar 2026](https://www.cnbc.com/select/honeydue-budgeting-app-review/)); pencarian Apple untuk id app-nya di storefront Indonesia mengembalikan nol hasil pada 2026-10-06 ([lookup](https://itunes.apple.com/lookup?id=1157633945&country=id)). Ketersediaan di Android Indonesia tidak dicek.
- SNAP, standar open API Bank Indonesia sejak 2022 (dikelola ASPI sejak 1 Sep 2023), adalah standar pembayaran: transfer, cek saldo, riwayat transaksi ([BI](https://www.bi.go.id/id/layanan/Standar/SNAP/default.aspx), [ASPI portal](https://apidevportal.aspi-indonesia.or.id/)). Apakah individu atau app tanpa izin bisa memanggilnya tidak tampak: `[UNVERIFIED]`. Agregator seperti Brankas menjual API ke developer dan perusahaan ([brankas.com](https://www.brankas.com/)).
- App lokal menyiasati dengan unggah mutasi, screenshot e-wallet, atau log lewat WhatsApp: [Finku](https://apps.apple.com/id/app/finku-budget-money-manager/id1587320325), [Sribuu](https://apps.apple.com/id/app/sribuu-budget-money-manager/id1542637665). Pengulas Money Lover masih meminta integrasi BCA (lihat §2.4).
- Konsekuensi: app kecil tidak tertinggal soal sinkronisasi. Jalur realistis adalah entri manual, impor CSV/mutasi, atau OCR screenshot.

### 4.1 Ringkasan keputusan

| ID | Fitur | Keputusan | Alasan satu baris | Effort | Platform |
|---|---|---|---|---|---|
| H1 | Pengeluaran bersama (ledger tipis) | **Mungkin**, setelah H3/H2 | Tanpa bank sync; risiko berhenti tertinggi karena input manual | M | D1, client (CSV) |
| H2 | Target tabungan | **Buat** (pakai ulang W14) | Uang ada di bank; app hanya mencatat progres | S | D1 |
| H3 | Tagihan dan kewajiban berulang | **Buat, kecil** | Bayarnya di app resmi; celah ada di pengingat | M | D1; cron atau `.ics` untuk pengingat |
| H4 | Perpanjangan dokumen dan kendaraan | **Buat** (varian H3) | Pajak tahunan, STNK 5 tahun, SIM, paspor, asuransi | S | D1 |
| H5 | Daftar belanja | **Serahkan** | Aplikasi matang, gratis, sinkron instan | – | – |
| H6 | Rencana makan | **Tidak** | Tidak ada bukti kebutuhan mingguan yang belum terlayani | – | – |
| H7 | Tugas rumah berulang | **Mungkin, kecil** | "Terakhir dilakukan / jatuh tempo", tanpa assign | S (di atas H3) | D1 |
| H8 | Kalender bersama | **Serahkan** + feed `.ics` | Google Calendar gratis dan granular | S (feed) | D1 + endpoint publik |
| H9 | Brankas dokumen | **Serahkan scan**; **buat indeks** | Scan KTP/KK adalah data paling berisiko | S (indeks) | D1 |
| H10 | Rumah, renovasi, KPR | **Serahkan** KPR; **pakai ulang** anggaran untuk renovasi | Kalkulator KPR sudah ada | S | D1 |
| H11 | Perjalanan | **Serahkan**; boleh sebagai proyek | Wanderlog dan Maps | S | D1 |
| H12 | Orang dan momen: ulang tahun, kondangan/amplop keluar, Lebaran/mudik | **Buat, kecil, setelah divalidasi** | Tidak ada alat balas-membalas amplop yang ketemu | S | D1 |
| H13 | Jurnal dan kenangan | **Mungkin**: timeline teks | Bukti mengarah ke kepemilikan data, bukan fitur | S | D1 |
| H14 | Lain-lain (servis kendaraan, kesehatan, hewan peliharaan) | Servis: lipat ke H3; sisanya **tidak** | Tidak ada bukti kebutuhan yang cukup | S | D1 |

### 4.2 Bukti per kategori

**H1 Pengeluaran bersama.**
- Splitwise: pengulas melaporkan batas entri harian dan jeda di free tier sejak Desember 2023 ([Trustpilot](https://www.trustpilot.com/review/splitwise.com?page=2)); tidak ada pengumuman resmi yang ketemu. Honeydue: ulasan menyebut transaksi tidak ter-refresh dan dukungan "dark" ([App Store](https://apps.apple.com/app/id1157633945)).
- Zeta (app keuangan pasangan): Acorns mengumumkan akuisisi aset pada 24 Juni 2025 ([Acorns](https://acorns.com/learn/acorns-zeta-acquisition/)); tanggal tutup 9 Mei 2025 hanya dari blog pesaing `[UNVERIFIED]` ([Pocket Clear](https://pocketclear.app/blog/zeta-app-alternative-couples.html)).
- Goodbudget: entri manual dan envelope ([CNBC Select](https://www.cnbc.com/select/goodbudget-app-review/)).
- Epstein dkk. (UbiComp 2015): alat keuangan bertahan lebih baik dari alat aktivitas, tapi perawatan manual menjadi pembunuh utama (§1.2 #4).
- **Saran:** mulai dari "total aktual bulan ini per kategori" dan "siapa bayar apa" untuk pengeluaran besar bersama, bukan mencatat setiap kopi. Siapkan impor/ekspor CSV. Jangan mengejar sinkronisasi bank.

**H2 Target tabungan.** Bank Jago "Kantong Bersama": undang pengguna Jago lain ke satu Kantong dengan target; peran akses "Bisa Lihat, Bisa Pakai, atau Bisa Lihat dan Pakai"; kedua orang harus punya akun Jago ([ringkasan produk Jago](https://assets.jago.com/web-assets/public/riplay-umum-kantong-jago-new-logo.pdf)). Pada akhir Desember 2025 ada 40 juta Kantong dan Kantong Bersama tumbuh 87% setahun ([BCA Sekuritas, 30 Jan 2026](https://bcasekuritas.co.id/en/latest-news/news/bank-jago-catat-adopsi-fitur-kantong-aplikasi-banking-capai-40-juta)). blu by BCA Digital punya bluGether; Republika menyebutnya menabung "tanpa harus membuka rekening bersama", Selular menyebutnya rekening bersama, jadi bentuk hukumnya bertentangan antar sumber ([Republika](https://ekonomi.republika.co.id/berita/tin053349/blu-by-bca-digital-menabung-kini-jadi-aktivitas-kolaboratif), [Selular, Feb 2026](https://selular.id/2026/02/blu-by-bca-digital-dorong-couple-budgeting-lewat-blusaving-dan-blugether/)). **Saran:** app mencatat progres (nama, target, tenggat, kontribusi, "perlu Rp X per bulan"). Uangnya tetap di bank.

**H3-H4 Tagihan dan perpanjangan.** Pengulas Honeydue menyukai pengingat dibanding catatan bersama (§2.4). Pembayaran dikuasai app resmi dengan basis pengguna besar: PLN Mobile (4,8 dari 178.385 rating di App Store Indonesia), Mobile JKN (4,78 dari 388.838) ([PLN Mobile](https://apps.apple.com/id/app/pln-mobile/id1299581030), [Mobile JKN](https://apps.apple.com/id/app/mobile-jkn/id1237601115), snapshot 2026-10-06). App pengingat tagihan mandiri di App Store Indonesia punya 0-1 rating ([pencarian](https://itunes.apple.com/search?term=tagihan+pengingat+jatuh+tempo&entity=software&country=id)): bisa berarti tidak ada permintaan atau tidak ada distribusi. App SIGNAL (Samsat Digital Nasional) punya 1,78 bintang dari 10.317 ulasan ([pencarian](https://itunes.apple.com/search?term=pajak+kendaraan+samsat&entity=software&country=id)). Masa berlaku STNK lima tahun ([Wikipedia](https://id.wikipedia.org/wiki/Surat_Tanda_Nomor_Kendaraan), sekunder). **Saran:** tabel berulang (nama, jumlah, periode atau tanggal jatuh tempo, siapa yang bayar, "sudah bayar periode ini", jatuh tempo berikutnya). Tidak mendeteksi langganan dari transaksi (butuh agregasi bank).

**H5-H6 Belanja dan makan.** AnyList (inti gratis, Complete $9,99/tahun individu atau $14,99 rumah tangga: [App Store](https://apps.apple.com/us/app/anylist-grocery-shopping-list/id522167641)), OurGroceries ([App Store](https://apps.apple.com/us/app/our-groceries-shopping-list/id325851015)), dan Bring! sudah matang. Keluhan Google Keep soal sinkron dan item hilang ([App Store](https://apps.apple.com/us/app/google-keep-notes-and-lists/id1029207872)) menunjukkan sulitnya sinkron instan. Kehilangan satu item di lorong toko mahal harganya. Mealime tutup 21 Oktober 2026 dan menghapus data pribadi ([Mealime](https://www.mealime.com/closing)): contoh risiko ketergantungan. **Saran:** serahkan; pilih salah satu app yang punya ekspor.

**H7 Tugas rumah.** Tody menggunakan model "perlu dikerjakan" berbasis urgensi dan diulas mengurangi kelelahan memutuskan ([App Store](https://apps.apple.com/us/app/tody-easy-house-cleaning/id595339588)). Studi dan liputan tentang aplikasi chores: delegasi menambah pekerjaan bagi yang sudah mengelola, dan terasa seperti mengasuh pasangan ([MIT Technology Review](https://www.technologyreview.com/2022/05/10/1051954/chore-apps/)). **Saran:** bila dibuat, hanya varian H3 dengan "terakhir dilakukan oleh, kapan" dan jatuh tempo berikutnya. Tanpa poin, peringkat, atau assign dengan notifikasi. Jika tidak dirawat, serahkan ke Tody.

**H8 Kalender.** Google Calendar berbagi gratis dengan lima level izin ([Google](https://support.google.com/calendar/answer/37082)). Fakta untuk feed `.ics`: Google hanya bisa menambah kalender dari URL lewat browser komputer, bukan lewat app Android/iPhone/iPad ([Google](https://support.google.com/calendar/answer/37100?hl=en)); interval refresh tidak dipublikasikan oleh Google (angka "12-24 jam" hanya dari blog pihak ketiga: `[UNVERIFIED]`). **Saran:** jangan membangun UI kalender. Sediakan feed baca-saja (§6).

**H9 Brankas dokumen.** Bitwarden Premium: $1,65/bulan, lampiran 5 GB, emergency access ([harga](https://bitwarden.com/pricing/), [emergency access](https://bitwarden.com/help/emergency-access/)). Google Inactive Account Manager: sampai 10 kontak terpercaya menerima data terpilih setelah akun tidak aktif ([Google](https://support.google.com/accounts/answer/3036546)). OWASP: unggahan file butuh otorisasi, nama file acak, penyimpanan di luar web root, validasi signature ([cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)). Dirjen Dukcapil pernah meminta publik tidak mengunggah dokumen kependudukan ke media sosial ([Medcom, 10 Mei 2021](https://www.medcom.id/nasional/peristiwa/GbmqQ5Pb-jaga-kerahasiaan-dokumen-kependudukan-tak-perlu-diunggah-ke-medsos)); klaim hukuman 10 tahun hanya di snippet pencarian: `[UNVERIFIED]`. **Saran:** scan dokumen di brankas yang sudah ada. App menyimpan **indeks**: nama dokumen, lokasi fisik atau brankas, tanggal kedaluwarsa, siapa yang memegang, nomor telepon darurat. Tanpa nomor identitas.

**H10 Rumah, renovasi, KPR.** Kalkulator KPR sudah ada di [Rumah123](https://www.rumah123.com/kpr/simulasi-kpr/) dan [BCA rumahsaya](https://www.bca.co.id/en/informasi/edukatips/2023/08/01/06/13/simulasi-kpr-dengan-mudah-di-rumahsaya). Rumah123 menyatakan batas cicilan bank 30% dari gaji bersih: "Kemampuan Cicilan = (Gaji Bersih x 30%) - Cicilan Lain" ([Rumah123](https://www.rumah123.com/kpr/kemampuan-kpr/)). Overrun renovasi nyata di data Inggris: 38% pemilik rumah melebihi budget awal ([Houzz UK 2026 via InteriorDaily](https://www.interiordaily.com/article/9855002/uk-homeowners-cut-renovation-budgets-by-nearly-30/)); bukan data Indonesia dan tidak ada sumber kebiasaan RAB Indonesia yang ketemu: `[UNVERIFIED]`. HomeZada adalah suite besar bergaya AS ([homezada.com](https://www.homezada.com/)). **Saran:** kalkulator KPR diserahkan. Renovasi atau pindahan menjadi "proyek" baru dengan modul anggaran dan pembayaran yang sama dari W13, hampir tanpa kode baru (§7). Berlaku hanya bila benar-benar ada renovasi.

**H11 Perjalanan.** Wanderlog (inti gratis; ulasan Trustpilot 1,9 dari 51 ulasan, sampel kecil: [Trustpilot](https://www.trustpilot.com/review/wanderlog.com)). Google Trips dihentikan 5 Agustus 2019 ([MobileSyrup](https://mobilesyrup.com/2019/06/04/google-trips-shutdown-august-5-2019/)). **Saran:** serahkan. Boleh memakai "proyek perjalanan" (tugas + anggaran) bila sudah terasa berguna.

**H12 Orang dan momen.** Wishlist hadiah ditangani Giftster, Giftful, GoWish (gratis dan matang: contoh [Giftster](https://apps.apple.com/us/app/giftster-the-family-wish-list/id478126039)). Yang tidak ketemu adalah pencatat amplop balas-membalas: satu app dari pengembang asing, KnotNote, mencoba niche ini dan punya 0 rating ([App Store](https://apps.apple.com/id/app/knotnote-gift-money-diary/id6784234386)), dan Arisan Ceria, yang hanya mengundi pemenang, 2,13 dari 8 ulasan ([App Store](https://apps.apple.com/id/app/arisan-ceria/id6742703765)). Arisan sendiri adalah tabungan bergilir ([Wikipedia](https://en.wikipedia.org/wiki/Arisan)), dan Jago sudah punya Kantong Arisan. Tidak ketemu sumber yang mengonfirmasi bahwa pasangan Indonesia merasa sulit melacak kondangan atau arisan: `[UNVERIFIED]`. **Saran:** satu tabel kecil "orang dan momen" (siapa, acara, tanggal, jumlah masuk/keluar, catatan) plus pengingat ulang tahun dan ulang tahun nikah. Arisan diserahkan ke grup WhatsApp atau Kantong Arisan kecuali kalian memang menjalankannya. **Validasi dengan kalian dulu** sebelum dibuat.

**H13 Jurnal dan kenangan.** Day One punya enkripsi dan ekspor ([dayoneapp.com](https://dayoneapp.com/)). Between berpindah pemilik: diakuisisi SoCar pada 2018 ([The Bridge](https://thebridge.jp/2018/07/socar-acquires-vcnc)); menurut Asiae setelah masuk Krafton dan digabung ke Thingsflow, kebijakan privasinya berubah dan pesan pengguna dikumpulkan untuk riset AI ([Asiae, 2022](https://view.asiae.co.kr/en/article/2022051815010915714), klaim sesuai artikel). Isi relasi (pertanyaan harian, latihan) sudah dilayani Paired ([paired.com](https://www.paired.com/)) dan Gottman Card Decks, yang oleh seorang terapis disebut "Genuinely useful. Free" sebagai pelengkap ([blog praktik](https://www.southdenvertherapy.com/blog/do-relationship-apps-work-therapist-review)). **Saran:** serahkan konten relasi. Foto di album Google Photos atau iCloud. Satu timeline teks ("kita") dengan ekspor adalah beberapa jam kerja bila diinginkan.

**H14 Lain-lain.** Servis kendaraan lipat ke H3 dengan satu kolom kilometer (contoh app: [CARFAX Car Care](https://apps.apple.com/us/app/carfax-car-care/id552472249), fokus AS). Pengelolaan janji kesehatan dan hewan peliharaan: hanya app telehealth yang ketemu, tidak ada bukti kebutuhan bersama: `[UNVERIFIED]`. PBB tahunan tidak diteliti: `[UNVERIFIED]`.

### 4.3 Layak di app privat dua orang vs lebih baik di app yang ada

| Kategori | Putusan | Catatan |
|---|---|---|
| Tagihan/perpanjangan, target tabungan, orang dan momen, indeks dokumen | **App privat** | Tabel kecil, pemicu jelas, tidak butuh integrasi |
| Pengeluaran bersama | **Mungkin** | Setelah dua yang di atas stabil; risiko berhenti tinggi |
| Tugas rumah | **Mungkin, kecil** | Varian tagihan berulang |
| Anggaran renovasi atau perjalanan | **Pakai ulang modul anggaran** | Tanpa kode baru bila model generik (§7) |
| Daftar belanja, kalender bersama, brankas scan, kalkulator KPR, itinerary, konten relasi, wishlist | **App yang ada** | Sambungkan lewat link, `.ics`, atau CSV |

---

## 5. Kebutuhan lintas fitur

### 5.1 Reminder dan notifikasi

Tangga dari yang paling murah. Naik anak tangga hanya bila anak tangga sebelumnya terbukti kurang.

| # | Saluran | Infrastruktur | Fakta platform | Putusan |
|---|---|---|---|---|
| 1 | Layar "Minggu ini" (W3) | Tidak ada | – | **Mulai di sini.** Sesi mingguan jadi jangkar (§1.2 #5) |
| 2 | Tombol "Tambah ke kalender" per item (`.ics` dibuat di client, dengan alarm `VALARM`) | Tidak ada di server | `VEVENT`/`VTODO` dan `VALARM` didefinisikan di [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html). Pengingat ditangani kalender HP | **Kedua.** Pengganti push yang paling murah (brainstorm, backlog 1) |
| 3 | Feed `.ics` berlangganan | Endpoint baca-saja | Google hanya menerima langganan URL lewat browser komputer; interval refresh tidak dipublikasikan ([Google](https://support.google.com/calendar/answer/37100?hl=en)). Apple Calendar di Mac punya menu Auto-refresh ([Apple](https://support.apple.com/en-au/guide/calendar/icl1022/16.0/mac/26)); kalender langganan baca-saja | Nanti (§6). Jangan menjanjikan sinkron instan |
| 4 | Bagikan ke WhatsApp (tombol, dipicu pengguna) | Tidak ada | Format `wa.me/<nomor>?text=` dari [FAQ WhatsApp](https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat/). Teks terisi di chat; apakah terkirim otomatis tidak terkonfirmasi (FAQ terpotong): `[UNVERIFIED]`, tes di HP | Bagus untuk berbagi rundown dan ringkasan, bukan untuk reminder otomatis |
| 5 | Bot Telegram dari cron | Cron + secret | Pesan bot gratis; pada satu chat hindari lebih dari satu pesan per detik ([Telegram FAQ](https://core.telegram.org/bots/faq)). Pengguna harus memulai chat dengan bot (inferensi; belum dicek di dokumen) | Mudah, tapi hanya bila kalian berdua memang memakai Telegram |
| 6 | Email digest | Cron + email | Mengirim ke alamat tujuan terverifikasi di akun gratis di semua paket; mengirim ke alamat sembarang hanya Paid; Email Service masih Beta ([Email Routing](https://developers.cloudflare.com/email-routing/), [Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)). Apakah domain di Cloudflare wajib: `[UNVERIFIED]` | Pilihan murah untuk digest mingguan |
| 7 | Web Push | Cron + VAPID + enkripsi payload | iOS hanya untuk web app yang ditambahkan ke Home Screen, dan izin diminta lewat interaksi pengguna ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). VAPID: [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292.html); enkripsi: [RFC 8291](https://www.rfc-editor.org/rfc/rfc8291.html); primitif ada di WebCrypto Workers ([docs](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)) | Nanti, hanya bila 1 sampai 6 kurang. Effort M |

**Batas cron di paket gratis:** 5 Cron Trigger per akun (dihitung bersama Worker lain di akun yang sama), CPU 10 ms per run, berjalan dalam UTC ([limits](https://developers.cloudflare.com/workers/platform/limits/), [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)). Satu cron mingguan cukup untuk digest; Minggu 20.00 WIB = 13.00 UTC.

**Aturan nudge** (§1.3): maksimal satu pengingat spesifik yang terikat kejadian. Jangan kirim notifikasi yang cuma berisi "buka app". Apple HIG memperingatkan pengguna mematikan semua notifikasi bila terlalu sering ([HIG](https://developer.apple.com/design/human-interface-guidelines/notifications)).

### 5.2 Pencarian

Satu kolom cari di atas semua `items`, disaring di client (`includes`, tanpa mesin pencari). Jumlah data hanya ribuan baris. Menghindari pencarian di server juga menghindari batas ekspor D1: tabel virtual seperti FTS5 tidak didukung `wrangler d1 export` dan harus dihapus dulu ([D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)).
Effort S. Platform: client.

### 5.3 Lampiran dan foto

- **Mulai dengan kolom link** ke Drive/Photos (W15). Murah, tanpa platform baru.
- **Unggahan butuh R2.** Gratis: 10 GB-bulan, 1 juta operasi Class A dan 10 juta Class B per bulan, egress gratis ([R2 pricing](https://developers.cloudflare.com/r2/pricing/)). Mengaktifkannya lewat checkout "R2 subscription" ([R2 get started](https://developers.cloudflare.com/r2/get-started/)). Apakah metode pembayaran wajib tidak disebut di docs: `[UNVERIFIED]`. Brainstorm §3.2 menyimpulkan perlu. Konfirmasi ke worker stack sebelum bergantung padanya.
- **Jangan simpan file di D1.** Batas satu baris, string, atau blob adalah 2 MB ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)).
- **Foto album bersama:** Google Photos Library API sejak 31 Maret 2025 hanya mengakses item yang dibuat oleh app itu sendiri ([Google](https://developers.google.com/photos/support/updates)). Memilih foto pengguna lewat Picker API dengan sesi dan `pickerUri` ([panduan](https://developers.google.com/photos/picker/guides/get-started-picker)). Jadi album foto tetap di Google Photos/iCloud, app hanya menyimpan link.
- **Bila suatu hari unggah ditambahkan** (bukti bayar, kontrak): kompres di client, nama file acak, otorisasi sebelum akses ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)), metadata `item` memegang SHA-256, mime, ukuran. Effort L karena menyentuh R2, akses tertanda, dan sync. Ini yang membuat W15b (unggahan) ditunda (§7).

### 5.4 Ekspor dan backup

**Alasan:** produk pasangan dan rumah tangga sering berhenti atau berganti tangan, dengan pemberitahuan antara kira-kira dua sampai lima bulan, kadang tanpa tombol ekspor.

| Produk | Yang terjadi | Sumber |
|---|---|---|
| Mealime | Tutup 21 Okt 2026; "All personal data will be deleted when the Mealime application is shut down." Satu sumber pihak ketiga menyebut tidak ada ekspor | [Mealime](https://www.mealime.com/closing), [Pann](https://www.pann-app.com/blog/is-mealime-shutting-down) |
| Zeta | Acorns mengumumkan akuisisi aset 24 Jun 2025; tanggal tutup 9 Mei 2025 hanya dari blog pesaing `[UNVERIFIED]` | [Acorns](https://acorns.com/learn/acorns-zeta-acquisition/), [Pocket Clear](https://pocketclear.app/blog/zeta-app-alternative-couples.html) |
| Mint | Intuit menutup Mint dan mengarahkan ke Credit Karma; diumumkan 1 Nov 2023, tutup digeser ke 23 Mar 2024. Klaim budget tidak ikut pindah hanya dari snippet: `[UNVERIFIED]` | [Wikipedia](https://en.wikipedia.org/wiki/Mint.com) |
| Google Trips | Dihentikan 5 Agt 2019, diganti Google Travel dan Maps | [MobileSyrup](https://mobilesyrup.com/2019/06/04/google-trips-shutdown-august-5-2019/) |
| Wunderlist | Diumumkan 6 Des 2019, tutup 6 Mei 2020, impor ke Microsoft To Do | [Wikipedia](https://en.wikipedia.org/wiki/Wunderlist) |
| Tuned (Meta) | Pengguna diminta mengunduh data sebelum 19 Sep 2022 | [Slashdot](https://tech.slashdot.org/story/22/07/25/2049239/meta-is-shutting-down-tuned-its-social-app-for-couples) |
| Couple (dulu Pair) | Tidak aktif sejak 22 Apr 2019 | [Wikipedia](https://en.wikipedia.org/wiki/Couple_(app)) |
| OurHome | Dihentikan; "The mobile apps are unavailable, and the website is not secure anymore." | [AlternativeTo](https://alternativeto.net/software/ourhome/about/) |
| Between | Berganti pemilik 2018, 2021, 2022; kebijakan privasi berubah menurut Asiae | [The Bridge](https://thebridge.jp/2018/07/socar-acquires-vcnc), [Asiae](https://view.asiae.co.kr/en/article/2022051815010915714) |

**Yang disediakan app** (dibangun bertahap; yang pertama S):
1. Tombol "Unduh cadangan" yang dijalankan client: baca semua baris, hasilkan `export.json` (lossless) dan satu CSV per jenis item. Effort S.
2. `calendar.ics` untuk item bertanggal dan `contacts.vcf` untuk vendor (§6). Effort S.
3. `database.sql` dari `wrangler d1 export` sebagai salinan pemulihan bencana. Ini perintah CLI, bukan API yang bisa dipanggil Worker; selama ekspor berjalan, permintaan lain diblokir; angka numerik terkena presisi 52-bit JavaScript ([D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)).
4. Sebagai pengaman: D1 Time Travel mengembalikan database sampai 7 hari di paket Free dan 30 hari di Paid ([Cloudflare](https://developers.cloudflare.com/d1/reference/time-travel/)). Tujuh hari tidak cukup sebagai arsip.
5. Simpan satu salinan **di luar Cloudflare** (laptop atau Drive pribadi). Jadwalkan sebagai tugas berulang "backup bulanan" di H3, supaya app memakai fiturnya sendiri.

Model yang sudah dipercaya pengguna: Google Takeout bisa dijadwalkan setiap dua bulan selama setahun ([Google](https://support.google.com/accounts/answer/3024190)).

### 5.5 Impor

- **Sekali jalan dari spreadsheet lama:** skrip yang membaca ODS dan menghasilkan SQL; data dan keluarannya disimpan di luar repo publik (brainstorm §7). Ini bukan fitur produk.
- **Impor CSV generik:** satu pemetaan kolom → `items` untuk daftar tamu (Joy dan Zola menawarkan hal serupa: [Joy](https://withjoy.com/help/en/articles/8309207-importing-and-exporting-your-guest-list), [Zola](https://www.zola.com/faq/360038289992-How-do-I-add-guests-from-a-spreadsheet-to-my-guest-list-)) dan, kelak, pengeluaran. Normalisasi nomor HP ke `+62...` (nomor disimpan sebagai angka di sheet lama: brainstorm §1.8). Deduplikasi dengan ID atau kunci kombinasi. Effort S sampai M.
- **Mutasi bank:** BCA menyediakan e-statement lewat myBCA, myBCA web, dan KlikBCA ([BCA, 18 Des 2025](https://www.bca.co.id/id/informasi/news-and-features/2025/12/18/09/09/Akses-Mutasi-Rekening-Kini-Lebih-Praktis-dan-Mudah)). Format untuk nasabah individu tidak disebut, dan bank lain tidak dicek: `[UNVERIFIED]`. Jangan membangun parser sebelum ada contoh berkas nyata.
- **Impor dari Splitwise, YNAB, Money Manager:** dokumentasi ekspor CSV tidak ketemu: `[UNVERIFIED]`. Splitwise dan YNAB punya API ([Splitwise](https://dev.splitwise.com/), [YNAB](https://api.ynab.com/)) tapi itu integrasi, bukan impor. Tidak dibuat.

### 5.6 Offline

Rancangan sinkron dan offline ada di brainstorm §5 (shell dengan Service Worker, IndexedDB sebagai sumber data UI, antrean `outbox`, ID dibuat di client, pull berbasis `rev`). Di sini hanya kebutuhan per fitur:

| Perlu baca offline | Perlu tulis offline |
|---|---|
| Rundown (W20), buku vendor (W11), checklist KUA (W5), "Minggu ini" (W3), daftar tamu (W16) | Capture cepat: tugas (W2), pembayaran dicentang (W13), tagihan dicentang (H3), buku amplop saat acara (W25) |

Fakta iOS yang mempengaruhi desain (diverifikasi di brainstorm, bukan di sini): data web app di Home Screen tidak dihapus oleh aturan ITP 7 hari ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)); Background Sync tidak didukung Safari dan Firefox ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)), jadi outbox terkirim hanya saat app dibuka. Effort total ada di sisi platform, bukan di fitur.

### 5.7 Bahasa Indonesia, tanggal, uang, dan Hijri

Hasil di bawah dites lokal (Node v26.10.0, ICU 78.3). Browser target bisa berbeda, jadi tes ulang di Chrome Android dan Safari iOS.

| Hal | Hasil / aturan | Catatan |
|---|---|---|
| Bahasa UI | Indonesia santai, semua teks di satu berkas | Tanpa pustaka i18n (belum ada kebutuhan bahasa kedua) |
| Rupiah | `new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR"}).format(600000)` menghasilkan `Rp 600.000` dengan spasi non-breaking; tanpa desimal | Format ringkas membulatkan (`59 jt` untuk 58.500.000), jangan dipakai untuk uang |
| Konflik ISO | Daftar ISO 4217 (SIX, terbit 2026-09-17) mencantumkan IDR dengan **minor unit 2** ([list-one.xml](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml)). MDN: format mata uang memakai digit ISO secara default ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat)). Tapi tes lokal menunjukkan 0 desimal untuk IDR di `id-ID` | Jangan menebak penyebabnya. Keputusan penyimpanan di §6 |
| Tanggal | `6 Okt 2026` (medium), `6 Oktober 2026` (long), `Selasa, 06 Oktober 2026` (full), `06/10/2026` | Penulisan resmi umumnya tanggal-nama bulan-tahun atau dd/mm/yyyy; aturan resminya tidak ketemu: `[UNVERIFIED]` |
| Jam | `12.00` dengan titik sebagai pemisah | |
| Zona waktu | WIB UTC+7, WITA UTC+8, WIT UTC+9, tanpa DST ([Wikipedia](https://id.wikipedia.org/wiki/Waktu_di_Indonesia), sekunder) | Simpan nama IANA (`Asia/Jakarta`, `Asia/Makassar`, `Asia/Jayapura`), bukan singkatan; singkatan tergantung locale: `12.00 WIB`, `13.00 WITA`, `14.00 WIT` untuk instan yang sama |
| Hijri | Lima kalender Islam di runtime uji. Untuk 6 Okt 2026: `islamic` 25, `islamic-umalqura` 25, `islamic-civil` 23, `islamic-tbla` 24, `islamic-rgsa` 25 Rabiulakhir 1448 | Selisih sampai 2 hari pada tanggal yang sama. MDN mencantumkan `islamic-civil`, `islamic-tbla`, `islamic-umalqura` ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/supportedValuesOf)) tapi tidak `islamic-rgsa` |
| Awal Ramadan 1447 | `islamic-umalqura`, `-civil`, `-rgsa`, `islamic`: 18 Feb 2026; `islamic-tbla`: 17 Feb 2026 | Perbandingan algoritma, bukan tanggal resmi Indonesia |
| Bulan Hijriah resmi | Kemenag menetapkan lewat sidang isbat ([Wikipedia](https://id.wikipedia.org/wiki/Sidang_isbat), sekunder). Kriteria MABIMS terbaru (3 derajat tinggi, 6,4 derajat elongasi) tidak berhasil disumberkan: `[UNVERIFIED]` | Algoritma di browser bisa meleset satu hari dari keputusan Kemenag |
| Libur nasional | SKB 3 Menteri tiap tahun; 2026: 17 libur nasional dan 8 cuti bersama ([Setneg](https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026)). Tidak ada dataset terbuka resmi yang ketemu. Repo tidak resmi [APIHariLibur_V2](https://github.com/guangrei/APIHariLibur_V2) bersumber dari Google Calendar, lisensi GPL-3.0 | Seed manual per tahun yang bisa diedit. Jangan bergantung pada API tidak resmi |
| Weton/hari baik | Praktik Jawa yang opsional ([Wikipedia](https://id.wikipedia.org/wiki/Weton), sekunder) | Catatan opsional per tanggal, bukan pembatas jadwal |

**Putusan:** Hijri hanya ditampilkan di samping tanggal, berlabel "perkiraan", dengan pilihan kalender dan offset manual ±1-2 hari. **Tidak dipakai menghitung tenggat hukum.** Effort S, satu panggilan `Intl`.

### 5.8 Privasi dan dokumen sensitif

Repo publik dan data dua orang. Dua lapis: apa yang disimpan, dan bagaimana melindunginya.

**Hukum (bukan nasihat hukum).** UU 27/2022 tentang Pelindungan Data Pribadi, ditetapkan 17 Oktober 2022 ([BPK](https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022)). Pasal 2 ayat (2): "Undang-Undang ini tidak berlaku untuk pemrosesan Data Pribadi oleh orang perseorangan dalam kegiatan pribadi atau rumah tangga." Pasal 4 ayat (2) menggolongkan data kesehatan, biometrik, genetika, catatan kejahatan, data anak, dan data keuangan pribadi sebagai "spesifik" ([teks, pasal.id](https://pasal.id/peraturan/uu/uu-no-27-tahun-2022), situs pihak ketiga). Bacaan penulis: dua orang yang menyimpan data untuk pernikahan dan rumah tangga mereka sendiri tampak masuk pengecualian itu. Interpretasi ini `[UNVERIFIED]` terhadap penegakan. Tidak ketemu peraturan pelaksana. Tidak ada panduan resmi soal menyimpan NIK.

**Kebijakan default:**

| Golongan | Isi | Putusan |
|---|---|---|
| Hijau | Tanggal, status siap dokumen, nama vendor dan kontak bisnis, harga, jadwal bayar, catatan | Simpan |
| Kuning | Nomor HP tamu dan vendor (dibutuhkan untuk ketuk-telepon), nama tamu, jumlah amplop dan tabungan | Simpan, tapi tidak masuk repo dan tidak ada di data uji |
| Merah | NIK, scan KTP/KK/paspor/buku nikah, hasil pemeriksaan kesehatan atau Elsimil, data anak, nomor rekening pribadi dan PIN | **Jangan simpan di app.** Gunakan boolean "sudah siap", tanggal, lokasi fisik |

Catatan: KK memuat data anggota keluarga termasuk anak, dan hasil pemeriksaan kesehatan termasuk "spesifik" (bacaan penulis).

**Jika suatu hari scan ingin disimpan** (opsi, bukan rekomendasi):

| Opsi | Memberi | Biaya |
|---|---|---|
| Enkripsi di sisi server (bawaan R2 dan D1: AES-256 saat disimpan: [R2](https://developers.cloudflare.com/r2/reference/data-security/), [D1](https://developers.cloudflare.com/d1/reference/data-security/)) | Tanpa usaha | Cloudflare memegang kunci. Akun yang dibobol membuka isi |
| Brankas yang ada (Bitwarden: lampiran terenkripsi 5 GB, emergency access, $1,65/bulan: [harga](https://bitwarden.com/pricing/)) | Matang, ada akses darurat | Biaya kecil; di luar app |
| Enkripsi di client: AES-GCM dengan kunci turunan PBKDF2 ([AES-GCM](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt), [PBKDF2](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey); OWASP menyarankan 600.000 iterasi PBKDF2-HMAC-SHA256: [cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)) | Server tidak pernah melihat isi | **Passphrase hilang berarti data hilang.** Argon2 tidak ada di WebCrypto (hanya draft WICG: [draft](https://wicg.github.io/webcrypto-modern-algos/)); tidak bisa dicari atau di-OCR di server |
| Dua salinan kunci data (satu per pasangan, atau passphrase + passkey) | Selamat dari kehilangan satu rahasia | Lebih banyak bagian bergerak; kode pemulihan cetak harus disimpan aman |
| Re-auth WebAuthn sebelum membuka brankas (`userVerification: "required"`: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)) | HP tidak terkunci yang dicuri tidak membuka brankas | Gerbang tingkat app saja; bukan enkripsi. Dukungan ekstensi `prf` per browser tidak dicek: `[UNVERIFIED]` |

Aturan praktis: enkripsi dan re-auth adalah lapisan berbeda. Gerbang WebAuthn menentukan siapa membuka UI; hanya enkripsi di client yang menentukan siapa membaca byte tersimpan. Sesi Cloudflare Access (jika dipakai di lapisan masuk) dapat diatur antara 15 menit sampai satu bulan, default 24 jam ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)).

**Item "privat untuk saya"** (kejutan hadiah, bulan madu): studi menunjukkan pasangan berbagi data tapi mengharapkan privasi pada jenis konten tertentu ([Jacobs dkk., GROUP 2016](https://dl.eusset.eu/items/5aee07df-e566-4a00-99da-15cb6e0b986d/full), abstrak). Menambahkannya menyentuh sync dan ekspor: baris privat harus disaring di server, bukan di client. Hanya dibuat bila diminta (§8).

---

## 6. Rancangan siap-integrasi

Tidak ada integrasi yang dibangun. Yang diputuskan sekarang hanya hal yang mahal diubah belakangan.

### 6.1 Keputusan yang diambil sekarang

| # | Keputusan | Pilihan yang disarankan | Alasan | Sumber |
|---|---|---|---|---|
| 1 | **ID** | Dibuat di client, teks opak. Pakai `crypto.randomUUID()` (UUID v4) | Item punya ID sebelum sinkron pertama; kirim ulang tidak menggandakan baris; impor ulang bisa dideduplikasi. RFC 9562 menyarankan UUIDv7 dibanding v1/v6 karena v4 punya lokalitas indeks yang buruk, tapi pada ribuan baris itu tidak terasa; karena ID opak, format baru boleh bercampur nanti. Token rahasia (feed `.ics`) harus acak: v4 atau byte acak | [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562.html), [MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID) (hanya v4) |
| 2 | **Waktu** | Instan: RFC 3339 UTC dengan `Z`. Tanggal saja: `YYYY-MM-DD`. Waktu setempat: pasangan (waktu lokal, nama zona IANA) hanya di mana makna lokal penting | Cocok dengan `DTSTAMP`, `LAST-MODIFIED`, dan format ekspor lain | [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html), [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html) |
| 3 | **Uang** | Integer rupiah utuh + kode mata uang per baris (default `IDR`), tidak pernah float | Seluruh UI memakai rupiah utuh. Menyimpang dari ISO 4217 yang memberi IDR minor unit 2: integrasi berbasis ISO (mis. API pembayaran yang memakai minor unit) perlu konversi ×100. Pilihan lain: simpan `amount_minor` ×100 (ISO-setia, sama dengan bentuk API Stripe: [Stripe](https://docs.stripe.com/currencies)); lebih rumit untuk rumah tangga satu mata uang. Apa pun pilihannya, tulis di skema ekspor | [ISO 4217 (SIX)](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml); batas aman integer 2^53-1 jauh di atas kebutuhan ([MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER)) |
| 4 | **Telepon** | `+<kode negara><digit>` (E.164). Buang `+` hanya saat membuat link `wa.me` | Format sama untuk `tel:`, `wa.me`, vCard | [ITU E.164](https://www.itu.int/rec/T-REC-E.164/en); batas 15 digit dari sumber primer tidak berhasil dikonfirmasi: `[UNVERIFIED]` |
| 5 | **Umpan perubahan** | Tiap baris: `rev` naik-terus, `updated_at`, `updated_by`, `deleted_at` (tombstone), seperti desain sync brainstorm. Itu sudah umpan perubahan yang bisa ditarik (`WHERE rev > ?`) oleh konsumen mana pun. **Tabel `events` append-only** (bentuk selaras CloudEvents: `id`, `source`, `type`, `time`, `subject`, `data`) diputuskan bentuknya sekarang, dibuat saat konsumen pertama muncul | Riwayat sebelum ada konsumen nilainya rendah (YAGNI). Pola outbox: tulis pesan di transaksi yang sama dengan perubahan data; konsumen harus idempoten dengan melacak ID | [CloudEvents](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md), [pola outbox](https://microservices.io/patterns/data/transactional-outbox.html) |
| 6 | **Format ekspor** | `export.json` memuat `format_version` dan `$schema` (JSON Schema 2020-12); satu CSV per jenis item dengan nama kolom sama dengan JSON; `calendar.ics`; `contacts.vcf`. Bangun JSON dan CSV dulu (S) | JSON lossless; CSV nyaman. RFC 4180: CSV memakai CRLF dan tanda kutip ganda untuk field yang berisi koma, kutip, atau baris baru | [JSON Schema](https://json-schema.org/specification), [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180.html) |
| 7 | **Umpan kalender** | UID = ID item; SEQUENCE dari `rev`; LAST-MODIFIED dari `updated_at`; item tanpa jam sebagai tanggal-saja (all-day); tugas sebagai `VTODO` dengan `DUE`; baca-saja; URL stabil dengan token acak di path | UID adalah identifier yang global dan persisten; SEQUENCE adalah penghitung revisi | [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html). Untuk kalender secara keseluruhan, RFC 7986 menambah `REFRESH-INTERVAL` yang hanya petunjuk ([RFC 7986](https://www.rfc-editor.org/rfc/rfc7986.html)) |
| 8 | **vCard vendor** | UID = ID item; `KIND:org` untuk perusahaan | `VERSION:4.0` dan `FN` wajib | [RFC 6350](https://www.rfc-editor.org/rfc/rfc6350.html) |
| 9 | **Bentuk webhook** (tidak dibuat) | Tanda tangan HMAC-SHA256 atas `msg_id.timestamp.payload`, header `webhook-id`, `webhook-timestamp`, `webhook-signature`; payload `type`, `timestamp`, `data` | Selaras dengan spesifikasi yang sudah ada, tanpa desain ulang | [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) |
| 10 | **Lampiran** | Item merujuk berkas lewat ID, SHA-256, mime, ukuran. Blob terenkripsi di client tetap opak | Ekspor dan impor bisa memeriksa integritas | – |
| 11 | **Rahasia integrasi** | Token pihak ketiga tidak disimpan sebagai teks biasa di D1 | Ekspor dan backup tidak boleh membawa kredensial | – |

Tidak ditambahkan sekarang: kolom `external_refs` atau tabel integrasi. Menambah kolom nanti murah; yang mahal adalah mengubah arti ID, waktu, dan uang, dan itu sudah diputuskan di atas.

### 6.2 Fakta Google yang membatasi integrasi

- Aplikasi OAuth berstatus Testing: sampai 100 pengguna uji, otorisasi dari pengguna uji kedaluwarsa dalam 7 hari ([Google Cloud Help](https://support.google.com/cloud/answer/15549945)); refresh token berumur 7 hari ([Google Identity](https://developers.google.com/identity/protocols/oauth2)). Produksi tanpa verifikasi menampilkan layar peringatan bila cakupan sensitif.
- Cakupan Drive `drive.file` dan `drive.appdata` tidak sensitif; `drive` dan `drive.readonly` adalah restricted ([Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)). Klasifikasi cakupan Calendar tidak diverifikasi dengan baik: `[UNVERIFIED]` ([Calendar auth](https://developers.google.com/workspace/calendar/api/auth)).
- Artinya: integrasi Google di luar login butuh login ulang mingguan atau layar peringatan. Ini fakta platform, bukan rekomendasi. Keputusan login ada di worker stack.

### 6.3 Kandidat integrasi masa depan: hanya kelayakan

Skala: **murah**, **sedang**, **sulit**, **tidak layak** (untuk app pribadi dua orang di paket gratis).

| Integrasi | Memberi | Cara | Hambatan | Putusan | Sumber |
|---|---|---|---|---|---|
| Google Calendar: langganan `.ics` | Tenggat muncul di kalender kedua HP, baca-saja | Feed `text/calendar` di URL rahasia | Google menolak langganan dari app mobile; refresh tidak dipublikasikan (§5.1) | **Murah** | [Google](https://support.google.com/calendar/answer/37100?hl=en) |
| Google Calendar: API | Dua arah, instan | REST + OAuth | Aplikasi Testing/unverified (§6.2); push butuh endpoint HTTPS dan pembaruan kanal manual | Sedang | [Calendar API](https://developers.google.com/workspace/calendar/api/auth) |
| Google Sheets | Tampilan atau cadangan CSV | `IMPORTDATA(url)` dari URL CSV rahasia; API untuk tulis | URL CSV harus bisa diakses tanpa login; API butuh OAuth | **Murah** (CSV), sedang (API) | [Sheets](https://developers.google.com/workspace/sheets/api/limits) (batas tertera: 300 baca dan 300 tulis per menit per proyek, 60 per menit per pengguna) |
| Google Contacts (People API) | Sinkron kontak vendor | `people.connections.list` | OAuth; alternatif tanpa API: ekspor/impor vCard | Sedang | [People API](https://developers.google.com/people/api/rest/v1/people.connections/list) |
| Google Photos | Melampirkan foto terpilih | Picker API | Library API hanya item buatan app sejak 31 Mar 2025 (§5.3) | Sedang (pilih), **tidak layak** (jelajah pustaka) | [Google](https://developers.google.com/photos/support/updates) |
| Google Drive | Target backup | Drive API dengan `drive.file` | Manajemen token OAuth | Sedang | [Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) |
| Notion | Cermin catatan atau tugas | REST + token internal | Halaman harus dibagikan manual ke integrasi; batas 180 permintaan per menit di paket non-Business | Sedang | [Notion](https://developers.notion.com/reference/request-limits) |
| Telegram | Notifikasi gratis ke dua HP | `sendMessage` via HTTPS dari cron | Keduanya harus memakai Telegram; token itu rahasia | **Murah** | [Telegram](https://core.telegram.org/bots/faq) |
| WhatsApp: link klik-ke-chat | Membuka chat dengan teks terisi | `wa.me` | Hanya membuka chat | **Murah** | [WhatsApp](https://faq.whatsapp.com/general/chats/how-to-use-click-to-chat/) |
| WhatsApp Business Platform | Pesan otomatis | Cloud API | Harga per pesan sejak 1 Jul 2025, nomor yang sudah dipakai WhatsApp harus dihapus dulu, wajib opt-in, butuh portofolio bisnis dan template | **Sulit**, tidak realistis untuk pemakaian pribadi | [Harga](https://developers.facebook.com/docs/whatsapp/pricing/), [nomor](https://developers.facebook.com/docs/whatsapp/cloud-api/phone-numbers), [kebijakan](https://whatsappbusiness.com/id/policy/). Klausul "hanya untuk bisnis": `[UNVERIFIED]` |
| Email dari Worker | Digest ke dua alamat | `send_email` | Alamat tujuan harus terverifikasi; Email Service Beta | **Murah** | [Email Service](https://developers.cloudflare.com/email-service/platform/pricing/) |
| Web Push | Notifikasi native | Push API + VAPID | iOS hanya dari Home Screen; Worker harus mengerjakan enkripsi | Sedang | [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) |
| Web Share Target | Berbagi ke app dari WhatsApp, dll. | `share_target` di manifest | Chrome 76+ Android dan 89+ desktop dan harus terpasang; bug WebKit 194593 masih terbuka | **Murah** di Android, **tidak layak** di iOS | [Chrome](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target), [WebKit bug](https://bugs.webkit.org/show_bug.cgi?id=194593) |
| Data bank Indonesia | Impor transaksi otomatis | SNAP, agregator, atau berkas mutasi | Akses konsumen ke SNAP tidak tampak; Plaid tidak mencantumkan Indonesia (§4) | **Tidak layak** otomatis; impor berkas manual sedang sampai sulit | [ASPI](https://apidevportal.aspi-indonesia.or.id/), [Plaid](https://plaid.com/docs/institutions/) |
| QRIS | Tidak ada data pribadi | – | Standar kode QR pembayaran, bukan umpan transaksi pembayar (inferensi; halaman BI mengembalikan 404 sehingga `[UNVERIFIED]`) | **Tidak layak** | [EMVCo](https://www.emvco.com/emv-technologies/qrcodes/) |
| Libur nasional | Hitungan hari kerja | Seed tahunan dari SKB | Tidak ada API resmi | **Murah** (seed manual) | [Setneg](https://setneg.go.id/baca/index/inilah_skb_3_menteri_libur_nasional_dan_cuti_bersama_2026) |
| Home Assistant, IFTTT | Memicu otomasi rumah | Webhook HTTP | HA: hanya jaringan lokal secara default; IFTTT: webhook butuh Pro ($2,99/bulan) | HA sedang; IFTTT tidak gratis | [Home Assistant](https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger), [IFTTT](https://ifttt.com/plans) |
| OCR struk | Ekstrak teks dari foto | Workers AI model visi | 10.000 neuron per hari di paket gratis; tidak ada model OCR khusus yang teridentifikasi; akurasi tidak diuji | Sedang | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [model](https://developers.cloudflare.com/workers-ai/models/) |
| Impor Splitwise/YNAB | Pengeluaran lama | API atau CSV | API ada; dokumentasi CSV tidak ketemu | Murah bila CSV ada, jika tidak sedang | [Splitwise](https://dev.splitwise.com/), [YNAB](https://api.ynab.com/) |

### 6.4 Kebutuhan platform per kelas fitur

Hanya fakta untuk dicocokkan dengan keputusan stack worker lain (paket gratis, dicek 2026-10-06).

| Kelas fitur | Storage | Push | File | Cron | Realtime |
|---|---|---|---|---|---|
| Daftar, tugas, catatan | D1 | opsional | tidak | tidak | opsional |
| Reminder | D1 | Web Push (iOS: terpasang) atau Telegram/email | tidak | ya (5 slot per akun) | tidak |
| Anggaran, pembayaran, pengeluaran | D1 (integer) | opsional | R2 untuk bukti bayar | digest bulanan | tidak |
| Dokumen | D1 untuk indeks | tidak | R2 + enkripsi client bila scan | tidak | tidak |
| Umpan kalender | D1 | tidak | tidak | opsional | tidak |
| Ko-editing langsung | D1 + Durable Object | tidak | tidak | tidak | ya (WebSocket) |

| Kapabilitas | Batas paket gratis | Sumber |
|---|---|---|
| Workers | 100.000 permintaan per hari; CPU 10 ms per permintaan dan per cron; 5 cron per akun | [limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Static assets | Permintaan aset statis gratis dan tanpa batas; 20.000 berkas per versi, 25 MiB per berkas | [static assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| D1 | 5 juta baris dibaca per hari; 100.000 baris ditulis per hari; 5 GB total; 500 MB per database; 50 query per invokasi; 2 MB per baris/string/blob | [pricing](https://developers.cloudflare.com/d1/platform/pricing/), [limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 Time Travel | 7 hari (Free), 30 hari (Paid) | [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) |
| R2 | 10 GB-bulan; 1 juta Class A dan 10 juta Class B per bulan; egress gratis; butuh checkout "R2 subscription" | [pricing](https://developers.cloudflare.com/r2/pricing/), [get started](https://developers.cloudflare.com/r2/get-started/) |
| Durable Objects | Hanya SQLite-backed di Free; 100.000 permintaan per hari; WebSocket Hibernation | [pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) |
| Queues | Tersedia di Free; 10.000 operasi per hari | [pricing](https://developers.cloudflare.com/queues/platform/pricing/) |
| KV | 1.000 tulis per hari | [pricing](https://developers.cloudflare.com/kv/platform/pricing/) |
| Workers AI | 10.000 neuron per hari | [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Email | Kirim ke alamat tujuan terverifikasi gratis; alamat sembarang hanya Paid | [Email Service](https://developers.cloudflare.com/email-service/platform/pricing/) |

---

## 7. Roadmap berprioritas

### 7.1 Cara menilai

Tiap fitur dinilai penulis dengan tiga angka. Ini penilaian, bukan data, jadi bantah bila tidak setuju.

- **V (nilai) 1-5:** seberapa kuat pemicu pemakaian (mingguan, padat-sementara, tebus-nilai tinggi: §1.4) dan seberapa besar masalah yang diselesaikan menurut bukti di §2 dan §4.
- **E (effort):** S = 1, M = 2, L = 3.
- **R (risiko) 1-3:** 1 rendah; 2 sedang (aturan bisa usang, ketepatan uang, risiko berhenti); 3 tinggi (privasi, ketergantungan platform, risiko berhenti besar).
- **Skor = 2V − E − R.** Maksimum 8.
- **Tier:** skor ≥ 6 = **Tier 1** (bangun dulu); 4-5 = **Tier 2**; 1-3 = **Tier 3** (tunda, bangun bila diminta); ≤ 0 = **Serahkan atau tidak dibuat**.
- **Pengecualian karena tenggat:** fitur yang punya tenggat hari-H (W5, W6, W20) dijadwalkan menurut kalender, bukan skor.

| ID | Fitur | V | E | R | Skor | Tier |
|---|---|---|---|---|---|---|
| W3 | Layar "Minggu ini" | 5 | S | 1 | 8 | 1 |
| W11 | Buku vendor | 5 | S | 1 | 8 | 1 |
| H3 | Tagihan dan kewajiban berulang | 5 | M | 1 | 7 | 1 (setelah nikah) |
| W16 | Daftar tamu | 5 | M | 1 | 7 | 1 |
| W1 | Hari-H dan countdown | 4 | S | 1 | 6 | 1 |
| W2 | Timeline tugas dari template | 5 | M | 2 | 6 | 1 |
| W8 | Acara sebagai grup | 4 | S | 1 | 6 | 1 |
| W12 | Perbandingan penawaran | 4 | S | 1 | 6 | 1 |
| W13 | Anggaran dan pembayaran | 5 | M | 2 | 6 | 1 |
| W14 | Dana nikah | 4 | S | 1 | 6 | 1 |
| W24 | Checklist pasca-nikah | 4 | S | 1 | 6 | 1 (setelah nikah) |
| X1 | Ekspor JSON dan CSV | 4 | S | 1 | 6 | 1 |
| X2 | Tombol "Tambah ke kalender" (`.ics`) | 4 | S | 1 | 6 | 1 |
| H2 | Target tabungan (pakai ulang W14) | 4 | S | 1 | 6 | 1 (setelah nikah) |
| H4 | Perpanjangan dokumen dan kendaraan | 4 | S | 1 | 6 | 1 (setelah nikah) |
| W25 | Buku amplop masuk | 4 | S | 2 | 5 | 2 (validasi dulu) |
| W4 | Catatan kesepakatan | 3 | S | 1 | 4 | 2 |
| W5 | Checklist KUA bersyarat | 4 | M | 2 | 4 | 2, **berbatas waktu** |
| W9 | Seserahan | 3 | S | 1 | 4 | 2 |
| W15 | Bukti bayar sebagai link | 3 | S | 1 | 4 | 2 |
| W17 | Tracker undangan + WhatsApp | 3 | S | 1 | 4 | 2 |
| W20 | Rundown offline | 4 | M | 2 | 4 | 2, **berbatas waktu** |
| W21 | Bagikan rundown/kontak | 3 | S | 1 | 4 | 2 |
| W26 | Penutupan dan arsip | 3 | S | 1 | 4 | 2 |
| X4 | Pencarian di client | 3 | S | 1 | 4 | 2 |
| H9 | Indeks dokumen (tanpa scan) | 3 | S | 1 | 4 | 2 |
| H10 | Renovasi sebagai proyek (pakai ulang) | 3 | S | 1 | 4 | 2 (bila ada renovasi) |
| W6 | Kalender hari kerja | 3 | S | 2 | 3 | 3, **berbatas waktu** (bersama W5) |
| H7 | Tugas rumah berulang | 3 | S | 2 | 3 | 3 |
| H12 | Orang dan momen (ulang tahun, kondangan keluar) | 3 | S | 2 | 3 | 3 (validasi dulu) |
| X7 | Impor CSV generik | 3 | M | 1 | 3 | 3 |
| W7 | Jalur pranikah | 2 | S | 1 | 2 | 3 |
| W22 | Daftar lagu | 2 | S | 1 | 2 | 3 |
| W23 | Checklist malam sebelum | 2 | S | 1 | 2 | 3 |
| H11 | Perjalanan sebagai proyek | 2 | S | 1 | 2 | 3 |
| H13 | Timeline "kita" | 2 | S | 1 | 2 | 3 |
| X3 | Feed `.ics` berlangganan | 3 | M | 2 | 2 | 3 |
| X5 | Digest mingguan (email/Telegram/push) | 3 | M | 2 | 2 | 3 |
| W18 | Impor RSVP dari layanan undangan | 2 | M | 1 | 1 | 3 |
| H1 | Pengeluaran bersama | 3 | M | 3 | 1 | 3 (risiko berhenti tinggi) |
| W15b | Unggah bukti bayar ke R2 | 3 | L | 3 | 0 | Serahkan (pakai link) |
| H9b | Brankas scan dokumen | 3 | L | 3 | 0 | Serahkan |
| H8 | UI kalender buatan sendiri | 2 | L | 2 | −1 | Serahkan |
| X6 | Item "privat untuk saya" | 2 | M | 3 | −1 | Tunda; hanya bila diminta |
| W19 | Link baca-saja untuk keluarga/WO | 2 | M | 3 | −1 | Tunda; hanya bila diminta |
| H5 | Daftar belanja buatan sendiri | 2 | L | 3 | −2 | Serahkan |

Fitur lintas (`X`) yang muncul di tabel, dengan effort dan platform-nya:

| ID | Fitur | Effort | Platform | Bagian |
|---|---|---|---|---|
| X1 | Ekspor JSON dan CSV | S | client | §5.4 |
| X2 | `.ics` per item | S | client | §5.1 |
| X3 | Feed `.ics` berlangganan | M | D1 + endpoint baca-saja | §5.1, §6.1 |
| X4 | Pencarian di client | S | client | §5.2 |
| X5 | Digest mingguan | M | cron + email, Telegram, atau push | §5.1 |
| X6 | Item "privat untuk saya" | M | D1 (penyaringan di server) | §5.8 |
| X7 | Impor CSV generik | M | client | §5.5 |

### 7.2 Model data terkecil untuk wedding dan household

**Dua pilihan.**

| | Satu model generik (`items`) | Tabel per fitur |
|---|---|---|
| Contoh | Satu tabel `items` dengan kolom `kind`, beberapa kolom bertipe untuk yang dihitung atau disortir, dan satu kolom `data` JSON untuk sisanya | 12 tabel di brainstorm §7: `tasks`, `vendors`, `budget_items`, `payments`, `guests`, `rundown_items`, dan seterusnya, dan tabel baru untuk tiap fitur household |
| Fitur baru | Konfigurasi: daftar kolom, label, total, pengelompokan. Tanpa migrasi | Migrasi baru, whitelist baru di Worker, kode sinkron baru, kode ekspor baru |
| Sinkron | Satu indeks `rev`, satu tabel untuk di-pull | Satu indeks `rev` per tabel |
| Ekspor, impor, integrasi | Seragam: satu bentuk baris, satu umpan perubahan | Satu per tabel |
| Batasan SQL | Lemah per `kind`: `CHECK` hanya yang berlaku umum (`amount >= 0`). Validasi per `kind` dilakukan di kode lewat registry | Kuat: kolom bertipe, `NOT NULL`, `CHECK` per tabel, foreign key sungguhan |
| Kueri | Perlu indeks `(kind, due_on)`; isi `data` tidak bisa diindeks murah | SQL polos dan jelas; agregasi sederhana |
| Risiko | Salah ketik `kind` atau isi JSON diam-diam lolos tanpa registry | Banyak kode berulang; menambah fitur terasa mahal sehingga fitur kecil tidak dibuat |
| Pindah arah nanti | Memindah satu `kind` ke tabel sendiri = satu `INSERT ... SELECT` per `kind` (inferensi penulis) | Menggabung tabel ke generik = lebih banyak kerja (inferensi penulis) |

**Rekomendasi: model generik, dengan satu aturan keluar.** Semua daftar, checklist, dan buku catatan di §3 dan §4 adalah baris dengan beberapa field, status, dan total. Tabel kolom yang dipertahankan sekecil mungkin:

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY, value TEXT,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  parent_id TEXT,
  title TEXT NOT NULL,
  status TEXT,
  group_key TEXT,
  due_on TEXT,
  done_on TEXT,
  amount INTEGER CHECK (amount IS NULL OR amount >= 0),
  qty INTEGER CHECK (qty IS NULL OR qty >= 0),
  who TEXT CHECK (who IS NULL OR who IN ('a', 'b', 'both')),
  note TEXT,
  data TEXT,
  sort REAL NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL, updated_at INTEGER NOT NULL, updated_by TEXT, deleted_at INTEGER
);
CREATE INDEX items_rev ON items (rev);
CREATE INDEX items_kind_due ON items (kind, due_on);
CREATE INDEX items_parent ON items (parent_id);
```

Ini sketsa, bukan skema final; konvensi sync (`rev`, tombstone, `sort` REAL) mengikuti brainstorm §5 dan §7. `who` berisi `a`/`b`/`both`, dipetakan ke dua akun masuk di server atau `settings` yang tidak masuk repo. Proyek (pernikahan, renovasi, perjalanan) adalah baris `kind = project`, dan `project_id` menunjuk ke situ, jadi tidak perlu tabel `projects`.

**Registry `kind`** (satu objek di kode, dipakai client dan Worker untuk validasi, pembuatan layar daftar, dan total):

| `kind` | Dipakai oleh | Kolom yang bermakna | Isi `data` |
|---|---|---|---|
| `project` | semua | `title`, `status` (aktif/arsip) | – |
| `task` | W2, W5, W7, W23, W24, H7 | `due_on`, `done_on`, `who`, `group_key` (fase) | flag keputusan, aturan template |
| `vendor` | W11, W12 | `group_key` (kategori), `status` (opsi/fix/batal), `amount` (penawaran) | telepon E.164, PIC, link kontrak, fakta kunci |
| `budget` | W13, H10 | `group_key` (acara), `amount` (rencana), `parent_id` (vendor, opsional) | – |
| `payment` | W13 | `parent_id` (butir anggaran), `amount`, `due_on`, `done_on`, `who` (pembayar) | link bukti |
| `saving`, `contribution` | W14, H2 | target di `amount` dan `due_on`; kontribusi punya `parent_id`, `amount`, `done_on`, `who` | sumber dana |
| `guest` | W16, W17 | `group_key` (sisi dan kategori), `qty` (pax), `status` | telepon |
| `seserahan` | W9 | `group_key` (kategori), `amount` (harga), `status`, `who` | link beli |
| `rundown` | W20 | `group_key` (acara), `due_on`, `done_on`, `sort` | jam mulai dan selesai, PIC |
| `song` | W22 | `group_key` (momen) | penyanyi |
| `note` | W4, H13 | `note`, `due_on` | – |
| `gift` | W25, H12 | `group_key` (acara), `amount`, `done_on` | arah (masuk/keluar) |
| `recurring` | H3, H4, H7 | `amount`, `due_on` (jatuh tempo berikutnya), `done_on` (terakhir), `who` | periode, tanggal berulang |
| `doc` | H9 | `due_on` (kedaluwarsa) | lokasi fisik, pemegang |
| `expense` | H1 | `amount`, `done_on`, `who` (pembayar), `group_key` (kategori) | pembagian |

**Aturan keluar:** pindahkan satu `kind` ke tabel sendiri hanya bila ia (a) butuh integritas relasional di luar `parent_id`, (b) butuh `CHECK` per jenis yang penting untuk uang, (c) memindai ribuan baris per kueri, atau (d) punya aturan retensi atau privasi berbeda (mis. `doc` bila suatu hari menyimpan scan). Hari ini tidak ada yang memenuhinya.

**Beban D1:** baris yang dibaca dihitung menurut baris yang dipindai ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)), jadi indeks `rev` dan `(kind, due_on)` penting. Pada ribuan baris dan batas 5 juta baca per hari, tidak ada masalah selama tidak ada polling atau pemindaian berulang.

**Catatan jujur:** brainstorm menyketsa 12 tabel per-fitur dan itu juga masuk akal untuk wedding saja. Rekomendasi generik ini didorong oleh perluasan ke household: tiap tabel baru membawa migrasi, whitelist, sync, dan ekspor, dan itu yang membuat fitur kecil seperti H4 atau W22 terasa tidak sepadan. Bila kalian lebih suka kejelasan SQL daripada fleksibilitas, jalur tengah adalah menjaga tabel per-fitur hanya untuk W13 (anggaran dan pembayaran, tempat ketepatan uang paling penting) dan generik untuk sisanya.

### 7.3 Inti yang dibangun pertama

**Inti = satu model, lima layar (Minggu ini, tugas, anggaran dan dana, vendor, tamu), satu tombol ekspor:**

1. Model `items` + `settings` + sinkron (urusan worker stack).
2. Layar daftar generik yang dikonfigurasi lewat registry.
3. "Minggu ini" (W3).
4. Tugas dari template (W2) dengan hari-H (W1).
5. Anggaran + pembayaran + jatuh tempo (W13) dan dana nikah (W14).
6. Buku vendor (W11) dan daftar tamu (W16).
7. Ekspor JSON dan CSV (X1), `.ics` per item (X2).

Alasannya: itu lima hal yang menggerakkan sesi mingguan (§1.2), semuanya berskor Tier 1, dan sisanya adalah konfigurasi di atas model yang sama.

**Tahapan.** Hari-H sekitar satu tahun lagi; target berikut relatif terhadap H dan bisa digeser.

| Tahap | Kapan (relatif H) | Isi | Tanda selesai |
|---|---|---|---|
| M0: spike | minggu pertama | Login, sinkron, satu `kind` ujung ke ujung (keputusan worker stack) | Dua HP melihat data yang sama, ada edit offline |
| M1: inti | H-11 bulan | Butir 1-7 di atas, plus impor sekali jalan dari spreadsheet lama | Kalian berdua memakai layar "Minggu ini" tiga minggu berturut-turut (ukuran: kedua pihak menyentuh daftar minggu itu) |
| M2: administrasi dan vendor | selesai sebelum H-6 bulan | W5 dan W6 (checklist KUA, hari kerja), W8, W9, W12, W4, template W24, pencarian (X4) | Checklist KUA terisi dan ditinjau di sesi mingguan |
| M3: hari-H | selesai sebelum H-3 bulan | W20 (rundown offline), W21, W17, W22, W23; rutinitas backup bulanan | Latihan hari-H di H-2 minggu: rundown terbuka di mode pesawat |
| M4: setelah acara | H sampai H+3 bulan | W25, W26, W24 aktif; arsip ekspor | Semua pembayaran vendor tuntas dan ada salinan ekspor di luar Cloudflare |
| M5: household v1 | setelah M4 | H3, H4, H2, lalu H12 bila divalidasi; H7, H1, H10 bila diminta | Tagihan dan perpanjangan nyata ada di app dan muncul di "Minggu ini" |
| Nanti | tanpa tanggal | X3 feed berlangganan, X5 digest, W19 link keluarga, X7 impor CSV generik | Hanya bila ada alasan nyata |

**Bukan deliverable:** UI dan komponen tampilan, pilihan framework, dan IaC, yang diputuskan worker lain dan tidak diriset di sini.

### 7.4 Risiko utama

| Risiko | Mitigasi |
|---|---|
| App ditinggalkan di minggu ketiga sampai kedelapan (§1.2 #11) | Inti kecil; sesi mingguan sebagai cue; berguna tanpa kebiasaan harian; ukur "kedua pihak menyentuh minggu ini" |
| Satu pasangan merasa jadi manajer (§1.2 #8) | Default belum di-assign; tanpa notifikasi assign; Partner B ikut memilih fitur |
| Terlalu banyak dibangun | Tier dan daftar tidak dibuat (§8); tiap fitur lolos uji §1.4 |
| Aturan KUA berubah atau berbeda antar kantor | Template diberi tanggal verifikasi; butir "tanya KUA" dengan kolom catatan; tidak ada aturan keras |
| Data hilang atau dikunci | Ekspor sejak M1; salinan di luar Cloudflare; Time Travel hanya 7 hari |
| Kebocoran data pribadi lewat repo publik | Kebijakan hijau/kuning/merah (§5.8); data uji palsu; tanpa NIK dan scan |
| Keunikan iOS (Home Screen, tanpa Background Sync) | Uji di iPhone sejak M0; jangan bergantung pada push |

---

## 8. Daftar tidak dibuat dan pertanyaan terbuka

### 8.1 Tidak dibuat

| Yang tidak dibuat | Alasan | Pertimbangkan ulang bila |
|---|---|---|
| Situs, RSVP, atau undangan digital publik | Sudah dilayani banyak platform (§2.3); halaman publik membuka data tamu dan harus dijaga dari enumerasi (brainstorm §4). Satu artikel menyarankan mengirim undangan cetak untuk tamu lanjut usia ([Good News from Indonesia](https://www.goodnewsfromindonesia.id/2022/11/22/mengenal-apa-itu-undangan-digital-trending-di-media-sosial)) | Kalian memutuskan tidak memakai layanan apa pun |
| Marketplace atau rekomendasi vendor | Model bisnis vendor-iklan; tuduhan lead palsu di sisi The Knot (§2.1) | Tidak |
| Registry atau wishlist kado | Tradisi ngamplop dan buwuhan (§2.5); wishlist ditangani Giftster/Giftful/GoWish | Tidak |
| Seating chart | Tidak lolos uji mingguan; satu kali pakai | Resepsi dengan meja bernomor dan tamu banyak |
| Moodboard dan inspirasi | Pinterest adalah platform inspirasi yang paling banyak dipakai ([Knot 2026](https://www.theknotww.com/press-releases/the-knot-worldwide-unveils-2026-real-weddings-study)) | Tidak |
| Chat di dalam app | WhatsApp sudah ada | Tidak |
| Poin, streak, peringkat | Pengingat menghambat kebiasaan dan penguatan positif tidak efektif ([Stawarz dkk.](https://research-information.bris.ac.uk/en/publications/beyond-self-tracking-and-reminders-designing-smartphone-apps-that/)); aplikasi chores terasa seperti mengasuh pasangan ([MIT TR](https://www.technologyreview.com/2022/05/10/1051954/chore-apps/)) | Tidak |
| Assign dengan notifikasi; tampilan "pasangan belum membuka" | Lihat §1.3 #3 dan #4 | Tidak |
| Sinkron bank otomatis; deteksi langganan | Tidak layak di Indonesia (§4, §6.3) | Ada agregator konsumen yang terbukti |
| Daftar belanja dan UI kalender sendiri | Diserahkan (H5, H8) | Aplikasi yang dipakai berhenti |
| Brankas scan KTP/KK/paspor | Data paling berisiko; Bitwarden sudah ada (§4.2 H9) | Ada kebutuhan nyata dan kalian siap menanggung enkripsi di client dan kunci pemulihan |
| Fitur AI | Hanya 36% pasangan AS memakai AI untuk planning ([Knot 2026](https://www.theknotww.com/press-releases/the-knot-worldwide-unveils-2026-real-weddings-study)); tidak ada masalah mingguan yang jelas; Workers AI gratis 10.000 neuron per hari dan tidak ada model OCR khusus yang teridentifikasi (§6.3) | Ada pekerjaan berulang yang bisa dibuktikan memakai AI |
| "Mode hari-H" untuk pengantin | Pengantin meninggalkan HP ([Massimi dkk.](https://www.microsoft.com/en-us/research/wp-content/uploads/2020/03/Real-but-Glossy.pdf)); sebagai gantinya, run sheet untuk koordinator (W20, W21) | Tidak |
| Ko-editing waktu nyata | Dua orang jarang menyunting baris yang sama persis bersamaan; brainstorm §3.2 menaruhnya sebagai opsi | Konflik sinkron benar-benar terjadi |
| Multi-pasangan, wizard onboarding, banyak bahasa | Tidak ada kebutuhan | Tidak |
| Otomasi WhatsApp Business API | Sulit dan tidak realistis untuk pemakaian pribadi (§6.3) | Tidak |
| Album foto dan foto tamu | Google Photos/iCloud; app hanya menyimpan link | Tidak |
| Kalkulator KPR dan konten relasi | BCA, Rumah123, Paired, Gottman (§4.2) | Tidak |
| Hitung weton otomatis | Praktik opsional dan beragam; cukup catatan opsional (§5.7) | Kalian memintanya |
| Push sebagai loop inti | iOS hanya untuk app terpasang; pengingat menghambat kebiasaan (§1.2 #5, §5.1) | Layar "Minggu ini" dan `.ics` terbukti tidak cukup |

### 8.2 Lima keputusan yang paling menentukan (untuk operator)

1. **Model data: generik `items` atau tabel per fitur** (§7.2). Rekomendasi: generik, dengan pengecualian opsional untuk anggaran dan pembayaran. Ini menentukan apakah fitur household yang kecil layak dibuat.
2. **Cakupan inti** (§7.3). Rekomendasi: model + "Minggu ini" + tugas + anggaran/pembayaran + vendor + tamu + ekspor. Semua lainnya menunggu.
3. **Representasi uang** (§6.1 #3). Rekomendasi: rupiah utuh sebagai integer plus kode mata uang. Alternatif: ×100 agar sesuai ISO 4217. Harus ditulis di skema ekspor sebelum data pertama.
4. **Strategi reminder** (§5.1). Rekomendasi: layar "Minggu ini" + `.ics` per item dulu; satu digest mingguan nanti; push hanya bila terbukti perlu.
5. **Kebijakan dokumen sensitif** (§5.8). Rekomendasi: tanpa NIK dan tanpa scan; indeks dokumen saja; scan di Bitwarden atau Drive.

### 8.3 Pertanyaan untuk operator

1. Perkiraan tanggal akad, atau jendela waktunya? (Menentukan template dan jadwal M1-M3.)
2. Apakah platform pilihan worker stack bisa menjamin tulis offline, atau ada fitur yang harus dipangkas? (Menentukan W20 dan capture offline.)
3. Apakah R2 boleh dipakai (checkout "R2 subscription" dan kemungkinan metode pembayaran, §5.3)? Bila tidak, lampiran tetap link selamanya.
4. Apakah satu tabel generik bisa diterima untuk semua data, atau anggaran dan pembayaran perlu tabel sendiri?
5. Spreadsheet lama dijalankan paralel berapa lama, dan data mana yang asli (brainstorm §9)?
6. Siapa yang merawat app setelah acara, dan kapan diarsipkan atau dimatikan (brainstorm §9 #10)?

### 8.4 Pertanyaan untuk kalian berdua

1. Akad di KUA atau di luar, dan di kecamatan domisili salah satu atau di tempat lain (numpang nikah)? (Rp0 atau Rp600.000; butuh rekomendasi atau tidak.)
2. Android atau iPhone masing-masing? (Push, instal ke Home Screen.)
3. Siapa memegang apa sekarang? Setuju dengan default "belum di-assign, ambil dengan satu ketukan"? Apakah Partner B ikut memilih fitur? Pasangan yang tidak memilih app adalah risiko berhenti (§1.2 #8).
4. Perlu item "privat untuk saya" (kejutan hadiah, bulan madu), atau semua boleh terlihat?
5. Apakah orang tua atau WO perlu akses baca-saja, dan ke apa saja?
6. Kanal pengingat apa yang benar-benar dilihat tiap hari: WhatsApp, email, kalender HP?
7. Hari dan jam sesi mingguan, dan apakah mau dijadikan ritual tetap? (Cue berbasis kejadian: §1.2 #5.)
8. Undangan: layanan digital mana, atau cetak? Perlu impor CSV hasil RSVP?
9. Amplop dan kondangan: apakah mencatat amplop masuk dan keluar benar-benar kebutuhan? Seberapa sering menghadiri kondangan, dan apakah ada arisan yang dijalankan? (Permintaan belum divalidasi: W25, H12.)
10. Setelah menikah, mana yang paling dulu: tagihan dan pajak kendaraan, target tabungan, pengeluaran bersama, atau lainnya? Bagian mana yang sudah beres di app bank (Kantong, bluGether)?
11. Perlu mata uang selain rupiah (bulan madu)?
12. Perjanjian pranikah: relevan untuk kalian, atau lewati W7?
13. Perlu mencatat nomor HP tamu di app (konsekuensinya masuk golongan kuning di §5.8)?

---

## Lampiran A: Hal yang tidak terverifikasi dan celah riset

- **Kebiasaan pasangan Indonesia memakai Sheets/Notion/WhatsApp untuk planning:** tidak ada sumber Indonesia yang ketemu; kuota pencarian habis. Perlu tindak lanjut (Reddit, Kaskus, Hipwee, Brilio, blog Bridestory/Weddingku).
- **Ulasan Play Store** Bridestory, Weddingku, Wevitation: hanya rating dan jumlah ulasan yang terbaca. Tema ulasan Weddingku dan Wevitation tidak terverifikasi. Ulasan iOS Bridestory berasal dari feed Apple yang hanya mengekspos sekitar 50 ulasan terbaru.
- **theknot.com, Hitched, Etsy, Reddit, Brides, Cosmopolitan, NYT/Wirecutter** tidak bisa dibuka. Tidak ada kutipan Wirecutter atau NYT. Studi yang memeringkat fitur mana yang paling dipakai pasangan tidak ketemu (hanya adopsi kanal).
- **Statistik retensi dan kebiasaan populer** ("25% app dipakai sekali", "66 hari median") tidak punya sumber primer yang ketemu.
- **Angka WhatsApp di Indonesia:** tidak ada angka bersih (§1.1).
- **Proses KUA:** durasi dan jadwal bimwin; apakah Keputusan Dirjen 373/2017 masih berlaku; langkah RT/RW; aturan "15 HK" setelah daftar online (bertentangan); Elsimil wajib atau tidak di KUA tertentu; TT; lampiran PP 59/2018 berupa gambar; teks PMA dibaca dari salinan PDF di situs pemerintah desa dan dicocokkan hanya dengan metadata BPK.
- **Setelah nikah:** tenggat KK, KTP-el, BPJS Kesehatan (pasangan), BPJS Ketenagakerjaan, paspor, bank, asuransi, STNK, HR; angka PTKP.
- **Hijri:** kriteria MABIMS baru; dataset libur terbuka resmi.
- **UU PDP:** teks pasal dibaca dari situs pihak ketiga; peraturan pelaksana dan lembaga pengawas tidak ketemu; tidak ada panduan resmi menyimpan NIK; interpretasi pengecualian rumah tangga adalah bacaan penulis, bukan nasihat hukum.
- **Aplikasi uang Indonesia:** batas anggota dan ekspor Jago/blu; Finansialku; Sribuu; bank lain; dukungan bank Indonesia di Wallet.
- **Integrasi:** interval refresh `.ics` Google; apakah Google menghormati `REFRESH-INTERVAL`; apakah R2 butuh metode pembayaran; apakah email terverifikasi butuh domain; klausul "hanya bisnis" WhatsApp; dukungan `share_target` Firefox; dukungan `prf` WebAuthn per browser; dokumentasi ekspor Splitwise/YNAB/Money Manager; klasifikasi cakupan Calendar; QRIS di halaman BI.
- **Kutipan ulasan** dibaca lewat tool fetch yang meringkas; kutipan dan angka yang jadi tumpuan dicek ulang di halaman sumbernya, sisanya bertanda sesuai tingkat verifikasinya.
- **Angka ulasan dan rating** adalah snapshot 2026-10-06 dan berubah tiap hari.
