# Infra dan stack: wp di Cloudflare

Riset dan keputusan per 2026-10-06. Ini rekomendasi untuk kamu setujui, bukan implementasi. Beberapa bagian `docs/brainstorm.md` digantikan (daftar di [§9](#9-risiko-pertanyaan-terbuka-dan-yang-digantikan)); brainstorm sendiri nggak diubah.

> **Privasi.** Repo ini publik. Nggak ada email asli di sini: alamat ditulis `<email-partner-a>` dan `<email-partner-b>`. Temuan dari repo privat ditulis generik ("repo org lain", "repo kantor"), tanpa kode, hostname, ID, nama secret, atau nama orang. Repo `atqamz/github` publik, jadi boleh dikutip.
>
> **Label.** **belum terverifikasi** = nggak bisa kubuktikan dari repo, docs, atau DNS publik. Aku nggak punya kredensial Cloudflare, Google, atau GitHub write. Semua versi dan tanggal dicek 2026-10-06 lewat npm, GitHub API, Go proxy, dan halaman docs yang ditautkan; versi paket npm yang nggak ditautkan (mis. `jose`, `zod`, `valibot`, `kysely`, `vitest`, `typescript`) diambil dari `npm view` pada tanggal itu.

## Tabel keputusan

| # | Area | Pilihan | Alasan satu baris |
|---|---|---|---|
| 1 | Akun Cloudflare | Akun yang menampung zone `atqamz.com`, dengan Zero Trust org sendiri. Cek dulu apakah org lain ikut di akun itu | Custom Domain butuh zone aktif di akun yang sama; tiga zone yang kulihat pakai tiga pasang NS berbeda, jadi kemungkinan akun terpisah (belum terverifikasi) |
| 2 | IaC untuk Worker, D1, domain | `wrangler.jsonc` saja, dideploy dari CI | wrangler sudah mendeklarasikan semuanya; IaC lain pun tetap butuh wrangler untuk kode, assets, dan migrations |
| 3 | IaC untuk Access | Setup manual sekali (Google OAuth client) + satu script `scripts/access.sh` (curl ke API) untuk IdP, app, policy | Cuma 3 objek; state backend lebih berat dari kerjanya |
| 4 | Pulumi, OpenTofu, Alchemy | Belum. Kalau nanti: Pulumi Go, di repo terpisah | Konsisten dengan `atqamz/github`; trigger ada di §3.4 |
| 5 | Effect | **Nggak** (later hanya dengan trigger di §4) | Dua user dan ±3 endpoint; Alchemy v2 memaksa Effect, jadi memilihnya berarti memilih keduanya |
| 6 | Bahasa | TypeScript untuk Worker; JS biasa + JSDoc untuk frontend; `tsc --noEmit` sebagai type check | wrangler mem-bundle TS tanpa config; frontend tetap tanpa build |
| 7 | Router | Nggak ada, `switch` | 3 route |
| 8 | Validasi | Ditulis sendiri dari spec tabel yang sama dengan whitelist SQL | Satu sumber kebenaran, nol dependency |
| 9 | Akses D1 | `prepare().bind()` dan `batch()`, tanpa ORM | Query kecil dan sudah ditulis di brainstorm §5.3 |
| 10 | Migrations | File SQL + `wrangler d1 migrations apply`, jalan di CI sebelum deploy | Bawaan D1; gagal otomatis di-rollback per migration |
| 11 | Test | `node --test` (TS langsung, Node 24) + satu integration test lewat `wrangler dev` | Nol framework test; `@cloudflare/vitest-plugin` nanti kalau perlu |
| 12 | Auth | Access + Google IdP, app berbasis hostname, policy allow dua email; Worker verifikasi JWT pakai `jose` | Yang kamu minta, dan nol kode login |
| 13 | Dua email | Password store lokal (sumber), Worker secret, dan policy Access. Nggak di repo, nggak di GitHub secrets | Makin sedikit salinan makin kecil peluang bocor |
| 14 | CI/CD | GitHub Actions memanggil `npx wrangler` langsung; bukan Workers Builds | Satu sistem CI untuk test + migrations + deploy; Workers Builds cuma menerima token milik user |
| 15 | Environment | Satu `production`, tanpa preview. Staging nanti kalau ada trigger | Preview URL publik secara default dan berbagi D1 kalau nggak dipisah |
| 16 | Repo settings | Baris `wp` di `repos.go` milik `atqamz/github` nanti; secret CI tetap `gh secret set` | Aturan repo itu sendiri: settings di sana, workflow dan dependabot di tiap repo |
| 17 | Dependency | 1 runtime (`jose`) + 3 dev (`wrangler`, `typescript`, `@types/node`) | Tiap satu dijustifikasi di §5.3 |

---

## 1. Temuan dari tiga repo

Dibaca read-only dari clone di scratchpad (sudah dihapus). Isi repo privat diringkas sebagai pola.

### 1.1 `atqamz/github` (publik, repo IaC pribadimu)

Sumber: [README](https://github.com/atqamz/github), `AGENTS.md`, `main.go`, `repos.go`, `go.mod` di repo itu (dibaca 2026-10-06).

| Aspek | Temuan |
|---|---|
| Tool | Pulumi + Go (`go 1.26`, `pulumi-github` SDK v6.14.1, `pulumi` SDK v3.255.0). Project bernama `github-config`, bukan `github`, supaya key config nggak bentrok dengan namespace provider |
| State backend | Pulumi Cloud (disebut di README), satu stack `prod` |
| Secrets | Nggak ada secret di repo. `GITHUB_TOKEN` diambil dari `gh auth token` saat dijalankan |
| CI | Nggak ada workflow sendiri (cuma Dependabot bawaan). `pulumi up` dijalankan manual olehmu; `AGENTS.md` melarang jalan tanpa pengawasan |
| Environment | Satu stack `prod` |
| DNS dan zone | Nggak menyentuh Cloudflare sama sekali |
| Access | Nggak ada |
| Konvensi | Satu tabel `repos` di `repos.go`, baseline seragam di `main.go`, `Protect(true)` di tiap repo, flag `adopt` untuk meng-import repo yang sudah ada, devshell Nix + direnv + treefmt, `AGENTS.md` berisi aturan "jangan diperbaiki tanpa baca alasannya". Hal yang sengaja **nggak** dikelola (required status checks, required signatures, labels, secret scanning, interaction limits) didokumentasikan beserta alasannya |

### 1.2 Repo org lain (privat, GitOps untuk satu server)

| Aspek | Temuan |
|---|---|
| Tool | OpenTofu 1.11.x (dipin lewat `mise`) + provider Cloudflare `~> 5.17`. Cakupan Cloudflare **cuma record DNS di satu zone** (enam record, satu di antaranya wildcard DNS-only). Pages, R2, dan record email ditandai "dikelola di dashboard, bukan di sini" di komentar kode. Server dikelola Ansible, di luar cakupan |
| State backend | File state terenkripsi SOPS **di-commit ke git**. CI men-decrypt, apply, meng-encrypt ulang, lalu push ke branch utama dengan `[skip ci]`. Nggak ada locking native; sebuah ADR menetapkan trigger untuk pindah ke backend S3-compatible (R2) dengan `use_lockfile` |
| Secrets | SOPS + GPG dengan beberapa recipient. Token Cloudflare dan zone ID ada di tfvars terenkripsi. CI meng-import private key GPG dari Actions secret |
| CI | Satu workflow: plan di PR, apply di push ke branch utama, `concurrency` group tanpa cancel. Action di-pin ke commit SHA, Dependabot mingguan untuk Actions. Terhubung ke satu GitHub Environment |
| Environment | Satu state, satu environment |
| DNS dan zone | Zone ID jadi satu variable; repo ini penulis tunggal untuk record yang dideklarasikan |
| Access | Nggak ada di repo ini |
| Konvensi | ADR per keputusan, `mise`, pre-commit hook. Aturan eksplisit untuk workload yang didelegasikan ke repo lain: **jangan jadikan dua repo penulis untuk satu resource host** |

### 1.3 Repo kantor (privat, IaC lebih luas)

| Aspek | Temuan |
|---|---|
| Tool | Pulumi **TypeScript** (`@pulumi/cloudflare` 6.21.0, Pulumi CLI 3.267 lewat `mise`, Node 22). Pindah dari OpenTofu pertengahan 2026 lewat ADR. Satu project, satu stack `prod`, modul datar per concern |
| Cakupan Cloudflare | Zone settings, DNS, redirect rules, Access (app, policy reusable, service token), Pages, R2, KV, **pembuatan** D1, account API tokens (inventory dengan scope minimum per token), dan **route + subdomain workers.dev** milik Worker. Script Worker sendiri **tidak** ada di IaC |
| State backend | Backend S3-compatible DIY di bucket R2 (`region=auto`), secrets provider `passphrase` (hanya nilai yang ditandai secret yang terenkripsi), kredensial state dipisah dari token admin dan hanya boleh baca/tulis objek. Locking-nya best-effort, jadi `concurrency` group di CI yang menjamin serialisasi |
| Secrets | SOPS + age (satu key bersama; sebelumnya GPG). Satu file env terenkripsi berisi token provider, passphrase, dan kredensial state; dijalankan lewat `sops exec-env ... pulumi ...`. Config stack nggak berisi secret |
| CI | Push ke branch utama untuk `pulumi/**` menjalankan `up`. Gate PR: typecheck, lint, scan Trivy, `preview` + policy pack (CrossGuard). Job harian `preview --refresh` membuka issue kalau ada drift. Aturan tertulis: **semua IaC jalan di CI, nggak pernah di laptop** |
| DNS dan zone | IaC penulis tunggal untuk satu zone; zone ID di config stack, account ID diturunkan dari lookup zone |
| Access | App dan policy adalah kode. **IdP Google Workspace dibuat manual di dashboard, lalu di-lookup berdasarkan tipe** (IaC nggak membuat IdP). Policy `email domain`, session 24 jam. Satu JWT audience per app, dan Worker memverifikasi JWT sendiri lagi. Org Access (team domain, halaman login) nggak ada di kode. Repo mencatat batas 5 hostname per app (belum kuverifikasi di docs) |
| Konvensi | **Import-first** untuk objek yang sudah hidup (satu kali lupa import menghasilkan policy ganda). **IaC memegang edge binding, repo aplikasi memegang kode**: script Worker dideploy dari repo aplikasi lewat `wrangler` di GitHub Actions dengan token milik akun; menaruh script di dua tempat pernah menimpa revisi live. Workers Builds dihindari karena hanya menerima token milik user (cocok dengan [docs Cloudflare](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token), halaman diperbarui 2026-09-22). Release Please, tanpa branch protection |

### 1.4 Pola yang kupakai ulang untuk wp

1. **Satu penulis per resource.** Kalau wrangler memegang script `wp`, nggak ada IaC lain yang boleh mendeklarasikannya.
2. **Kode dideploy aplikasi lewat wrangler dari GitHub Actions**, bukan dari IaC.
3. **Token milik akun dengan scope minimum**, dinamai jelas dan dipisah per tugas.
4. **Satu `concurrency` group** untuk deploy.
5. **Action di-pin ke SHA** dengan Dependabot yang menaikkan.
6. **Nggak ada secret di config stack atau repo**; nilai datang saat runtime.
7. **Hal yang sengaja nggak dikelola ditulis beserta alasannya**, seperti README `atqamz/github`.

---

## 2. Analisis tabrakan

### 2.1 Siapa mengelola apa

| Kelas resource | Repo org lain | Repo kantor | Yang dibutuhkan wp |
|---|---|---|---|
| Akun | Nggak ada | Account tokens, Pages, R2, KV, pembuatan D1 | Satu token sendiri, satu Worker, satu D1 |
| Zone | Satu zone, record DNS saja | Satu zone: settings, DNS, redirect rules, routes | Zone `atqamz.com` saja |
| Record DNS | Enam record eksplisit termasuk satu wildcard | Banyak, satu zone | Satu record, dibuat otomatis oleh Custom Domain |
| Org Access | Nggak dikelola | App/policy/token ada di kode; **org, team domain, IdP dibuat manual** | Satu IdP Google dan satu app |
| Workers | Nggak ada | Hanya route dan subdomain; script dari repo aplikasi | Script `wp` dideploy wrangler |
| D1 / KV | Nggak ada | Dibuat IaC, skema di repo aplikasi | D1 `wp` dibuat sekali lewat `wrangler d1 create` |

### 2.2 Apakah zone `atqamz.com` ada di state mereka?

**Menurut konfigurasi: nggak.** Alasannya:

- Pencarian `atqamz.com` di kedua repo privat nggak menemukan apa pun.
- Kedua program memakai **satu** zone ID sebagai variable/config dan nggak men-enumerate zone di akun.
- Nggak ada resource DNS atau Access yang diparameterisasi per zone selain itu.

**Yang nggak bisa kuverifikasi:**

- Isi state repo org lain terenkripsi SOPS dan aku nggak mendekripsinya (dan nggak punya key).
- State repo kantor ada di bucket R2 yang nggak bisa kuakses.
- Nilai zone ID di tfvars terenkripsi, jadi nggak bisa dibandingkan dengan zone ID `atqamz.com` tanpa API Cloudflare.

### 2.3 Apakah satu akun Cloudflare?

Bukti dari DNS publik (DoH `cloudflare-dns.com`, 2026-10-06): zone `atqamz.com` memakai `chloe.ns.cloudflare.com` dan `ray.ns.cloudflare.com`. Zone dari repo org lain dan zone dari repo kantor masing-masing memakai pasangan lain, dan ketiga pasangan berbeda satu sama lain.

Cloudflare menulis bahwa metode assignment default "favor consistent nameserver names across all zones within an account", tapi juga "in case there are conflicts, you may get different nameserver names, even for domains that are within the same account" ([docs](https://developers.cloudflare.com/dns/zone-setups/reference/nameserver-assignment/), dicek 2026-10-06). Jadi tiga pasangan berbeda **mengarah** ke tiga akun, tapi **bukan bukti**.

**Cek manual 30 detik:** buka dashboard Cloudflare, lihat daftar akun di pojok kiri atas, dan lihat di akun mana `atqamz.com` berada. Kalau akun itu juga memuat zone atau Workers milik org lain, skenario B di bawah berlaku.

### 2.4 Apa yang bisa salah

| # | Risiko | Mekanisme | Mitigasi |
|---|---|---|---|
| 1 | Dua penulis untuk satu objek | Kalau resource wp (route, Access app) suatu hari di-import ke IaC lain, `apply` mereka bisa menimpa atau menghapusnya. Repo kantor mencatat satu insiden: script yang dideklarasikan di dua tempat saling menimpa | Semua objek wp berawalan `wp`. Nggak pernah di-import ke repo lain. Aturan "satu penulis" ditulis di repo ini |
| 2 | Token disapu | Account API token terlihat oleh admin akun, dan repo kantor menyimpan inventory token di IaC. Token yang nggak terdaftar berisiko dicabut saat sweep | Nama token berawalan `wp-`. Scope ke satu akun dan satu zone. Di akun bersama, beri tahu pemilik inventory |
| 3 | Org Access adalah singleton per akun | Team domain, halaman login, daftar IdP, durasi session global, dan aplikasi "Protect all Workers" berlaku di seluruh akun. Kalau `all_workers` aktif, Worker wp ikut kena policy itu ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), 2026-08-18) | Cek kartu **Protect all Workers** di Workers & Pages sebelum deploy. Jangan pernah mengaktifkannya dari wp |
| 4 | IdP baru muncul di app lain | Menambah IdP ke org bersama bisa menambah opsi login di app yang nggak mem-pin IdP. Perilaku default app tanpa `allowed_idps` **belum terverifikasi** | Hanya relevan di skenario B. Pin `allowed_idps` di app wp dan minta pemilik org lain mem-pin juga |
| 5 | Quota dipakai bareng | Lihat §2.5 | Pantau dashboard usage |
| 6 | Salah akun | Anggota beberapa akun: `wrangler login` memberi akses ke akun mana pun, dan config `account_id` "You might have more than one account" ([docs](https://developers.cloudflare.com/workers/wrangler/configuration/), 2026-10-05) | Selalu set `CLOUDFLARE_ACCOUNT_ID`, dan buat token yang dibatasi ke satu akun seperti rekomendasi [docs CI](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) |
| 7 | Plan akun berubah oleh orang lain | Batas Free vs Paid berubah tanpa wp berbuat apa-apa | **belum terverifikasi**: plan akun yang dipakai |
| 8 | Record yang nggak dikenal terhapus | IaC berbasis state hanya mengubah objek di state-nya sendiri ([OpenTofu state](https://opentofu.org/docs/language/state/)). Dua repo Cloudflare yang kubaca nggak punya loop penghapusan massal | Risiko nyata hanya kalau `atqamz.com` pernah dimasukkan ke state itu; konfigurasi saat ini nggak begitu |
| 9 | Hambatan sertifikat | Custom Domain membuat sertifikat otomatis. Apex `atqamz.com` nggak punya CAA, MX, atau TXT (DoH 2026-10-06), jadi nggak ada yang menghalangi | Nggak perlu tindakan |

### 2.5 Quota yang dibagi per akun

| Resource | Batas Free | Sumber |
|---|---|---|
| Workers requests | 100.000/hari **per akun**, reset 00:00 UTC; error 1027 saat habis | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (2026-09-05) |
| Workers per akun | 100; Cron Triggers 5 per akun | idem |
| Static assets | Request ke asset gratis dan nggak terbatas; path `run_worker_first` dapat 429 saat kuota habis | [Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) (2026-04-23) |
| D1 | 10 database per akun, 5 GB total, 500 MB per database, Time Travel 7 hari | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (2026-04-21) |
| D1 harian | 5 juta rows read dan 100.000 rows written per hari | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (2026-04-21) |
| Workers Builds | 3.000 menit/bulan, 1 build bersamaan **across an account** | [Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) (2026-05-29) |
| Zero Trust Free | Seat dikonsumsi tiap user yang melakukan authentication event; Free "for up to 50 users" | [Seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/) (2026-05-01), [reference architecture](https://developers.cloudflare.com/reference-architecture/architectures/sase/) |

Pemakaian wp: ±200 request/hari, 1 database, 2 seat. **Belum terverifikasi:** berapa yang sudah dipakai Worker dan org lain di akun yang sama, dan apakah akun itu di plan Free.

### 2.6 Rekomendasi batas

**Skenario A (akun terpisah, kemungkinan besar):** semua yang di bawah berlaku, tanpa kehati-hatian ekstra.

**Skenario B (akun yang sama dengan org lain):** tambahkan cek kartu "Protect all Workers", pin `allowed_idps`, dan satu pesan ke pemilik akun soal token `wp-*`. Atau pindahkan wp ke akun pribadi baru (akun Cloudflare gratis), tapi Custom Domain butuh zone `atqamz.com` di akun itu juga, dan memindahkan zone antar akun **belum terverifikasi** caranya.

| Dimiliki wp | Tetap dimiliki pihak lain / jangan disentuh |
|---|---|
| Worker `wp` (script, versi, secrets, assets) | Semua Worker lain dan route mereka |
| D1 `wp` dan isinya | Database lain |
| Custom Domain `wp.atqamz.com` (satu record DNS + satu sertifikat) | Record lain di `atqamz.com`, setting zone, rules zone-wide |
| Satu app Access `wp` (hostname-based, policy inline) | Aplikasi Access lain, policy reusable, aplikasi `all_workers` |
| Satu IdP Google `wp-google` (satu-satunya objek tingkat akun) | Org Access (team domain, login page, durasi global), IdP lain |
| Token `wp-ci` (deploy) dan `wp-access-setup` (sementara) | Token lain dan inventory-nya |

**Footprint terkecil:** Worker, D1, Custom Domain, app Access, IdP, dua token. Policy dibuat **inline** di app (nggak reusable), supaya wp nggak menambah objek policy tingkat akun: API menyebut "Reusable and inline policies are mutually exclusive" ([API reference](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/)).

---

## 3. Perbandingan IaC

### 3.1 Versi (dicek 2026-10-06)

| Tool | Versi | Tanggal | Sumber |
|---|---|---|---|
| wrangler | 4.147.0 | 2026-10-02 | [npm](https://www.npmjs.com/package/wrangler) |
| Alchemy | 2.0.0-beta.81 (tag `latest` di npm masih beta); jalur sebelumnya 0.94.0 | 2026-10-05; 2026-08-01 | [npm](https://www.npmjs.com/package/alchemy), [repo](https://github.com/alchemy-run/alchemy) |
| Effect | 4.0.1 (4.0.0 rilis 2026-10-01) | 2026-10-04 | [npm](https://www.npmjs.com/package/effect) |
| Pulumi CLI | 3.267.0 | 2026-10-01 | [releases](https://github.com/pulumi/pulumi/releases) |
| Pulumi Cloudflare (Go dan TS) | v6.21.0 | 2026-09-18 | [Go proxy](https://proxy.golang.org/github.com/pulumi/pulumi-cloudflare/sdk/v6/@latest), [npm](https://www.npmjs.com/package/@pulumi/cloudflare) |
| Provider Terraform Cloudflare | 5.27.0 | 2026-10-03 | [releases](https://github.com/cloudflare/terraform-provider-cloudflare/releases) |
| OpenTofu | 1.13.1 | 2026-10-01 | [releases](https://github.com/opentofu/opentofu/releases) |
| Terraform | 1.16.5 | 2026-10-02 | [releases](https://github.com/hashicorp/terraform/releases) |
| `cloudflare/wrangler-action` | v4.1.3 | 2026-09-24 | [releases](https://github.com/cloudflare/wrangler-action/releases) |

Alchemy v2 mulai beta 2026-04-13 dan sudah 81 beta release dalam ±25 minggu (riwayat versi npm). Tag `latest` menunjuk beta.

### 3.2 Yang harus dilakukan siapa pun alatnya

Scope-nya: satu Worker dengan static assets, satu D1, satu Custom Domain, satu app Access, satu IdP.

- **Kode dan assets Worker harus lewat wrangler atau API upload.** Resource `WorkersScript` di Pulumi punya field `assets.jwt` (token hasil upload session), bukan direktori ([Pulumi docs](https://www.pulumi.com/registry/packages/cloudflare/api-docs/workersscript/)); aku menyimpulkan provider nggak meng-upload folder sendiri (kesimpulan dari skema, belum terverifikasi). Repo kantor sampai memindahkan script keluar dari IaC setelah dua salinan saling menimpa.
- **Migrations D1 bukan resource provider.** Provider Terraform hanya punya `d1_database` ([daftar resource](https://github.com/cloudflare/terraform-provider-cloudflare/tree/main/docs/resources)). Migrations tetap `wrangler d1 migrations apply`.
- **Yang tersisa untuk IaC: Access (3 objek)** dan, kalau mau, Custom Domain.

### 3.3 Tabel perbandingan

| Kriteria | Alchemy v2 | Pulumi (Go / TS) | OpenTofu / Terraform | wrangler + satu script |
|---|---|---|---|---|
| Kesederhanaan (ukuran baris = perkiraanku) | Program Effect, `alchemy.run.ts`, bundler rolldown; perlu `effect@^4` sebagai peer dep | Program + CLI + akun state + provider; ±100 baris Go untuk 3 objek | HCL ±40 baris + backend state + provider | Satu file config + ±50 baris bash |
| Fit free plan | Pakai D1 dan Worker, tapi state store default menambah satu Worker dengan Durable Object dan Secrets Store ke akun | Pulumi Cloud Free: 1 user, project dan stack tanpa batas ([pricing](https://www.pulumi.com/pricing/)) | Gratis; state di R2 butuh langganan R2 lewat checkout ([R2 get-started](https://developers.cloudflare.com/r2/get-started/)) | Nol biaya tambahan |
| Penyimpanan state | Lokal `.alchemy/` (gitignore) atau `Cloudflare.state()`: Worker + DO SQLite + Secrets Store di akunmu, dipakai ulang semua stack ([docs](https://alchemy.run/state-store/)). Status Secrets Store di Free **belum terverifikasi** (docs-nya "open beta") | Pulumi Cloud (seperti `atqamz/github`) atau backend DIY | Backend lokal, git terenkripsi, atau S3-compatible di R2 dengan `use_lockfile` ([docs](https://opentofu.org/docs/language/settings/backends/s3/)) | Nggak ada. State = Cloudflare itu sendiri |
| Secrets | Secret provider terpisah, kunci state di Secrets Store | `pulumi config set --secret`; nilai masuk state | `TF_VAR_*`; nilai sensitif masuk state, jadi perlu [state encryption](https://opentofu.org/docs/language/state/encryption/) (PBKDF2) | Worker secrets + password store lokal; nggak ada state yang menyimpan secret |
| Konsistensi dengan repomu | Nggak ada | **Go** sama dengan `atqamz/github`; **TS** sama dengan repo kantor | Sama dengan repo org lain | wrangler sama dengan cara Worker di repo kantor dideploy |
| Kematangan | Beta, 81 rilis dalam ±25 minggu | Provider v6.21.0; repo kantor mencatat gesekan import (pre-check menolak program tulisan tangan, beberapa resource R2 nggak bisa di-import) | Provider v5 punya 223 issue dan PR terbuka ([repo](https://github.com/cloudflare/terraform-provider-cloudflare), hitungan API 2026-10-06) | wrangler 4.147.0, rilis sangat sering |
| Access dengan IdP Google | Ada: `Access/IdentityProvider` (tipe `google`), `Application`, `Policy` ([kode](https://github.com/alchemy-run/alchemy/tree/main/packages/alchemy/src/Cloudflare/Access), commit 2026-10-05) | `ZeroTrustAccessIdentityProvider`, `ZeroTrustAccessApplication` ([docs](https://www.pulumi.com/registry/packages/cloudflare/api-docs/zerotrustaccessapplication/)) | `cloudflare_zero_trust_access_identity_provider`, `..._application` ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/tree/main/docs/resources)) | API langsung; field `allowed_idps`, `client_id`, `client_secret`, `session_duration` ada di API reference |
| Migrations D1 | `D1.ApplyMigrations` ([kode](https://github.com/alchemy-run/alchemy/tree/main/packages/alchemy/src/Cloudflare/D1)) | Nggak ada, pakai wrangler | Nggak ada, pakai wrangler | Native |
| Preview environment | Stage per PR (`staging-{number}`), destroy saat PR ditutup lewat [GitHub Action bawaan](https://alchemy.run/environments/ci/) | Stack per PR, wiring manual | Workspace per PR, wiring manual | `wrangler preview` (wrangler ≥ 4.135, blok `previews`) atau `env.<nama>`; D1 terisolasi hanya kalau di-bind ke database terpisah ([Previews](https://developers.cloudflare.com/workers/previews/), 2026-09-24) |
| Risiko tabrakan di akun bersama | Menambah Worker state-store di akun | Aman kalau scope token dan prefix nama dijaga | Aman kalau nggak pernah memakai `zero_trust_organization` | Paling kecil: nggak ada inventory yang bisa salah hapus |

### 3.4 Rekomendasi jujur

**wrangler saja sudah cukup untuk Worker, assets, D1, migrations, Custom Domain, dan secrets.** Access disetel sekali dan hampir nggak berubah; di sana cukup satu script.

Alasan:

1. Setelah kode, assets, dan migrations ada di wrangler, IaC cuma akan memegang 3 objek Access. Itu nggak sebanding dengan state backend, token tambahan, dan program yang harus dirawat.
2. Nggak ada state, jadi nggak ada state yang bisa bentrok dengan IaC org lain.
3. `secrets.required` di wrangler memastikan deploy gagal kalau secret belum dipasang ([docs](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property)).

**Script Access (`scripts/access.sh`)** itu bagian yang boleh dilewati: kalau kamu nggak pernah berniat membangun ulang dari nol, klik di dashboard sekali sudah cukup. Aku sarankan tetap ditulis karena (a) berfungsi sebagai checklist yang bisa dijalankan, dan (b) memaksa dua email datang dari environment, bukan diketik ke file. Isinya: upsert IdP `wp-google`, upsert app `wp` dengan policy inline, cetak AUD. Dijalankan manual dengan token sementara; **bukan** bagian CI.

**Kenapa bukan yang lain sekarang:**

- **Alchemy v2:** beta, memaksa Effect (§4), dan state store default menambah Worker dan Secrets Store ke akun yang mungkin dibagi. Fiturnya lengkap (Access, D1 migrations, stage per PR), jadi layak dilihat lagi kalau sudah stabil.
- **OpenTofu/Terraform:** konsisten dengan repo org lain, bukan denganmu; state butuh R2 (kartu) atau file terenkripsi di git; hasil akhirnya tetap butuh wrangler untuk kode.
- **Pulumi sekarang:** konsisten dengan Go-mu, tapi program, CI, dan state untuk 3 objek lebih berat dari satu script.

**Trigger untuk pindah ke Pulumi Go** (kalau salah satu terjadi):

1. wp butuh tipe resource Cloudflare ketiga selain Worker, D1, dan Access (mis. R2, queue, hostname kedua, atau environment staging permanen).
2. Kamu ingin setting Cloudflare di-review lewat diff seperti setting GitHub.
3. Orang kedua perlu mengubah policy Access tanpa dashboard.

Kalau itu terjadi: **repo terpisah** (mis. `atqamz/cloudflare`, bentuknya sama dengan `atqamz/github`: satu tabel, `Protect(true)`, flag `adopt`), bukan di dalam wp, karena objek tingkat akun (IdP, token, org Access) lintas proyek. Pembagian "IaC memegang edge dan akun, repo aplikasi memegang kode lewat wrangler" persis pola repo kantor.

---

## 4. Effect: perlu untuk app dua user?

**Jawaban: nggak.** Later hanya dengan trigger di bawah.

Penilaian:

- **Yang diselesaikan Effect:** error sebagai tipe, retry/timeout komposabel, resource scope, dan concurrency terstruktur. Itu berguna untuk orkestrasi async yang rumit, bukan untuk Worker dengan tiga endpoint dan satu `batch()` D1.
- **Biaya belajar:** generator `Effect.gen`, `Layer`, tagged error, dan model runtime. Partner B juga harus bisa membaca kodenya, dan frontend tanpa build step nggak bisa berbagi kode Effect dengan Worker.
- **Kedewasaan:** 4.0.0 stabil baru 2026-10-01 dan 4.0.1 pada 2026-10-04 ([npm](https://www.npmjs.com/package/effect)); situs docs masih menampilkan docs v3 secara default dengan pemilih versi ke v4 ([effect.website](https://effect.website/docs/getting-started/introduction/)), jadi docs dan ekosistem masih bergeser.
- **Kopling dengan IaC:** Alchemy v2 dibangun di atas Effect (`effect@^4` peer dependency, README menyebut "Infrastructure-as-Effects"), jadi memilih Alchemy berarti memilih Effect. Dengan memilih wrangler, keduanya terlepas.

**Trigger "later":**

1. Worker punya orkestrasi async nyata: retry dengan backoff ke API pihak ketiga, Workflows atau Queues dengan kegagalan sebagian.
2. Kamu memutuskan Alchemy karena alasan lain dan siap menerima Effect.
3. Kamu ingin belajar Effect untuk dirinya sendiri: lakukan di repo percobaan, bukan di wp.

---

## 5. Stack aplikasi

### 5.1 Keputusan

| Aspek | Pilihan | Catatan |
|---|---|---|
| Bahasa Worker | TypeScript | wrangler mem-bundle TS otomatis; TS adalah [first-class](https://developers.cloudflare.com/workers/languages/typescript/) (2026-07-03). Bahasa first-class lain cuma JavaScript, Python, dan Rust; Go hanya lewat Wasm ([docs](https://developers.cloudflare.com/workers/languages/), 2026-07-03) |
| Bahasa frontend | JS ES modules + JSDoc, `// @ts-check` | Konstrain tanpa build step tetap utuh |
| Struktur Worker | Satu `fetch` handler dengan `switch` pada `${method} ${pathname}`, tiga file (`worker.ts`, `auth.ts`, `sync.ts`) | Lihat §5.2 |
| Router | Nggak ada | Trigger: > ±8 route atau middleware per route → Hono ([4.13.13](https://www.npmjs.com/package/hono), punya `hono/jwk` dengan `jwks_uri`, [docs](https://hono.dev/docs/middleware/builtin/jwk); apakah ia memeriksa `aud` dan `iss` **belum terverifikasi**) |
| Validasi | Fungsi tulisan sendiri dari spec tabel (`public/shared/tables.js`) yang juga menjadi whitelist SQL | Trigger: bentuk payload melebar dari patch per tabel → `valibot` (1.5.0) atau `zod` (4.6.5) |
| Akses D1 | `env.DB.prepare(sql).bind(...)` dan `env.DB.batch([...])`; SQL hanya dari whitelist | Trigger: banyak query dinamis → Kysely (0.29.6). Drizzle didukung wrangler lewat `migrations_pattern` ([docs](https://developers.cloudflare.com/d1/reference/migrations/)) tapi menambah toolchain |
| Migrations | `migrations/NNNN_*.sql`, `wrangler d1 migrations apply wp --remote` di CI | Pakai nama database, bukan nama binding, supaya nggak salah target ([docs](https://developers.cloudflare.com/d1/reference/migrations/), 2026-06-08). Di CI konfirmasi dilewati, backup tetap diambil, dan migration yang gagal di-rollback ([docs](https://developers.cloudflare.com/workers/wrangler/commands/d1/)) |
| Test | `node --test` untuk logika murni dan verifikasi JWT; satu integration test yang menjalankan `wrangler dev --persist-to <tmp>` lalu memanggil API | Node 24 menjalankan `.ts` langsung: type stripping stabil sejak v24.12.0 ([docs Node](https://nodejs.org/docs/latest-v24.x/api/typescript.html)). Trigger untuk [`@cloudflare/vitest-plugin`](https://developers.cloudflare.com/workers/testing/vitest-integration/) (1.3.6, peer `vitest ^4.1`; vitest terbaru 5.0.3, jadi harus dipin ke 4.x): kalau perlu isolasi D1 per test atau test jalan di runtime workerd |
| Dev lokal | `wrangler dev` (D1 lokal, persist antar-run, [docs](https://developers.cloudflare.com/d1/best-practices/local-development/)), seed `scripts/seed.sql` berisi **data palsu saja** | Auth dev lewat flag, lihat §5.2 |
| Tipe Worker | `wrangler types` menghasilkan `worker-configuration.d.ts` (di-commit) | Nggak perlu `@cloudflare/workers-types` |

### 5.2 Struktur Worker dan auth dev

Alur `fetch`:

1. Hanya `/api/*` yang sampai ke Worker (`assets.run_worker_first: ["/api/*"]`); file statis dilayani platform dan gratis. Dengan hash routing nggak perlu mode SPA.
2. `authenticate(request, env)` mengembalikan email atau `null`; `null` berarti 401 JSON.
3. `switch` ke `GET /api/sync`, `POST /api/sync`, `GET /api/login` (redirect ke `/`, kontrak dari brainstorm §3.3).
4. Error mengembalikan JSON generik; nggak ada stack trace atau email di respons maupun log.

**Mode dev tanpa Access:** `package.json` punya `"dev": "wrangler dev --var AUTH_MODE:dev --var DEV_EMAIL:dev@example.test"`. `wrangler dev` mendukung `--var` ([docs](https://developers.cloudflare.com/workers/wrangler/commands/workers/)). Karena `AUTH_MODE` hanya ada di perintah itu, produksi fail-closed. Alasan nggak memakai `.dev.vars`: begitu `secrets.required` didefinisikan, hanya key yang terdaftar yang dimuat dari `.dev.vars` ([docs secrets](https://developers.cloudflare.com/workers/configuration/secrets/)). `npm run check` menyertakan `! grep -q AUTH_MODE wrangler.jsonc` supaya flag itu nggak pernah ikut terkirim.

Sketsa `wrangler.jsonc`:

```jsonc
{
  "name": "wp",
  "main": "src/worker.ts",
  "compatibility_date": "2026-10-06",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "wp.atqamz.com", "custom_domain": true }],
  "assets": { "directory": "./public", "run_worker_first": ["/api/*"] },
  "d1_databases": [
    { "binding": "DB", "database_name": "wp", "database_id": "<uuid dari wrangler d1 create>", "migrations_dir": "migrations" }
  ],
  "secrets": { "required": ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ALLOWED_EMAILS"] }
}
```

`database_id` itu UUID, bukan kredensial (tanpa token nggak berguna); ini penilaianku, bukan klaim docs. `workers_dev` dan `preview_urls` dimatikan eksplisit: `workers_dev` default `false` kalau ada `routes`, dan `preview_urls` "If omitted, Wrangler does not change an existing setting" ([config docs](https://developers.cloudflare.com/workers/wrangler/configuration/)).

### 5.3 Tiap dependency dan alasannya

| Paket | Jenis | Alasan | Alternatif yang ditolak |
|---|---|---|---|
| `jose` 6.2.12 | runtime | Verifikasi JWT Access: signature, `iss`, `aud`, `exp`, JWKS remote dengan cache dan rotasi key. Jalur keamanan, jangan ditulis sendiri. [Docs Cloudflare](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) memberi contoh Workers dengan `jose` | WebCrypto manual (±40 baris, tapi rotasi key dan kesalahan halus jadi tanggunganmu); `hono/jwk` (menarik Hono) |
| `wrangler` 4.147.0 | dev | Bundle, deploy, D1, dev lokal, `wrangler types`. Nggak ada pengganti | |
| `typescript` 7.0.2 | dev | `tsc --noEmit` memeriksa Worker (TS) dan frontend (JSDoc) sekaligus | Nggak ada type check frontend sama sekali |
| `@types/node` | dev | Tipe `node:test` dan `node:assert` untuk file test | Tulis test dalam JS: kehilangan tipe |

Sengaja nggak ada: Hono, zod/valibot, ORM, Workbox, Vite, vitest, `@cloudflare/workers-types`, `wrangler-action`.

### 5.4 Berbagi tipe dengan frontend tanpa build

- **Tipe saja (nol runtime):** `src/types.d.ts` berisi row, mutation, dan kontrak API. Frontend JS merujuknya lewat JSDoc, polanya persis contoh di [handbook TypeScript](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html): `/** @typedef {import('<path relatif>/src/types').Mutation} Mutation */`. Itu komentar, jadi browser nggak mengeksekusi apa pun. `tsconfig.json` dengan `allowJs`, `checkJs`, dan [`erasableSyntaxOnly`](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly) memeriksa Worker dan frontend dalam satu `tsc --noEmit`. `erasableSyntaxOnly` melarang sintaks TS yang nggak bisa dihapus (mis. `enum`), sehingga file TS tetap bisa dijalankan Node di test lewat type stripping. `Env` hasil `wrangler types` nggak tahu `AUTH_MODE` dan `DEV_EMAIL` (cuma datang dari flag dev); deklarasikan sebagai opsional di `src/types.d.ts`.
- **Kode yang dipakai bersama:** `public/shared/tables.js` (spec tabel dan kolom) adalah ES module biasa. Browser memuatnya sebagai asset, Worker meng-import-nya (`../public/shared/tables.js`) dan wrangler men-bundle-nya. Satu file menjadi whitelist server dan generic list screen klien. Isinya spec publik, bukan data.
- **Baru dibagi kalau terbukti duplikat:** mulai dari tipe saja; pindahkan spec ke `shared/` saat generic list screen benar-benar butuh.

---

## 6. Auth

Jawaban singkat untuk pertanyaanmu: **ya, Cloudflare bisa**. Access + identity provider Google + policy `allow` yang berisi tepat dua email. Google hanya membuktikan siapa yang login; yang membatasi ke dua akun adalah policy Access.

### 6.1 Google IdP vs one-time PIN

| | Access + Google IdP | Access + email OTP |
|---|---|---|
| UX di HP | Tap akun Google (instant auth, tanpa halaman pilih) | Ketik email, buka app email, salin kode 10 menit ([docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)); di PWA standalone iOS pindah app mungkin mengganggu (dugaan, belum terverifikasi) |
| Setup | Perlu Google OAuth client (manual) | Nol: cukup email di policy |
| Siapa yang boleh | Google mengizinkan siapa pun punya akun Google untuk *login*; **policy Access** yang membatasi ke dua email ([docs Google IdP](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)) | Cloudflare hanya mengirim kode kalau email diizinkan policy |
| Kegagalan | Salah konfigurasi OAuth memutus login | Kode kena filter email |

**Rekomendasi: Google IdP**, sesuai permintaanmu. OTP tetap bisa ditempel ke app yang sama dalam semenit sebagai jalur darurat; nggak dipasang default supaya halaman login tetap satu tombol.

### 6.2 Langkah setup

**M** = manual, **C** = bisa kode (script atau wrangler).

| # | Langkah | Jenis | Detail |
|---|---|---|---|
| 1 | Putuskan akun, lalu onboarding Zero Trust (team name, plan Free) | M | Onboarding minta detail pembayaran walau Free: "you will not be charged" ([docs](https://developers.cloudflare.com/cloudflare-one/setup/)). Team name unik per organisasi dan jadi subdomain `cloudflareaccess.com` |
| 2 | Google Cloud: buat project, consent screen tipe **External**, OAuth client tipe Web | M | Docs Cloudflare memakai External supaya akun Gmail biasa bisa login ([docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)). Aku nggak menemukan API resmi untuk membuat client web (hanya sumber sekunder: [ulasan](https://apievangelist.com/2026/09/08/google-oauth-console-only-service-accounts-scriptable/index.md), belum terverifikasi dari docs Google) |
| 3 | Isi Authorized JavaScript origin `https://<team>.cloudflareaccess.com` dan redirect URI `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback` | M | Persis sesuai docs Cloudflare di atas |
| 4 | Consent screen status **Testing**, tambah `<email-partner-a>` dan `<email-partner-b>` sebagai test user | M | Testing dibatasi 100 test user dan "authorizations by a test user will expire seven days from the time of consent" ([Google](https://support.google.com/cloud/answer/15549945)): kamu akan diminta consent ulang tiap minggu. Alternatif "Publish app"; apakah muncul layar "unverified" untuk scope dasar **belum terverifikasi** |
| 5 | Buat IdP `google` di Zero Trust (`client_id`, `client_secret`, opsional PKCE) | C | `scripts/access.sh`, atau dashboard. Field ada di [API reference](https://developers.cloudflare.com/api/resources/zero_trust/subresources/identity_providers/methods/create/) |
| 6 | Buat app Access `self_hosted` untuk `wp.atqamz.com`, `allowed_idps` = IdP tadi, `auto_redirect_to_identity` = true, `session_duration` = `720h`, policy inline `allow` dengan dua rule `email` | C | `scripts/access.sh`. Session aplikasi bisa sampai "one month" ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)); 720h = 30 hari. Instant auth direkomendasikan kalau cuma satu IdP ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)) |
| 7 | Catat AUD tag app | C | Script mencetaknya (juga ada di dashboard: Applications → Additional settings) |
| 8 | Pasang tiga Worker secret: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAILS` | M sekali | `wrangler secret put`, atau `wrangler deploy --secrets-file <file>` untuk deploy pertama ([docs](https://developers.cloudflare.com/workers/configuration/secrets/)). `secrets.required` membuat deploy gagal kalau ada yang belum |
| 9 | Custom Domain `wp.atqamz.com` | C | Blok `routes` di `wrangler.jsonc`. Wrangler membuat record DNS dan sertifikat; nggak bisa di hostname yang sudah punya CNAME ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), 2026-09-29) |
| 10 | Matikan `workers.dev` dan preview URL | C | `wrangler.jsonc` (di atas) |
| 11 | Tes di dua HP | M | Lihat §6.5 |

**App Access berbasis hostname, bukan level Worker.** [Docs Workers + Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) menjelaskan dua jalur. Level Worker (destination `worker` + `worker_id`) melindungi semua domain Worker sekaligus, tapi terikat ke ID Worker dan hanya menawarkan policy dasar di dashboard. Berbasis hostname melindungi persis satu URL. Aku pilih hostname karena `workers.dev` dan preview sudah dimatikan di config, dan Worker tetap memverifikasi JWT sendiri di `/api/*` sebagai lapis kedua.

### 6.3 Di mana dua email disimpan

Email **nggak pernah** masuk repo: bukan di `wrangler.jsonc` (`vars` dilarang untuk data sensitif, [docs](https://developers.cloudflare.com/workers/configuration/secrets/)), bukan di fixture test, bukan di docs, bukan di log CI.

| Tempat | Mekanisme | Fungsi |
|---|---|---|
| Password store pribadi yang sudah kamu pakai | Sumber kebenaran, dibaca manual | Disuntik ke environment saat menjalankan `scripts/access.sh` dan `wrangler secret put` |
| Policy Access (di Cloudflare) | Diset script atau dashboard | Gerbang utama |
| Worker secret `ALLOWED_EMAILS` | `wrangler secret put` | Lapis kedua: Worker menolak email yang nggak ada di daftar walau policy Access salah setel. Dibandingkan huruf kecil, dipisah koma |

Sengaja **nggak** disalin ke GitHub Actions secrets: workflow deploy nggak membutuhkannya ("Wrangler will not delete your secrets unless you run `wrangler secret delete`", [docs](https://developers.cloudflare.com/workers/wrangler/configuration/); `secrets.required` hanya memeriksa keberadaan). Test dan fixture memakai `a@example.test` dan `b@example.test`. `.gitignore` awal (digabung dengan daftar di brainstorm §8): `.dev.vars*`, `.env*`, `.wrangler/`, `node_modules/`, `*.ods`, `*.xlsx`, `*.csv`, `import*.sql`, `wp-private/`.

### 6.4 Verifikasi JWT di Worker

Per [docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): validasi header `Cf-Access-Jwt-Assertion` (bukan cookie; cookie "is not guaranteed to be passed"), ambil kunci dari `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, cek `aud` terhadap AUD app, `iss` terhadap team domain, `exp`, lalu baca `email`. Kunci diputar tiap 6 minggu dan kunci lama tetap valid 7 hari, jadi cocokkan lewat `kid`; `createRemoteJWKSet` dari `jose` melakukan itu.

Sketsa `src/auth.ts`:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function authenticate(request: Request, env: Env): Promise<string | null> {
  if (env.AUTH_MODE === "dev") return env.DEV_EMAIL ?? null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    return email && env.ALLOWED_EMAILS.toLowerCase().split(",").includes(email) ? email : null;
  } catch {
    return null;
  }
}
```

Catatan: `ctx.access` **nggak tersedia** untuk Worker dengan static assets: "the router does not pass `ctx.access` to the user Worker" ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), 2026-08-18), jadi verifikasi manual memang perlu. Batasi `algorithms` di opsi `jwtVerify` setelah kamu mengecek `alg` di JWKS (belum terverifikasi). Kalau Access hilang atau salah setel, file statis (kode frontend, tanpa data) terbuka, tapi `/api/*` tetap 401. Itu disengaja.

### 6.5 Manifest dan service worker di balik Access: cek ulang caveat brainstorm

| Caveat | Status 2026-10-06 | Tindakan |
|---|---|---|
| Manifest butuh `crossorigin="use-credentials"` | **Terkonfirmasi.** MDN: "If the manifest requires credentials to fetch, the `crossorigin` attribute must be set to `use-credentials`, even if the manifest file is in the same origin as the current page" ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)) | Pertahankan di `index.html` |
| `ctx.access` nggak ada dengan static assets | **Terkonfirmasi** (§6.4) | Verifikasi JWT manual |
| Navigasi dilayani SW dari cache, nggak pernah sampai ke Access | Berlaku by design | Tombol "Login ulang" menavigasi ke `/api/login`; path `/api/*` dilewati SW |
| Session habis saat `fetch` ke API | Access menjawab dengan redirect ke team domain (lintas origin). Apakah browser `fetch` mendapat 302 atau 401 **belum terverifikasi**: toggle 401 di docs hanya untuk Cloudflare One Client dan service auth ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)). Dengan `fetch` default (follow), redirect ke team domain kemungkinan berakhir sebagai error jaringan yang sulit dibedakan dari offline (inferensi; [docs CORS Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/), 2026-08-25, hanya membahas request lintas origin *ke* domain Access) | `fetch(..., { redirect: "manual" })` dan tangani `opaqueredirect`, 401, dan 403. **Tes di HP asli** |
| **BARU:** update service worker saat session habis | Spesifikasi SW menetapkan redirect mode `error` untuk fetch script SW ([W3C](https://w3c.github.io/ServiceWorker/)): kalau Access mengarahkan `sw.js` ke login, update gagal | Tidak berbahaya: SW lama tetap jalan. Banner "versi baru" baru muncul setelah login lagi |
| Cookie jar PWA iOS terpisah dari Safari | Sumber sekunder menyebut storage Home Screen app terisolasi dari Safari ([MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)); dari docs Apple **belum terverifikasi**. Login Access juga meninggalkan origin app (team domain), dan perilaku redirect keluar-masuk scope di standalone iOS **belum terverifikasi** | Ini risiko #1 di §9. Tes hari pertama, sebelum menulis fitur |
| Session 24 jam default | Sampai "one month" ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)) | Set 720h |
| CORS dan OPTIONS | App same-origin, jadi nggak perlu. Tapi bila frontend dibuka dari origin lain (mis. `localhost` memanggil API produksi), preflight kena 403 ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)) | Partner B mengembangkan frontend lawan Worker lokal (`wrangler dev`), bukan lawan produksi |
| `workers.dev` dan preview URL terbuka | Hostname-based Access hanya melindungi URL itu ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)); preview URL "public by default" ([Previews](https://developers.cloudflare.com/workers/previews/)) | Keduanya dimatikan di config |

---

## 7. CI/CD dan environment

### 7.1 GitHub Actions vs Workers Builds

| | GitHub Actions + `npx wrangler` | Workers Builds |
|---|---|---|
| Token | Account API token yang kamu scope sendiri ([docs](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), 2026-09-18) | "Currently, only user tokens are supported, with account-owned token support coming soon". Token default: Account Settings read, Workers Scripts edit, KV edit, R2 edit, Workers Routes edit untuk semua zone; D1 nggak termasuk, jadi harus ditambah ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token), 2026-09-22) |
| Test dan type check | Satu workflow: `check` dulu, `deploy` kemudian | Perlu workflow GitHub terpisah juga untuk PR, jadi dua sistem CI |
| Preview | Nggak ada (lihat §7.4) | Kalau preview builds diaktifkan, branch non-produksi menjalankan `wrangler preview` secara default ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), 2026-09-22); preview URL publik secara default ([Previews](https://developers.cloudflare.com/workers/previews/)) |
| Secrets | GitHub Actions secrets. Repo publik: secret nggak diteruskan ke workflow dari fork ([GitHub](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions)) | Variable dan secret build di dashboard Cloudflare |
| Limit Free | Menit Actions repo publik | 3.000 menit/bulan, 1 build bersamaan, timeout 20 menit |
| Migrations | Langkah eksplisit sebelum deploy | Harus ditaruh di deploy command |
| Konsistensi | Pola repo kantor: wrangler dari GitHub Actions, bukan Workers Builds | Berlawanan dengan pola itu |

**Rekomendasi: GitHub Actions**, memanggil `npx wrangler` langsung dari lockfile (nggak pakai `cloudflare/wrangler-action`, satu pihak ketiga lebih sedikit; action itu opsional menurut docs Cloudflare). Alasan utamanya: satu sistem untuk test, migrations, dan deploy, dan token yang scope-nya kamu kontrol.

### 7.2 Workflow

Satu file `.github/workflows/ci.yml`, tanpa komentar:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
  deploy:
    if: github.event_name == 'push'
    needs: check
    runs-on: ubuntu-latest
    concurrency:
      group: wp-deploy
      cancel-in-progress: false
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx wrangler d1 migrations apply wp --remote
      - run: npx wrangler deploy
```

`npm run check` = `tsc --noEmit`, `node --test`, dan pemeriksaan `AUTH_MODE` di §5.2. Workflow PR nggak menyentuh secret. Pola dua repo lain: action di-pin ke SHA dengan Dependabot yang menaikkan (`<sha>` di atas adalah placeholder). Repo publik berarti **log publik**: jangan `wrangler whoami`, jangan `echo` nilai, dan **jangan unggah export D1 sebagai artifact** (artifact repo publik bisa diunduh siapa pun).

### 7.3 Token dan secret

| Nama | Tempat | Isi / scope | Catatan |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Account API token `wp-ci`: Account **Workers Scripts Edit** dan **D1 Edit**, ditambah izin zone untuk Custom Domain (mulai dari template "Edit Cloudflare Workers" di [docs CI](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), lalu cabut yang nggak perlu), dibatasi ke satu akun dan zone `atqamz.com` | Izin persis untuk Custom Domain **belum terverifikasi**; tambah seminimal mungkin saat deploy pertama gagal. Nama permission group ada di [daftar permission](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | ID akun | Docs Cloudflare menyuruh menyimpannya sebagai secret; apakah ID akun rahasia nggak dinyatakan docs yang kubaca, jadi aman diperlakukan sebagai secret |
| Token `wp-access-setup` | **Nggak** di GitHub; lokal, sementara | Account: **Access: Apps and Policies Edit** dan **Access: Identity Providers Edit** | Dibuat untuk `scripts/access.sh`, dicabut sesudahnya. Dipisah dari token deploy supaya bocornya secret GitHub nggak memberi kuasa mengubah policy Access |
| Worker secrets (3) | Cloudflare | Lihat §6.2 langkah 8 | Bertahan antar-deploy |

### 7.4 Environment dan preview

- **Satu environment: `production`.** Deploy hanya dari push ke `main`.
- **Preview nggak ada.** PR hanya menjalankan `check` tanpa secret. `workers_dev` dan `preview_urls` false.
- **Dev lokal** cukup untuk frontend dan Worker (D1 lokal, data palsu).
- **Trigger untuk staging:** Partner B ingin mengetes frontend lawan backend nyata tanpa menyentuh produksi, atau migration berisiko. Saat itu pakai `wrangler preview` dengan blok `previews` (butuh wrangler ≥ 4.135): preview "do not inherit production settings", dan D1 hanya terisolasi "when you bind the Preview to a separate resource" ([docs](https://developers.cloudflare.com/workers/previews/), [resources](https://developers.cloudflare.com/workers/previews/resources/)). Preview baru butuh hostname sendiri dan Access sendiri, jadi itu pekerjaan tambahan, bukan gratis.

### 7.5 Menambah wp ke `atqamz/github` nanti

Sesuai README dan `AGENTS.md` repo itu, ubah **tabel** `repos` di `repos.go`, bukan resource baru:

```go
{
	Name:        "wp",
	Description: "Wedding planner PWA",
	RequirePR:   true,
},
```

- `wp` sudah ada di GitHub, jadi jalankan **adopt**: `pulumi config set adopt true`, `pulumi preview`, `pulumi up`, lalu `pulumi config rm adopt` (README bagian "Adopting a repo that already exists"). Jangan jalan tanpa pengawasan.
- Baseline otomatis: tanpa rebase merge, hapus branch saat merge, vulnerability alerts, workflow permission default `read`, dependabot security updates, dan ruleset `main guard` (blokir hapus dan force-push).
- `RequirePR: true` masuk akal untuk wp: `main` mendeploy ke produksi, jadi perubahan harus lewat PR. **Required status checks sengaja nggak dikelola** repo itu (alasan di README: deadlock push langsung), jadi gate CI bergantung pada disiplinmu, bukan GitHub. Ini keputusanmu.
- Tetap manual per README: secret scanning dan push protection (snippet `gh api` di README, wajib untuk repo publik), dan interaction limits (kedaluwarsa tiap enam bulan).
- **Jangan** taruh nilai secret CI di Pulumi (masuk state): `gh secret set CLOUDFLARE_API_TOKEN --repo atqamz/wp` dan `CLOUDFLARE_ACCOUNT_ID`.
- `dependabot.yml` untuk `npm` dan `github-actions` ada di repo wp, bukan di `atqamz/github` (aturan di `AGENTS.md` repo itu).

---

## 8. Layout repo dan checklist bootstrap

### 8.1 Layout

```
wp/
  .github/
    dependabot.yml
    workflows/
      ci.yml
  docs/
    brainstorm.md
    infra.md
  migrations/
    0001_init.sql
  public/
    index.html
    manifest.webmanifest
    sw.js
    app/
      main.js
      router.js
      domain/
      store/
      views/
      ui/
    shared/
      tables.js
    vendor/
  scripts/
    access.sh
    seed.sql
  src/
    worker.ts
    auth.ts
    sync.ts
    types.d.ts
  test/
    auth.test.ts
    sync.test.ts
    domain.test.ts
  .dev.vars.example
  .gitignore
  .node-version
  package.json
  package-lock.json
  tsconfig.json
  worker-configuration.d.ts
  wrangler.jsonc
```

Catatan: `public/` mengikuti layout di brainstorm §6.1. `.dev.vars.example` berisi placeholder untuk tiga secret (`example.test`). Flake Nix + direnv seperti `atqamz/github` sengaja **ditunda**: Partner B butuh jalan lokal dengan `npm ci`, dan Nix bisa jadi penghalang. Tambahkan nanti kalau kamu mau konsistensi penuh.

### 8.2 Checklist bootstrap

**Manual** (kamu, sekali):

| # | Langkah | Keterangan |
|---|---|---|
| M1 | Cek akun: di akun mana zone `atqamz.com` berada, apa isi akun itu (Workers, org Zero Trust, kartu Protect all Workers) | §2.3, keputusan #1 |
| M2 | Onboarding Zero Trust (team name, Free, detail pembayaran) kalau akun belum punya org | Keputusan #12, §9.2 butir 2 |
| M3 | Google Cloud: project, consent screen External + Testing, test user, OAuth client Web, origin dan redirect URI | §6.2 langkah 2 sampai 4 |
| M4 | Buat token `wp-ci` dan `wp-access-setup` | §7.3 |
| M5 | `wrangler d1 create wp`, salin `database_id` ke `wrangler.jsonc` | Manual supaya ID masuk repo. Resource hasil auto-provision dari deploy lewat dashboard/Git: ID-nya "will not be written back" ke repo ([docs](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)) |
| M6 | Jalankan `scripts/access.sh` lokal dengan env dari password store; catat AUD | Lalu cabut `wp-access-setup` |
| M7 | Pasang tiga Worker secret (`wrangler secret put`, atau `--secrets-file` di deploy pertama) | Sebelum deploy pertama, karena `secrets.required` |
| M8 | `gh secret set` untuk `CLOUDFLARE_API_TOKEN` dan `CLOUDFLARE_ACCOUNT_ID` | |
| M9 | Tes di Android dan iPhone: install, login Google, edit offline, session habis, tombol login ulang | §6.5; risiko #1 |
| M10 | Tambah baris `wp` ke `atqamz/github`, aktifkan secret scanning dan push protection | §7.5; setelah repo punya isi |

**Otomatis** (CI, tiap push ke `main`):

| # | Langkah |
|---|---|
| A1 | `npm ci`, `tsc --noEmit`, `node --test`, pemeriksaan `AUTH_MODE` |
| A2 | `wrangler d1 migrations apply wp --remote` |
| A3 | `wrangler deploy`: Worker, static assets, Custom Domain (record DNS + sertifikat), validasi `secrets.required` |
| A4 | Dependabot mingguan untuk `npm` dan `github-actions` |

---

## 9. Risiko, pertanyaan terbuka, dan yang digantikan

### 9.1 Risiko (urut dari paling penting)

1. **Login Access di dalam PWA iOS** (dan Android). Cookie jar terpisah dan redirect ke team domain di luar scope app (§6.5). Mitigasi: tes hari pertama di dua HP; kalau mengganggu, pindah ke Plan B brainstorm (device-key cookie), atau tempel OTP ke app yang sama.
2. **Akun Cloudflare bersama tanpa disadari** (§2.3). Dampak: quota, org Access, token sweep, dan tampilan login. Mitigasi: cek manual M1 sebelum menulis apa pun.
3. **Kebocoran lewat repo publik**: email di fixture, log CI, artifact, `.dev.vars`, export D1, screenshot. Mitigasi: `.gitignore` sejak commit pertama, secret scanning dan push protection, data palsu, nggak ada artifact data.
4. **Token deploy bocor** memberi kuasa deploy kode ke Worker yang terhubung ke D1. Mitigasi: scope minimum, dua token terpisah, `main` lewat PR, hanya action resmi pihak pertama dan di-pin SHA, D1 Time Travel 7 hari ([docs](https://developers.cloudflare.com/d1/reference/time-travel/)).
5. **Consent Google berstatus Testing kedaluwarsa tiap 7 hari** dan **onboarding Zero Trust minta kartu**. Keduanya friksi, bukan kegagalan.
6. **`AUTH_MODE` dev bocor ke produksi.** Mitigasi: flag hanya di perintah `npm run dev`, dicek di `npm run check`.
7. **Quota akun** (§2.5): bug polling atau Worker lain di akun yang sama.
8. **Churn toolchain:** wrangler 4.x rilis sangat sering dan membawa `miniflare` 5.x versi alpha sebagai dependency, TypeScript baru major 7, Node 24 LTS vs 26. Mitigasi: lockfile dan Dependabot.
9. **Godaan IaC/Effect berlebihan.** Mitigasi: trigger di §3.4 dan §4.
10. **Setelah acara:** siapa yang merawat, dan apakah Worker dimatikan setelah export data. Nggak berubah dari brainstorm.

### 9.2 Pertanyaan terbuka untuk kamu

1. Di akun Cloudflare mana `atqamz.com` berada, dan apakah org lain ikut di akun itu? (M1)
2. Oke mengisi detail pembayaran untuk Zero Trust Free? Kalau nggak, Plan B device-key (brainstorm §4) menggantikan Access, dan seluruh §6 berubah.
3. Consent screen Google: tetap **Testing** (consent ulang tiap minggu) atau **Publish app**?
4. Session Access 30 hari cukup, atau mau lebih pendek mengingat data pribadi?
5. `RequirePR` untuk `wp` di `atqamz/github`, mengingat status checks nggak bisa dipaksa dari sana?
6. Flake Nix sekarang atau nanti, mengingat Partner B?
7. Partner B pakai Android atau iPhone? (dari brainstorm; menentukan urutan tes di M9)
8. Perlu export D1 berkala? Kalau ya, ke mana (jangan artifact repo publik)?

### 9.3 Bagian `docs/brainstorm.md` yang digantikan

| Bagian brainstorm | Status |
|---|---|
| §3.3 API satu Worker, router manual | **Tetap**, plus detail `run_worker_first` dan struktur file (§5.2) |
| §3.4 Gambaran arsitektur | **Diganti**: Access berbasis hostname dengan Google IdP, bukan "Worker-level, email OTP" |
| §3.5 Limit free plan | **Tetap**, diverifikasi ulang di §2.5 (ukuran Worker: "There is no compressed size limit", hanya 64 MiB uncompressed, [docs](https://developers.cloudflare.com/workers/platform/limits/)) |
| §4 Auth (rekomendasi OTP dan setup Access "level Worker") | **Diganti** oleh §6: Google IdP, app berbasis hostname, policy inline, verifikasi JWT di `/api/*`. Daftar "Jebakan" diperbarui di §6.5 |
| §5.5 Access + offline | **Sebagian diganti:** 302-vs-401 tetap belum terverifikasi; ditambah update SW (§6.5) dan session 720h |
| §8 "Cara `wp.atqamz.com` disajikan" (sketsa `wrangler.jsonc`) | **Diganti** oleh sketsa di §5.2 (`secrets.required`, `run_worker_first`, `compatibility_date`) |
| §8 "Alur deploy" (rekomendasi Workers Builds) | **Dibalik:** GitHub Actions (§7.1) |
| §8 paragraf "Preview build" | **Diganti** oleh §7.4: mekanisme baru `wrangler preview`, dan wp nggak memakai preview dulu |
| §9 Risiko #3, #6, #7 | **Diurutkan ulang** di §9.1 |
| §10 Rekomendasi langkah 2 ("Access level Worker") | **Diganti** oleh §8.2 |
| §1, §2, §5.1 sampai 5.4, §5.6, §6, §7 | **Tidak tersentuh** |
