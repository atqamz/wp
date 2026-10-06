# Brainstorm: Wedding Planner PWA (`wp.atqamz.com`)

Discussion document, not a final decision. Research as of 6 October 2026; every docs page cited was checked on that date.

> **Privacy.** This repo is public. This document only covers the *structure* of the spreadsheet (sheet names, columns, types, formulas, dropdowns). No real names, phone numbers, addresses, guest names, vendor names, amounts or dates. Examples use made-up placeholders like `Name A`, `+62 8xx-xxxx-xxxx`, `Rp X`.

In short: one Cloudflare Worker that serves both static assets and `/api/*`, data in D1, login through Cloudflare Access (email OTP), a frontend in plain HTML/CSS/JS with no build step and a data layer kept separate from the views. Data is stored locally in IndexedDB so it works offline, then synced to D1. Details and reasons below.

---

## 1. Sheet inventory

### General findings

- **This file is an export of a Google Sheets template.** Evidence: the `FILTER` formula in the Kontak Vendor (vendor contacts) sheet is stored as `__xludf.dummyfunction(...)` with a cached value, and there is a template note telling you to do "File > Make a Copy". As a result that `FILTER` formula is **frozen** in the ODS: opened in LibreOffice, its contents don't update.
- **There is not a single cross-sheet formula.** Every sheet stands on its own. The only links between them:
  - the hyperlink menu in column B of every sheet (11 internal links to cell `A1` of each sheet);
  - two charts whose data source is the sheet itself;
  - *conceptual* relationships filled in by hand (see the [dependency summary](#dependency-summary)).
- **The layout is a "form", not a table.** Headers are in rows 4–7, data starts at column F, and some sheets have 2–12 table blocks side by side. So the import script has to read by cell coordinates, not "first row = header".
- **There are broken template leftovers:** 10 named expressions point to `#REF!`, and some conditional formats use `#ref!`. Safe to ignore.
- **Some sheets seem to still hold sample data from the template, or test data** (for example vendor entries that look randomly typed). Before import, we need to sort out which data is real.

### 1.1 DASHBOARD

- **Purpose:** front page. It holds the menu, the couple's name label, the wedding date, a countdown and the template notes.
- **Fields:** couple label (string); wedding date (date).
- **Formula:** countdown `=[.F10]-TODAY() & " Days"`. The result is a string, not a number.
- **Validation:** `val1` (value must be a date) is applied to block `E10:E18` and the date cell.
- **Other:** 11 menu hyperlinks and a "Catatan Penting" (important notes) block with template text.

### 1.2 Timeline

- **Purpose:** preparation checklist plus an 8-week Gantt grid.
- **Header:**
  - `Tanggal Dimulai` (start date) (date);
  - `Tampilkan Minggu` (show week) (integer, the week offset shown by the grid);
  - wedding label (string, the couple's name retyped; duplicate of DASHBOARD).
- **Task table** (rows 8–52, 45 slots):

  | Column | Type | Contents / formula |
  |---|---|---|
  | E (no) | number | `=IF([.F8]<>"";ROW([.D1]);"")` |
  | `Persiapan` (preparation) | string | task name |
  | `Start Date` | date | validation `val2` (must be a date) |
  | `End Date` | date | validation `val2` |
  | duration | number | `=IF([.H8]="";""; DATEDIF([.G8];[.H8];"d"))`, displayed as "N Hari" (N days) |
  | `Status` | string | `=IF([.F8]="";""; IF([.K8]=1;"Selesai";"Proses"))` |
  | K | boolean | done checkbox |

- **Total days:** `=SUM(H8:H52)-SUM(G8:G52)+1`.
- **Gantt grid `L:BO`** (56 day columns):
  - header rows: "Minggu N" (week N), date, and day abbreviation via `INDEX({"Sen"|…|"Mgg"};WEEKDAY(…;2))`;
  - grid start date: `=G4-WEEKDAY(G4;1)+2+7*(J4-1)`.
- **Conditional formatting:** highlight today; bar between start and end; progress bar `checkbox × duration`; colours for Selesai (done) / Proses (in progress) status.
- **Task contents:** generic template (*lamaran* (formal engagement proposal), *KUA* (Office of Religious Affairs, the marriage registry) paperwork, vendor/*WO* (wedding organizer), *seserahan* (ceremonial gift exchange), invitations, fitting, honeymoon, and so on).

### 1.3 Skenario Budget (budget scenarios)

- **Purpose:** static reference. There are 6 scenario tables with different total budgets.
- **Columns of each table:** `NO` (number), `LIST PERSIAPAN` (string), `BIAYA` (currency). 10 items per scenario.
- **Formula:** `Total = SUM(BIAYA)` per table.
- **Not referenced by other sheets.**

### 1.4 Anggaran Pernikahan (wedding budget)

- **Purpose:** bills and payments per event.
- **Three event tables:** `ANGGARAN LAMARAN` (10 slots), `ANGGARAN AKAD` (5 slots), `ANGGARAN RESEPSI` (10 slots). (*Akad* is the marriage contract ceremony, *resepsi* is the wedding reception.)
- **Columns:**

  | Column | Type | Formula |
  |---|---|---|
  | `No` | number | – |
  | `Kegiatan` (event) | string | – |
  | `Tagihan (Awal)` (bill, initial) | number | – |
  | `DP/Lunas`, `Termin 1`, `Termin 2` | number | – |
  | `Total Dibayar` (total paid) | number | `=IF([.G18]="";"";SUM([.I18:.K18]))` |
  | `Tagihan (Sisa)` (bill, remaining) | number | `=IF([.L18]="";"";[.H18]-[.L18])` |

  Each table ends with a `Total` row = `SUM` per column.
- **Summary matrix:**
  - rows: Tagihan (Awal), DP/Lunas, Termin 1, Termin 2, Total Dibayar, Tagihan (Sisa);
  - columns: LAMARAN, AKAD, RESEPSI, SUBTOTAL KEGIATAN;
  - the contents are `SUM`s of the tables below.
- **Bugs in the sheet:**
  - The `Subtotal Kategori` row = `SUM` of all six summary rows. That adds bills, payments and remainders into one number (double counting), so the figure is meaningless.
  - The AKAD × Termin 1 cell in the summary is filled with the text `---`, not a formula.
- **Chart (Object 1):** bar chart of Total Dibayar vs Tagihan (Sisa) (subtotal column).
- **Limitation:** payments are fixed at 3 columns (DP, T1, T2). There is no due date and no payment date.

### 1.5 Target Tabungan (savings target)

- **Dropdowns:** year (`val3`, a list of 5 years) and month (`val4`, Januari–Desember, 14 row slots).
- **Columns:** month (string from the dropdown), `Masuk` (deposit) for the groom-to-be (number), `Masuk` for the bride-to-be (number).
- **Formula:** `TARGET` is a typed-in constant; `TERKUMPUL = SUM(G6:G19)+SUM(H6:H19)`.
- **Chart (Object 2):** TARGET vs TERKUMPUL (collected).
- **Not there:** remaining shortfall, monthly target, or projection.

### 1.6 List Seserahan (*seserahan* list)

- **Columns:**
  - `Kebutuhan` (need) (string);
  - `Link Pembelian` (purchase link) (marketplace short-link URL);
  - `Harga (Rp)` (price) (number);
  - `Kategori` (dropdown `val5`: Perangkat Alat Solat (prayer set), Make Up & Skin Care, Peralatan Mandi (toiletries), Pakaian Dalam (underwear), Pakaian Luar (outerwear), Kebutuhan Lain (other needs));
  - `Status` (dropdown `val6`: Selesai (done), On Proses (in progress), Belum Selesai (not done)).
- **Formula:** `ESTIMASI BIAYA = SUM(Harga)` (cost estimate).
- **Size:** about 37 filled rows, slots up to row 50.

### 1.7 List Administrasi (paperwork list)

- **Columns:**
  - `No`;
  - `Dokumen Pernikahan` (wedding document) (string);
  - `Nominal`, `Detail`, `Jumlah` (all empty);
  - `Status` (dropdown `val7`: Selesai (done), Belum (not yet)).
- **Contents:** documents for the KUA, for example registration, photocopies of the couple's and their parents' IDs, health certificate, vaccination, neighbourhood-office cover letter, passport photos, stamp duty and the *mahar* (the groom's wedding payment) for the application.
- **`CATATAN` (notes) block:** a long text on the process of getting a marriage certificate: *RT/RW* (neighbourhood heads) → *kelurahan* (village office; forms N1/N2/N4) → home KUA (recommendation to marry elsewhere, *numpang nikah*) → destination KUA.
- **Formula:** none.

### 1.8 Kontak Vendor (vendor contacts)

- **Left table `LIST RENCANA VENDOR` (vendor plan list):**
  - `Ops Vendor` (dropdown `val8`: Venue, Decoration, Wedding Organizer, MUA, Catering, Photography, Attire, Hand Bouquet, MC, Entertaiment; the typo is from the source);
  - `Nama Vendor` (vendor name) (string);
  - `No Tlp` (phone no.): stored as a **number**. Leading zero and `+62` are lost, so it has to be normalised on import;
  - `PIC` (string);
  - `Action` (dropdown `val9` with one option: `FIX`).
- **Right table `FIX KERJASAMA VENDOR` (confirmed vendors):**
  - columns: `No` (`=IF([.O5]<>"";ROW(...);"")`), `Vendor`, `Nama Vendor`, `No Tpl`, `Catatan` (notes);
  - the contents are the Google Sheets version of `FILTER(F5:I37,(J5:J37="FIX"))`, which in the ODS became a frozen cached value.
  - The 4th column header on the right (`Catatan`) differs from the left column (`PIC`), so the labels don't match.

### 1.9 List Tamu (guest list)

- **Structure:** two sides, `LIST TAMU MEMPELAI LAKI-LAKI` (groom's guest list, columns F–Q) and `LIST TAMU MEMPELAI PEREMPUAN` (bride's guest list, columns U–AF).
- **Each side has 6 categories:** Teman (friends), Kolega (colleagues), Keluarga (family), Tetangga (neighbours), Teman Orang Tua (parents' friends), VIP.
- **Each category = 2 columns:** name (string) and count (number, probably the number of people per invitation).
- **Formula:** the count column header = `SUM` of rows 5–36 (32 slots).
- **Currently empty.**
- The shape is *wide* (12 blocks). In the app it becomes *long*: one row per guest.

### 1.10 Rundown Acara (event rundown)

- **Two tables:** `RUNDOWN ACARA LAMARAN` and `RUNDOWN RESEPSI DAN PERNIKAHAN` (*akad* and *resepsi* combined).
- **Columns:**
  - checkbox (boolean, filled by the formula `TRUE()`/`FALSE()`);
  - `No`;
  - `Waktu` (time): a **string** range `HH.MM - HH.MM`, not a time type;
  - `Acara` (event), `PIC`, `Keterangan` (remarks);
  - only in the *lamaran* table: `Highlights` (multi-line text).
- **Conditional formatting:** the row is highlighted when the checkbox is ticked; the number is highlighted when `Acara` is empty.

### 1.11 List Lagu (song list)

- **Columns:** `No`, `Judul` (title), `Penyanyi` (singer).
- **Formula:** none.
- **Not there:** a moment column (for example "bride's entrance").

### Dependency summary

**Formulas inside a sheet** (none cross sheets):

- **Budget:** summary ← the three event tables.
- **Savings:** TERKUMPUL ← monthly entries.
- **Seserahan:** ESTIMASI ← price column.
- **Guests:** category header ← count columns.
- **Vendors:** FIX table ← plan table (through `FILTER`, frozen in the ODS).
- **Dashboard:** countdown ← wedding date.

**Conceptual dependencies** (filled in by hand, prone to mismatched numbers):

```
Skenario Budget ──reference──▶ Anggaran Pernikahan ◀──"Seserahan" row── List Seserahan (estimate)
                                   ▲    ▲
             FIX vendors ──────────┘    └──── KUA fees / mahar ──── List Administrasi
Dashboard (date, name) ◀──retyped──▶ Timeline (wedding label)
Timeline (tasks) ──mentions──▶ seserahan, administration/KUA, vendors, invitations, guests, rundown
Target Tabungan ──compared by hand──▶ Anggaran total
```

---

## 2. Feature map and MVP cut

### Sheet → app mapping

| Sheet | In the app | Status |
|---|---|---|
| DASHBOARD | Home: countdown, budget summary, savings progress, 5 nearest tasks/payments | MVP |
| Timeline | Task list (start, end, done), sorted by date, "late" badge. Gantt grid **dropped** | MVP (simplified) |
| Skenario Budget | Dropped. If needed, it later becomes a "preset" at initial setup | Drop |
| Anggaran Pernikahan | Budget items per event (*lamaran*/*akad*/*resepsi*) + **payment rows** (DP/instalments become free-form rows, with a due date) | MVP |
| Target Tabungan | Deposit entries per month per person + progress toward the target | MVP |
| List Seserahan | Generic list (price, link, category, status, total) | MVP |
| List Administrasi | Generic checklist (document, amount, detail, quantity, done). The KUA process notes become static text | MVP |
| Kontak Vendor | One vendor table with status `opsi`/`fix` (the FIX table becomes a filter) + call/WhatsApp buttons | MVP (merge) |
| List Tamu | One guest table (side, category, name, number of people) + total per side/category | MVP (merge) |
| Rundown Acara | Rundown per event + **wedding-day mode** (offline, highlights "now/next", tick-off) | MVP |
| List Lagu | Generic list (title, singer, note) | MVP |

**Dropped:**

- the Gantt grid and `Tampilkan Minggu`;
- the hyperlink menu (replaced by a bottom nav);
- charts (replaced by native `<progress>`, see [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/progress));
- Skenario Budget;
- the template notes text.

**Merged:**

- the couple's date and name (DASHBOARD + Timeline label) → one `settings` table;
- vendor plan + FIX → one table;
- DP/Termin 1/Termin 2 → the `payments` table;
- 12 guest blocks → one table.

### The laziest way: one generic list screen

Seven of the eleven sheets have the same shape: rows with a few fields, a status/checkbox, and one total. So build **one** list+form component configured per table (fields, input type, columns to sum, group by), instead of seven separate screens.

Only three dedicated screens:

1. Dashboard.
2. Budget (payments nested under the item).
3. Rundown wedding-day mode.

Input types use native elements:

- `<input type="date">` and `<input type="time">`;
- `<input type="month">` for savings. Supported in Chrome Android and iOS Safari, but **not** in desktop Safari/Firefox according to [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/month) and [browser-compat-data](https://github.com/mdn/browser-compat-data). It's mobile-first, so that's fine;
- `<datalist>` for category suggestions, so categories stay free-form but there are choices.

### MVP definition: "the spreadsheet can be retired"

1. You two can log in, and the data syncs across two phones.
2. All data from the sheets can be viewed, added, edited and deleted, including offline.
3. The dashboard shows the countdown, total billed/paid/remaining, savings progress, and what's nearest.
4. The wedding-day rundown opens without signal.
5. One-time import from the ODS.

### Cheap extras that ship with the MVP

All of them are just client-side calculations or one link:

- **Countdown:** from `settings.wedding_date`.
- **Payment due date:** an "overdue" badge and a "next 7 days" list.
- **Savings progress:** plus "need to save `Rp X`/month" = (target − collected) / months left until the wedding day.
- **Tap-to-call and WhatsApp:**
  - phone: `tel:+628xxxxxxxxxx`;
  - WhatsApp: `https://wa.me/628xxxxxxxxxx` (official click-to-chat format, [WhatsApp FAQ](https://faq.whatsapp.com/5913398998672934)).

  Both need a number already normalised to international format.
- **Offline rundown:** the data is already in IndexedDB, so only the view is left.

### Backlog (in priority order)

1. **"Add to calendar"** for payment due dates and tasks. It's an `.ics` file generated on the client, then the phone's calendar handles the reminder. Zero server code. This is the cheapest replacement for push.
2. **CSV export** per table, for backup and archive after the event. D1 Time Travel is only 7 days on the free plan, see [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
3. **Extra guest fields:** phone number, invitation sent, attendance status, and a WhatsApp invitation link.
4. **Share rundown** to WhatsApp as text (`https://wa.me/?text=…`, text URL-encoded; [WhatsApp FAQ](https://faq.whatsapp.com/5913398998672934)).
5. **Web Push reminder.** Only if `.ics` turns out to be not enough, see §5.6.
6. **Public RSVP page.** Only if truly needed, see its privacy cost in §4.
7. **Attachments** (receipt photos, moodboard) in R2. Needs an R2 subscription with checkout, see §3.
8. **Realtime** (Durable Objects + WebSocket). Most likely never needed for two people.

### Indonesian wedding specifics implied by the sheet

- **Three events:** *lamaran*, *akad*, *resepsi*. So the `event` enum in the budget, and the grouping of the rundown (the sheet combines *akad* + *resepsi* in one rundown).
- **Seserahan:** categories exactly like the sheet's dropdown; there is a total estimate and a purchase link.
- **Paperwork:** KUA document checklist and process notes on the N1/N2/N4 forms and *numpang nikah* (getting married at another KUA).
- **Mahar:** appears in the budget and in the paperwork.
- **Guests:** split by the groom's/bride's side.

---

## 3. Architecture on the Cloudflare free plan

### 3.1 Hosting: Workers static assets vs Pages

| | Workers + static assets | Pages |
|---|---|---|
| Requests for static files | "free and unlimited", not counted against the Worker quota ([docs](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)) | static is free; requests to Pages Functions count against the Workers quota ([docs](https://developers.cloudflare.com/pages/platform/limits/)) |
| API | The same Worker (`/api/*`) | Pages Functions (still the Workers runtime) |
| Features | Cron Triggers, Workers Logs, Gradual Deployments are in Workers, not in Pages ([migration matrix](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)) | fewer |
| File limits | 20,000 files/version, 25 MiB/file ([docs](https://developers.cloudflare.com/workers/platform/limits/)) | 20,000 files, 25 MiB/file, 500 builds/month ([docs](https://developers.cloudflare.com/pages/platform/limits/)) |
| Custom domain | Custom Domain needs an active Cloudflare zone ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)). The `atqamz.com` zone is already on Cloudflare, see §8 | a subdomain can go through CNAME without a zone ([docs](https://developers.cloudflare.com/pages/configuration/custom-domains/)). This advantage isn't relevant here |

**Choose Workers + static assets:** one deploy unit, free unlimited static files, and extra features (cron for reminders) are available if we need them later.

### 3.2 Storage: D1 vs KV vs R2 vs Durable Objects

- **D1 (chosen).**
  - Real SQL, fits the tabular shape of the data.
  - Batch statements run as a SQL transaction ([docs](https://developers.cloudflare.com/d1/worker-api/d1-database/)).
  - There's `wrangler d1 export`, migrations, and 7-day Time Travel on the free plan as a safety net if data gets overwritten ([limits](https://developers.cloudflare.com/d1/platform/limits/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)).
- **KV (no).**
  - The free plan is only 1,000 writes/day ([pricing](https://developers.cloudflare.com/kv/platform/pricing/)) and 1 write/second per key ([limits](https://developers.cloudflare.com/kv/platform/limits/)).
  - Eventually consistent: a change can take "up to 60 seconds or more" to show up in other locations ([how KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)).
  - Bad for two people editing the same list.
- **R2 (not yet).**
  - For files/attachments, not row data.
  - Needs "an R2 subscription" through checkout ([get started](https://developers.cloudflare.com/r2/get-started/)), which means adding a payment method even on the free tier.
  - Put it in the backlog.
- **Durable Objects (an alternative, not chosen).**
  - The free plan only allows SQLite-backed ([pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)). The quota is similar to D1 and there's WebSocket for realtime.
  - But it needs a class, bindings, DO migrations, and routing to an instance. More code for consistency that D1 already gives well enough (one database, one primary).
  - Keep it as an option if realtime is truly needed.

A super-lazy alternative we deliberately **didn't** pick: a single table `items(kind, data JSON)`. Fewer migrations, but it loses SQL constraints and makes import/aggregation messier.

### 3.3 API: one Worker, two endpoints

A manual router with a `switch` on `pathname`, no framework. The contract:

```
GET  /api/sync?since=<rev>   → { rev, changes: { <table>: [rows...] } }
POST /api/sync               ← { mutations: [{ id, table, op: "create"|"update"|"delete", row_id, patch }] }
                             → { rev, rows: { <table>: [rows after applied] } }
GET  /api/login              → 302 to "/" (only used to trigger the Access login, see §5.5)
```

Tables and columns are whitelisted in the Worker. Sync details are in §5.

### 3.4 Overview

```
Partner A's phone / Partner B's phone (PWA: Service Worker + IndexedDB)
        │  HTTPS wp.atqamz.com
        ▼
Cloudflare Access (Worker-level, email OTP) ──reject unless it's one of those 2 emails
        ▼
Worker "wp"
  ├─ static assets (public/)  → free, doesn't use request quota
  └─ /api/sync, /api/login    → D1 "wp"
```

### 3.5 Free plan limits (checked 6 October 2026)

| Service | Free limit | When hit | Source |
|---|---|---|---|
| Workers requests | 100,000/day per account, resets at midnight UTC (7 am Western Indonesia Time, WIB) | Error 1027. "Fail open" routes bypass the Worker; "fail closed" shows the 1027 page. For this app that means the API is down until the reset | https://developers.cloudflare.com/workers/platform/limits/ |
| Static assets | requests "free and unlimited". Paths in `run_worker_first` still call the Worker | `run_worker_first` paths get 429 when the quota runs out | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ |
| Workers CPU | 10 ms per HTTP request and per Cron Trigger | Error 1102 "Worker exceeded resource limits" | https://developers.cloudflare.com/workers/platform/limits/ |
| Other Workers limits | memory 128 MB; subrequests 50/request; Worker size 64 MiB; 100 Workers; **5 Cron Triggers per account**; 20,000 asset files/version; 25 MiB/file | deploy rejected / error | https://developers.cloudflare.com/workers/platform/limits/ |
| D1 rows read | 5 million / day (counts rows *scanned*, not rows returned) | D1 queries error until the 00:00 UTC reset | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 rows written | 100,000 / day (an index adds 1 row written per index hit) | D1 queries error until the reset | https://developers.cloudflare.com/d1/platform/pricing/ |
| D1 storage | 5 GB total per account; 500 MB per database; 10 databases; 50 queries per invocation; Time Travel 7 days | must delete data before you can insert/alter again | https://developers.cloudflare.com/d1/platform/limits/ |
| KV | 100,000 reads/day; 1,000 writes/day; 1,000 deletes/day; 1,000 lists/day; 1 GB; 1 write/second per key | operations of that kind error until 00:00 UTC | https://developers.cloudflare.com/kv/platform/pricing/ · https://developers.cloudflare.com/kv/platform/limits/ |
| R2 | 10 GB-month/month; Class A 1 million/month; Class B 10 million/month; free egress; Standard storage only | an R2 subscription via checkout is required. Above the free tier you're billed at the pricing page rates. **Unverified** whether a hard cap can be set | https://developers.cloudflare.com/r2/pricing/ · https://developers.cloudflare.com/r2/get-started/ |
| Durable Objects | SQLite-backed only; 100,000 requests/day; 13,000 GB-s/day; 5 million rows read/day; 100,000 rows written/day; 5 GB | operations error until 00:00 UTC; storage full → `SQLITE_FULL` | https://developers.cloudflare.com/durable-objects/platform/pricing/ · https://developers.cloudflare.com/durable-objects/platform/limits/ |
| Access (Zero Trust Free) | free "for up to 50 users". A seat is used when a user authenticates | the 51st user can't be added. **Unverified** in the official docs what exactly happens | https://developers.cloudflare.com/reference-architecture/architectures/sase/ · https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/ |
| Access onboarding | payment details must be filled in when setting up Zero Trust. For the Free plan "you will not be charged" | – | https://developers.cloudflare.com/cloudflare-one/setup/ |
| Access session | from expiring immediately up to one month; global and application default 24 hours | the user has to log in again (new OTP code) | https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/ |
| Workers Builds (CI) | 3,000 build minutes/month; 1 concurrent build; 20 minute timeout | builds queue / fail | https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/ |

### 3.6 Usage estimate and what breaks first

Rough assumption: every app open = 1 pull + a few pushes.

- **Workers requests:** 2 people × 30 opens × 3 requests ≈ 180 requests/day, under 0.2% of 100,000.
- **D1 rows read:** total data is roughly thousands of rows. Pull uses the `rev` index, so only changed rows are read. Even a full pull of 1,000 rows × 60 times/day = 60 thousand rows read, about 1.2% of 5 million.
- **D1 rows written:** 1 edit ≈ 1 table row + 1 `rev` index row + 1 `sync_state` row ≈ 3. So 300 edits/day ≈ 900, under 1% of 100,000.

For two people, nothing breaks **unless there's a bug**. Risks in order:

1. **A polling or retry loop.** Polling 1×/second = 86,400 requests/day per phone. Two phones already pass 100,000. The rule: **never poll.** Sync only when the app opens or gets focus, after a change, and on the `online` event.
2. **Repeated full scans.** `SELECT *` without an index inside a loop can burn 5 million rows read. Use the `rev` index.
3. **Shared quota.** The Workers quota is counted per account, and the 5 Cron Triggers are per account too. If the same account is used by other projects, the quota is split. **Unverified:** whether there are other Workers on your account.
4. **KV if used for sessions/counters.** 1,000 writes/day runs out fast. Don't use KV.
5. **10 ms CPU.** Don't parse the ODS in the Worker; do the import offline (§7). JWT verification uses native WebCrypto, so it's safe.

---

## 4. Auth for two people

| Option | Code to write | UX on the phone | Cost | Notes |
|---|---|---|---|---|
| **Cloudflare Access + email one-time PIN** | ±0 (dashboard configuration) + JWT validation | type email → code in the email (valid 10 minutes) → in. Repeat each time the session expires (max 1 month) | free up to 50 users, but onboarding asks for payment details | email identity is available in the JWT. [OTP docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) |
| Access + identity provider (e.g. Google) | same | tap "Login with Google". Faster if both have Google | same | need to create an OAuth client in Google |
| Self-made magic link in Workers | token table, send email, session cookie, expiry, CSRF | click the link in the email | free. Sending to *verified destination addresses* is free on all plans ([Email Service](https://developers.cloudflare.com/email-service/)), but needs Email Routing enabled on the zone | our own security code |
| Passkey (WebAuthn) in Workers | registration + assertion + store challenge + COSE verification | nicest (Face ID/fingerprint) | free | the most code. `@simplewebauthn/server` only mentions Node and Deno ([docs](https://simplewebauthn.dev/docs/packages/server)); Workers support is **unverified** |
| "Device key" cookie (simplest) | ±20 lines: `/setup?key=…` checks a secret → sets a signed HttpOnly cookie | open the setup link once per phone, done | free, no card | the setup link = a credential. Leak = access. Revoke by changing the secret |
| HTTP Basic Auth | ±10 lines | behaviour in an iOS standalone PWA is **unverified** (the prompt may show up repeatedly) | free | not recommended |

### Recommendation: Cloudflare Access with email OTP

Reason: zero auth code to write, managed by Cloudflare, and revoking is just editing the policy.

**Setup:**

1. Put Access at the **Worker level**. This mode automatically protects the Custom Domain, `workers.dev` and preview URLs at once ([Workers + Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)).
2. Create an Allow policy with an Include of exactly 2 email addresses ([policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)).
3. Set the session to the maximum of 1 month so logins are rare.

**Traps to handle:**

- **`ctx.access` isn't available.** A Worker with static assets runs behind an internal router, and that router "does not pass `ctx.access` to the user Worker" ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)). So validate the `Cf-Access-Jwt-Assertion` header ourselves using the JWKS at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)). The `jose` library supports Cloudflare Workers ([README](https://github.com/panva/jose)). This is a dependency worth having because it's security-related. The email from the JWT is used for the `updated_by` column.
- **Manifest.** A manifest that needs credentials must use `crossorigin="use-credentials"`, "even if the manifest file is in the same origin" ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)). Without it, the manifest hits the login redirect and install can fail.
- **Session expiring inside the PWA.** API requests get redirected to the login page. How to handle it is in §5.5.
- **Zero Trust onboarding asks for payment details** even on Free ([setup](https://developers.cloudflare.com/cloudflare-one/setup/)). If that's not acceptable, use **Plan B: the device-key cookie**: the least code, no third party, and offline-friendly.
- **The iOS PWA cookie jar is separate.** On iOS, the cookies of a Home Screen web app are separate from Safari, so login has to be done *inside* the PWA. This is **unverified** in the official Apple docs, so it needs testing on day one.

### The public part and its privacy cost

The sheet has no RSVP column, so the MVP has **no public part at all**. If we want RSVP later:

**Privacy cost:**

- Anyone holding the link can see guest names, the date, and the event location.
- The invitation link will definitely be forwarded in WhatsApp groups.
- A public endpoint can be enumerated or spammed.

**Minimal mitigations:**

- Split it onto another hostname (e.g. `rsvp.atqamz.com`), or create a separate Access application for one path with the **Bypass** action ([policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)). Access can be applied per path, for example `example.com/login` ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)).
- One random token per guest. The endpoint only returns that guest's row, with no listing.
- Writes are limited to the RSVP fields only.

**Advice:** don't build it unless truly needed. Also make sure `workers.dev` and preview URLs aren't publicly open: set `workers_dev: false`, `preview_urls: false`, or protect them through Worker-level Access ([wrangler config](https://developers.cloudflare.com/workers/wrangler/configuration/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)).

---

## 5. Offline and sync

### 5.1 Service Worker strategy

- **App shell** (HTML, CSS, JS, icons, vendor libs) is *precached* under a versioned cache name, then served cache-first.
- **Navigation:** always served from the cached `index.html`, so the app still opens without signal.
- **`/api/*`:** **network-only**, never goes into the Cache API. Data lives in IndexedDB.
- **Update:** a new SW shows a "New version, reload" banner. `skipWaiting` is called when the banner is tapped.
- **No Workbox.** About 20 lines is enough:

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

### 5.2 Reading and writing offline

- **IndexedDB** ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)) is the source of data for the UI.
  - One object store per table, plus an `outbox` store and a `meta` store (which holds the last `rev`).
  - Use the `idb` wrapper (about 3.4 KB gzip, measured from `build/index.js` of version 8.0.3), or write our own promise wrapper of about 30 lines. Dexie (about 31 KB gzip) is overkill for this need.
- **Write:**
  1. Update the local store (the UI changes immediately).
  2. Add a mutation `{ id: crypto.randomUUID(), table, op, row_id, patch }` to `outbox`.
  3. Try to flush.
- **When to flush:** after writing, when the app opens, on `visibilitychange` to visible, and on the `online` event.
- **Don't rely on Background Sync.** `SyncManager` isn't supported in Safari or Firefox (data from [browser-compat-data](https://github.com/mdn/browser-compat-data), see also [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)). The outbox only gets sent while the app is open, and that's enough.
- **Limit the batch size.** Flush at most about 20 mutations per request because the free plan limits D1 to 50 queries per invocation ([limits](https://developers.cloudflare.com/d1/platform/limits/)). Whether one `batch()` counts as 1 or N queries is **unverified**, so play it safe.
- **Read:** `GET /api/sync?since=<rev>`, then merge into IndexedDB and store the new `rev`.
- **IDs are created on the client** (`crypto.randomUUID()`, supported in Safari 15.4+ according to [browser-compat-data](https://github.com/mdn/browser-compat-data)), so rows created offline don't collide.

### 5.3 Conflicts between two phones

For two people, this strategy is enough without CRDTs:

- **`rev` from the server.** One global counter in `sync_state`. Every write request bumps that counter inside one `batch()` (a transaction), and all rows written get that `rev`. Pull uses `WHERE rev > ?`. This cursor doesn't depend on the phone's clock.
- **Last-write-wins per field.** The client only sends the fields that changed (`patch`). So if Partner A changes the price and Partner B changes the status on the same row, both survive. If it's the same field, whichever reaches the server last wins.
- **See who changed it.** The `updated_by` and `updated_at` columns are shown. If a pull overwrites a field that was just edited locally, show a toast "changed by Partner B just now".
- **Delete = tombstone** (`deleted_at`). If one person deletes and the other edits, the delete wins. Undo is just clearing `deleted_at`.
- **List order** (rundown, tasks) uses `sort REAL` (fractional index: insert between two numbers). Moving one row only writes one row, so there's no renumber conflict.
- **Leftover case:** if an ack is lost and the mutation is resent late, someone else's edit on the same field can get overwritten. This risk is accepted. The safety nets are `updated_by` and 7-day D1 Time Travel.

Example write in the Worker (applied in one `env.DB.batch([...])`):

```sql
UPDATE sync_state SET rev = rev + 1 WHERE id = 1;
UPDATE vendors
   SET phone = ?1, status = ?2,
       rev = (SELECT rev FROM sync_state WHERE id = 1), updated_at = ?3, updated_by = ?4
 WHERE id = ?5;
```

### 5.4 Installing on Android and iOS

**Android (Chrome):**

- Install criteria: a manifest with `name`/`short_name`, 192 px and 512 px icons, `start_url`, standalone `display` (or similar), and HTTPS.
- There's also an engagement heuristic: at least one tap and ±30 seconds on the page ([web.dev](https://web.dev/articles/install-criteria)).
- The `beforeinstallprompt` event only exists in Chromium ([browser-compat-data](https://github.com/mdn/browser-compat-data)). It can be used for our own "Install" button.

**iOS/iPadOS:**

- There's no `beforeinstallprompt`. Install is manual through Share → Add to Home Screen ([web.dev](https://web.dev/learn/pwa/installation-prompt)). Since iOS 16.4, third-party browsers may also offer Add to Home Screen from the Share menu ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)), but Safari is still the most reliable route.
- Since Safari 26, "every website added to the Home Screen opens as a web app" by default, and a manifest is no longer required ([WebKit](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
- Show an instruction banner just once for iOS Safari.

**Why we must install to the Home Screen (especially on iOS):**

- **7-day deletion.** The ITP rule that deletes storage after 7 days without interaction doesn't apply to Home Screen web apps: "We do not expect the first-party in such a web application to have its website data deleted" ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)).
- **Persistent storage.** `navigator.storage.persist()` is granted by WebKit based on heuristics "like whether the website is opened as a Home Screen Web App" ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)).
- **Quota.** The quota for a Home Screen web app is the same as for a browser app, up to 60% of disk.
- D1 is still the source of truth. IndexedDB is only a cache that can be rebuilt.

### 5.5 Access + offline

- **Offline:** the app shell from the cache and the data from IndexedDB keep working even if the Access session has expired. Writes go into the outbox queue.
- **Online but the session expired:** API requests get redirected to the login. Detect it like this:

  ```js
  const res = await fetch(`/api/sync?since=${rev}`, { redirect: 'manual' });
  if (res.type === 'opaqueredirect' || res.status === 401) showLoginBanner();
  ```

- **The "Log in again" button navigates to `/api/login`.** Navigating to `/` doesn't work, because `/` is served by the SW from the cache and never reaches Access. The `/api/*` path is skipped by the SW, so Access intercepts, the user logs in, and then the Worker redirects to `/`.
- **Unverified:** whether Access answers a non-navigation fetch with 302 or 401. The code above handles both. **Test on a real phone.**

### 5.6 Web Push for reminders: realistic?

**Platforms:**

- **Android Chrome:** works.
- **iOS:**
  - From iOS/iPadOS 16.4, and only for web apps that have been *added to the Home Screen*.
  - Permission must be requested from a direct user interaction, and the manifest needs `display` standalone/fullscreen ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)).
  - `PushManager` is in Safari iOS since 16.4 ([browser-compat-data](https://github.com/mdn/browser-compat-data)).

**Free plan:**

- **Scheduler:** Cron Trigger (5 per account, CPU 10 ms per run; [limits](https://developers.cloudflare.com/workers/platform/limits/), [cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)). Cron runs in UTC.
- **Sending push:**
  - Needs a VAPID ES256 signature ([RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)).
  - The payload must be encrypted ([RFC 8291](https://datatracker.ietf.org/doc/html/rfc8291): ECDH + HKDF + AES-GCM).
  - All those algorithms are in Workers WebCrypto ([docs](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)).
- **The lazy trick:** send push **without a payload** (no encryption needed). In the `push` event, the SW fetches `/api/reminders` and then calls `showNotification`. If the Access session has expired, show generic text.

**Conclusion:** it works, but it's not MVP. Cheaper options:

1. **`.ics` "Add to calendar"** for every due date. Zero server, and the phone's calendar handles the reminder.
2. **A daily email digest** through Cron + `send_email` to the two verified addresses. Free on all plans ([Email Service](https://developers.cloudflare.com/email-service/)), but needs Email Routing on the zone. Right now `atqamz.com` has no MX record (checked via DNS, see §8).

---

## 6. Frontend without a build step

### 6.1 Principles

- **Native ES modules** plus one **import map** to name the vendor libraries. Import maps are supported in Chrome 89, Safari 16.4 and Firefox 108 ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap), [browser-compat-data](https://github.com/mdn/browser-compat-data)).
- **Libraries are *vendored*** into `public/vendor/` with pinned versions. No CDN at runtime, so offline is safe and no third party sees the traffic.
- **Layer separation:**

```
public/
  index.html            import map, <link rel="manifest" crossorigin="use-credentials">
  manifest.webmanifest
  sw.js
  app/
    main.js             boot, register SW, router
    router.js           hash router (#/budget, #/vendor/…)
    domain/             pure functions: budget total, remainder, countdown, savings progress, phone number normalisation
    store/              db.js (IndexedDB), sync.js (outbox + pull), api.js (fetch + login detection)
    views/              one file per screen + generic-list.js. ONLY this layer gets replaced by a framework
    ui/                 small helpers (HTML escape, Rupiah format via Intl.NumberFormat('id-ID'))
  vendor/               third-party libs (pinned)
src/worker.js           API
migrations/0001_init.sql
wrangler.jsonc
```

**Rules that make a framework migration cheap:**

1. `views/` must not `fetch` or touch IndexedDB. A view only calls `store` (for example `list(table)`, `save(table, row)`, `remove(table, id)`, `subscribe(fn)`) and `domain` functions.
2. `domain/` is pure (input → output, no DOM), tested with `node --test` with no dependencies.
3. The store emits change events (`EventTarget`). Any framework can subscribe: React through [`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore), Vue through `ref`, Svelte through stores.
4. Routing uses the hash: zero server configuration, safe with the SW, and framework routers generally have a hash mode. The Navigation API is only in Safari 26.2 and URLPattern in Safari 26 ([browser-compat-data](https://github.com/mdn/browser-compat-data)). Too new, skip for now.
5. User text is always escaped before it goes into `innerHTML`, or use `textContent`.

### 6.2 Decision matrix (material for a discussion with Partner B, deliberately **not** decided here)

Size = gzip `-9` of the published ESM file, measured on 6 October 2026. Versions and release dates are from the npm registry.

| Option | No build? | Size | Learning curve | Later migration path | Fits offline/PWA | Maintenance status |
|---|---|---|---|---|---|---|
| A. Vanilla + Web Components ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)) | yes | 0 KB | low for the basics, gets more long-winded as the UI grows | custom elements can be used in any framework; views get rewritten | yes | web standard |
| B. Lit 3 ([docs](https://lit.dev/docs/getting-started/)) | yes (without TS decorators) | ±6.1 KB (`lit-core.min.js`) | medium | still web components; easy to wrap in another framework | yes | active (3.3.3, May 2026) |
| C. Preact + htm (+hooks) ([no-build guide](https://preactjs.com/guide/v10/no-build-workflows/)) | yes | ±4.9 + 1.6 + 0.6 KB | medium (React style) | to React/Preact+JSX is nearly mechanical (tagged template `html` → JSX) | yes | active. **Preact 11.0.0 was just released on 30 September 2026**; 10.x (10.29.8) is still available. htm is stable but its last release was in 2022 |
| D. Alpine.js ([docs](https://alpinejs.dev/essentials/installation)) | yes | ±19.9 KB | low (HTML attributes) | rewrite. Not tidy for a multi-screen SPA | yes | active (3.17.4, Sep 2026) |
| E. Vue 3 browser build ([docs](https://vuejs.org/guide/quick-start.html)) | yes (templates compiled in the browser) | ±62.9 KB (`vue.esm-browser.prod.js`) | medium | natural to Vue SFC + Vite | yes | active (3.5.43, Sep 2026) |
| F. HTMX ([docs](https://htmx.org/docs/)) | yes | ±16.8 KB (`htmx.min.js`) | low | – | **bad**: every screen needs HTML from the server, which clashes with offline-first | active |
| G. petite-vue ([repo](https://github.com/vuejs/petite-vue)) | yes | small | low | to Vue | yes | **stalled**: last release 0.4.1, Jan 2022 |

**Guiding questions for the discussion:**

- Who will maintain it after the event?
- Do you want to learn something used at work (React/Vue), or the one with the least abstraction?
- How important is "later we can just move to Vite"?

Whichever is chosen, `store/`, `domain/`, the Worker, and the D1 schema don't change.

---

## 7. Data model sketch (D1)

Conventions:

- money = `INTEGER` rupiah (never float);
- date = `TEXT 'YYYY-MM-DD'`, time = `TEXT 'HH:MM'`, month = `TEXT 'YYYY-MM'`;
- boolean = `INTEGER 0/1`;
- `id` = UUID from the client.

Every data table has the same sync columns and an index on `rev`.

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

### Sheet → table mapping

| Sheet | Table | Mapping notes |
|---|---|---|
| DASHBOARD + Timeline (label) | `settings` | `wedding_date`, `couple_label` |
| Timeline (header) | `settings` | `timeline_start` (optional) |
| Timeline (tasks) | `tasks` | checkbox K → `done` |
| Anggaran (3 tables) | `budget_items` + `payments` | `event` from the source table. Filled DP/Lunas, Termin 1, Termin 2 → one `payments` row each with `paid_on` empty (the real payment date isn't recorded in the sheet; fill it in by hand or mark "paid" without a date). `Total Dibayar`/`Sisa` are **not stored**, they're calculated |
| Target Tabungan | `savings_entries` + `settings.savings_target` | year (dropdown) + month (dropdown) → `month`. Two `Masuk` columns → two rows (`pria`/`wanita`) |
| List Seserahan | `seserahan_items` | Selesai → `selesai`, On Proses → `proses`, Belum Selesai → `belum` |
| List Administrasi | `admin_docs` | Selesai → `done = 1`, Belum → `0` |
| Kontak Vendor (left) | `vendors` | Action `FIX` → `status = 'fix'`. The right table is **ignored** (a frozen derivative). Phone numbers normalised to `+62…` |
| List Tamu (12 blocks) | `guests` | left blocks → `side='pria'`, right → `'wanita'`. Block title → `category`. Count column → `pax` |
| Rundown (2 tables) | `rundown_items` | `Waktu` "HH.MM - HH.MM" → `start_time`/`end_time` "HH:MM". Table title → `event` |
| List Lagu | `songs` | – |
| Skenario Budget | – | not imported |

### One-time import path

Personal data **must not** go into the repo.

1. **Sort out first** which data is real and which is template sample data.
2. **Read the ODS directly** with a Python stdlib script (`zipfile` + `xml.etree`) from `content.xml`. Take the `office:value`, `office:date-value` and `office:boolean-value` attributes, not the display text, so dates and numbers don't get broken by local formatting. Cell coordinates per sheet are hardcoded according to §1.
   - Alternative: export all sheets to CSV with LibreOffice. The 12th token of the CSV filter, `-1`, exports each sheet to its own file ([LibreOffice help](https://help.libreoffice.org/latest/en-US/text/shared/guide/csv_params.html)). But CSV loses data types (dates, currency "Rp."), so it's less recommended.
3. **The script produces `import.sql`** with `INSERT`s using `rev = 1` and `updated_by = 'import'`.
   - The script itself may live in the repo (only coordinates and structure, no data).
   - Its input and output are kept **outside the repo** (e.g. `~/wp-private/`) or in a `.gitignore`d folder.
4. **Remove `BEGIN TRANSACTION`/`COMMIT`** if present ([D1 import](https://developers.cloudflare.com/d1/best-practices/import-export-data/)).
5. **Run the import:**
   ```
   npx wrangler d1 migrations apply wp --remote
   npx wrangler d1 execute wp --remote --file=../wp-private/import.sql
   ```
   The import file limit is 5 GiB, far above what we need.
6. **Match** the row counts and totals (budget, *seserahan*, savings) against the spreadsheet locally. Don't paste the numbers in an issue or PR.
7. **Delete `import.sql`.** The spreadsheet is archived, not deleted.

---

## 8. Domain and deployment

### Already checked (6 October 2026, public DNS queries via DoH `cloudflare-dns.com`, read-only)

- NS of `atqamz.com` = `chloe.ns.cloudflare.com`, `ray.ns.cloudflare.com`. That means the zone uses Cloudflare nameservers (full setup).
- The apex `atqamz.com` resolves to a Cloudflare IP, so it's already proxied.
- `wp.atqamz.com` doesn't exist yet (NXDOMAIN), so it's free to use.
- There's no MX record yet. This only matters if we later use Email Routing (the magic link option or the email digest).
- The `atqamz/wp` repo is public and still empty (checked via `gh repo view`).

### Unverified and must be right

- The `atqamz.com` zone is in the **same Cloudflare account** as the Worker, and its status is active. Custom Domain requires "An active Cloudflare zone" ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
- The hostname `wp` has no CNAME record yet. A Custom Domain can't be created on a hostname that already has a CNAME.
- Whether there are other Workers in the account that share the 100,000/day and 5 cron quota.

### How `wp.atqamz.com` is served

Use a Worker **Custom Domain**. Cloudflare creates the DNS record and certificate itself, and all paths are routed to the Worker ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)). `wrangler.jsonc` sketch ([config reference](https://developers.cloudflare.com/workers/wrangler/configuration/)):

```jsonc
{
  "name": "wp",
  "main": "src/worker.js",
  "compatibility_date": "2026-10-01",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "wp.atqamz.com", "custom_domain": true }],
  "assets": { "directory": "./public" },
  "d1_databases": [{ "binding": "DB", "database_name": "wp", "database_id": "<output of wrangler d1 create>" }]
}
```

Notes:

- With hash routing, the `not_found_handling: "single-page-application"` mode isn't needed.
- If we later move to path routing, enable SPA mode and add `run_worker_first: ["/api/*"]`. Reason: in SPA mode, a browser navigation to an API path gets served HTML instead ([docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)), and `/api/login` has to reach the Worker.

### Deploy flow

| | Workers Builds (Git integration) | GitHub Actions + `wrangler-action` |
|---|---|---|
| Setup | connect the GitHub repo in the dashboard. Push to the production branch → deploy. Other branches → preview ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/)) | workflow YAML + Cloudflare API token stored in GitHub secrets ([repo](https://github.com/cloudflare/wrangler-action)) |
| Free | 3,000 build minutes/month, 1 concurrent build ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)) | GitHub Actions quota for public repos |
| Secrets in GitHub | none | yes (API token) |

**Advice: Workers Builds.**

- Deploy command: `npx wrangler d1 migrations apply wp --remote && npx wrangler deploy` ([migrations](https://developers.cloudflare.com/d1/reference/migrations/)).
- **Preview builds:** "Preview URLs are public by default", and D1 is only isolated "when you bind the Preview to a separate resource" ([Previews](https://developers.cloudflare.com/workers/previews/)). That means that, without extra settings, a preview from a branch can read the real DB through a public URL. Pick one: turn previews off (`preview_urls: false`), protect them with Worker-level Access, or bind the preview to a separate D1. Whether this isolation option is available on the free plan is **unverified**.
- **Initial `.gitignore`** (public repo): `.wrangler/`, `node_modules/`, `.dev.vars`, `*.ods`, `*.xlsx`, `*.csv`, `import*.sql`, `wp-private/`.
- **Local dev:** `wrangler dev` with a local D1 seeded with **fake data** only.

---

## 9. Risks and open questions (most important first)

1. **Time left until the wedding day.** If it's only a matter of weeks, the MVP has to be cut down again to three things: budget + payments, offline rundown, and vendors with call/WhatsApp buttons. The rest stays in the spreadsheet.
2. **Personal data leaking through the public repo.** The paths could be an import file, a seed, test fixtures, screenshots in a PR, or an open preview URL. Mitigation: `.gitignore` from the first commit, fake data for dev, previews turned off or protected, and `workers_dev: false`.
3. **Access + PWA friction.**
   - Redirect when the session expires.
   - The manifest needs `crossorigin="use-credentials"`.
   - A separate cookie jar in the iOS PWA.
   - `ctx.access` isn't available together with static assets.

   Test on two real phones on day one. If it's annoying, move to Plan B (device-key cookie).
4. **Data overwritten by conflicts.** Mitigation: per-field patches, `updated_by` shown, tombstones, and 7-day D1 Time Travel. Add a periodic CSV export.
5. **iOS quirks.**
   - The app must be installed to the Home Screen so storage is safe and push is possible.
   - No Background Sync, so the outbox is only sent while the app is open.
6. **Account quota shared** with other Workers, or a polling bug. Mitigation: don't poll, and check the usage dashboard after a week.
7. **Zero Trust onboarding asks for payment details** (not charged on Free). Needs your approval.
8. **Data quality from the template:**
   - sample data mixed with real data;
   - phone numbers stored as numbers;
   - frozen `FILTER` formula;
   - the "Subtotal Kategori" row that miscalculates.

   The import has to validate, not copy raw.
9. **A drawn-out framework debate.** Mitigation: build the `store/` + `domain/` layers first, with vanilla views. The framework decision can follow without throwing away work.
10. **After the event.** Who maintains it, and do we want to archive the data (export) and then shut down the Worker?

**Open questions for you two:**

- How long until the wedding day?
- Which data in the spreadsheet is real?
- Does Partner B use Android or iPhone? This decides the priority of install and push.
- Okay to fill in payment details for Zero Trust Free? If not, use the device-key.
- Do we need a public RSVP? Or just use another service for the digital invitation?
- Do both of you have full access to all the data? (Assumption: yes.)
- Do you want to keep Skenario Budget as a reference?

---

## 10. Recommendation

**Concrete next step (one evening):**

1. **Decide first:** auth (Access OTP or device-key) and the time left until the wedding day. The framework does *not* need deciding yet.
2. **End-to-end spike on `wp.atqamz.com`** with just **one** table (`budget_items` + `payments`):
   - Worker + static assets + D1 + Worker-level Access;
   - IndexedDB outbox, `GET/POST /api/sync`, SW app shell;
   - vanilla views.
3. **Test on two real phones** (Android and iOS):
   - install to the Home Screen;
   - OTP login inside the PWA;
   - edit offline on both phones then go online at the same time (conflict);
   - session expires → log in again button.
4. **If it passes:** add the generic list screen for the other 7 sheets, then the wedding-day rundown, then run the one-time import (§7). The spreadsheet is officially retired.
5. **After the MVP works:** discuss the framework with Partner B using the §6.2 matrix. The migration is only replacing `views/`.
