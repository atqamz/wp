# Infra and stack: wp on Cloudflare

Research and decisions as of 6 October 2026. This is a recommendation for you to approve, not an implementation. **Revised on 6 October 2026:** the frontend is now a React + TypeScript + Vite single-page app served by the same Worker, replacing the earlier plan of plain HTML, CSS and JS with no build step. React is a working choice that may be revised, so the design keeps the UI layer replaceable ([brainstorm §6.1](brainstorm.md#61-principles-and-layers)). What this revision supersedes is listed in [§9.3](#93-what-this-revision-supersedes) (this document) and [§9.4](#94-parts-of-docsbrainstormmd-that-are-superseded) (`docs/brainstorm.md`, updated in the same pass).

> **Privacy.** This repo is public. No real emails or first names here: the two users are **Partner A** and **Partner B**, and addresses are written as `<email-partner-a>` and `<email-partner-b>`. Findings from private repos are written generically ("other org's repo", "office repo"), with no code, hostnames, IDs, secret names or people's names. The `atqamz/github` repo is public, so it can be quoted.
>
> **Label.** **unverified** = I can't prove it from the repo, docs or public DNS. **verified locally** = I built or ran it in a throwaway scratch project on 6 October 2026 (Node v26.10.0, wrangler 4.147.0, Vite 8.3.2); that shows how the tools behave, not how browsers or the Cloudflare edge behave. I have no Cloudflare, Google or GitHub write credentials. All versions and dates were checked on 6 October 2026 through npm, the GitHub API, the Go proxy and the linked docs pages; the version of each npm package is linked in [§5.4](#54-each-dependency-and-why) or [§5.7](#57-pwa-and-service-worker).

## Decision table

| # | Area | Choice | One-line reason |
|---|---|---|---|
| 1 | Cloudflare account | The account that holds the `atqamz.com` zone, with its own Zero Trust org. Check first whether another org shares that account | Custom Domain needs an active zone in the same account; the three zones I saw use three different NS pairs, so they are probably separate accounts (unverified) |
| 2 | IaC for Worker, D1, domain | `wrangler.jsonc` only, deployed from CI | wrangler already declares everything; any other IaC still needs wrangler for code, assets and migrations |
| 3 | IaC for Access | One-time manual setup (Google OAuth client) + one `scripts/access.sh` script (curl to the API) for IdP, app, policy | Only 3 objects; a state backend is heavier than the work |
| 4 | Pulumi, OpenTofu, Alchemy | Not yet. If later: Pulumi Go, in a separate repo | Consistent with `atqamz/github`; trigger is in §3.4 |
| 5 | Effect | **No** (later only with the trigger in §4) | Two users and ±3 endpoints; Alchemy v2 forces Effect, so choosing it means choosing both |
| 6 | Language | TypeScript for the Worker, the SPA and the shared code, checked by `tsc -b` | One language end to end; Partner B already works in TypeScript |
| 7 | Frontend | React 19 SPA built by Vite 8, served by the same Worker through `@cloudflare/vite-plugin`, `assets.not_found_handling = "single-page-application"` | The operator's choice; the plugin builds the Worker and the assets in one `vite build` and generates the deploy config (§5.2) |
| 8 | Router | No library: hash routing, about 10 lines | 6 screens; plain `<a href="#/...">` links need no click handling (§5.6) |
| 9 | Data and state | `src/store/` (IndexedDB, outbox, sync) and `src/domain/` (pure functions), connected to React by `useSyncExternalStore`. No state library | The store is the offline source of truth; a server-state cache would be a second cache (§5.6) |
| 10 | Validation | Hand-written from the table specs and the `kind` registry (also the SQL whitelist), in `shared/` | One source of truth, zero dependencies, runs in the SPA and in the Worker |
| 11 | Sharing types | A `shared/` folder imported by relative path from `src/` and `worker/`; three `tsconfig` files | No package, no codegen (§5.5) |
| 12 | D1 access | `prepare().bind()` and `batch()`, no ORM | Small queries, already written in brainstorm §5.3 |
| 13 | Migrations | SQL files + `wrangler d1 migrations apply`, run in CI before the build and deploy | Built into D1; a failed migration is rolled back automatically |
| 14 | Tests | `node --test` (TypeScript directly, Node 24) for `shared/`, `src/domain/` and the Worker's pure code; no component tests | Zero test framework; `vitest` only when views gain logic (§5.1) |
| 15 | PWA and service worker | A hand-written service worker (about 25 lines) + a 20-line Vite plugin that stamps its precache list. Not `vite-plugin-pwa` | 0 extra packages instead of +329; trigger to switch in §5.7 |
| 16 | Auth | Access + Google IdP, hostname-based app, allow policy for two emails; the Worker verifies the JWT with `jose` | What you asked for, and zero login code |
| 17 | The two emails | Local password store (source), Worker secret, and the Access policy. Not in the repo, not in GitHub secrets, **not in D1** (the Worker turns the verified email into `a` or `b`) | Fewer copies, smaller chance of a leak |
| 18 | CI/CD | GitHub Actions calls `npx` for `vite` and `wrangler` directly; not Workers Builds | One CI system for checks + migrations + build + deploy; Workers Builds only accepts user-owned tokens |
| 19 | Environment | A single `production`, no preview. Staging later if there's a trigger | Preview URLs are public by default and share D1 unless separated |
| 20 | Repo settings | A `wp` row in `repos.go` of `atqamz/github` (**done**, §7.5); CI secrets stay `gh secret set` | That repo's own rule: settings there, workflow and dependabot in each repo |
| 21 | Dependencies | 3 runtime (`react`, `react-dom`, `jose`) + 8 dev (`vite`, `@vitejs/plugin-react`, `@cloudflare/vite-plugin`, `wrangler`, `typescript`, `@types/react`, `@types/react-dom`, `@types/node`) | Each one is justified in §5.4 |

---

## 1. Findings from three repos

Read read-only from clones in the scratchpad (already deleted). The contents of private repos are summarised as patterns.

### 1.1 `atqamz/github` (public, your personal IaC repo)

Sources: [README](https://github.com/atqamz/github), `AGENTS.md`, `main.go`, `repos.go`, `go.mod` in that repo (read on 6 October 2026).

| Aspect | Finding |
|---|---|
| Tool | Pulumi + Go (`go 1.26`, `pulumi-github` SDK v6.14.1, `pulumi` SDK v3.255.0). The project is named `github-config`, not `github`, so config keys don't clash with the provider namespace |
| State backend | Pulumi Cloud (mentioned in the README), one `prod` stack |
| Secrets | No secrets in the repo. `GITHUB_TOKEN` is taken from `gh auth token` at run time |
| CI | No workflow of its own (only the built-in Dependabot). You run `pulumi up` manually; `AGENTS.md` forbids running it unattended |
| Environment | One `prod` stack |
| DNS and zones | Doesn't touch Cloudflare at all |
| Access | None |
| Conventions | One `repos` table in `repos.go`, a uniform baseline in `main.go`, `Protect(true)` on every repo, an `adopt` flag to import existing repos, Nix devshell + direnv + treefmt, `AGENTS.md` with "don't fix this without reading the reason" rules. Things deliberately **not** managed (required status checks, required signatures, labels, secret scanning, interaction limits) are documented along with the reasons |

### 1.2 Other org's repo (private, GitOps for one server)

| Aspect | Finding |
|---|---|
| Tool | OpenTofu 1.11.x (pinned through `mise`) + Cloudflare provider `~> 5.17`. Cloudflare scope is **only DNS records in one zone** (six records, one of them a DNS-only wildcard). Pages, R2 and email records are marked "managed in the dashboard, not here" in code comments. The server is managed by Ansible, out of scope |
| State backend | A SOPS-encrypted state file **committed to git**. CI decrypts, applies, re-encrypts, then pushes to the main branch with `[skip ci]`. No native locking; an ADR sets a trigger for moving to an S3-compatible backend (R2) with `use_lockfile` |
| Secrets | SOPS + GPG with several recipients. The Cloudflare token and zone ID are in encrypted tfvars. CI imports the GPG private key from an Actions secret |
| CI | One workflow: plan on PR, apply on push to the main branch, a `concurrency` group without cancel. Actions pinned to commit SHAs, weekly Dependabot for Actions. Tied to one GitHub Environment |
| Environment | One state, one environment |
| DNS and zones | The zone ID is a single variable; this repo is the sole writer of the records it declares |
| Access | Not in this repo |
| Conventions | An ADR per decision, `mise`, pre-commit hooks. An explicit rule for workloads delegated to another repo: **don't make two repos writers of one host resource** |

### 1.3 Office repo (private, broader IaC)

| Aspect | Finding |
|---|---|
| Tool | Pulumi **TypeScript** (`@pulumi/cloudflare` 6.21.0, Pulumi CLI 3.267 through `mise`, Node 22). Moved from OpenTofu in mid-2026 through an ADR. One project, one `prod` stack, flat modules per concern |
| Cloudflare scope | Zone settings, DNS, redirect rules, Access (app, reusable policy, service token), Pages, R2, KV, D1 **creation**, account API tokens (an inventory with minimum scope per token), and the Worker's **route + workers.dev subdomain**. The Worker script itself is **not** in the IaC |
| State backend | A DIY S3-compatible backend in an R2 bucket (`region=auto`), `passphrase` secrets provider (only values marked secret are encrypted), state credentials kept separate from the admin token and only allowed to read/write objects. Locking is best-effort, so the `concurrency` group in CI is what guarantees serialisation |
| Secrets | SOPS + age (one shared key; GPG before). One encrypted env file holding the provider token, passphrase and state credentials; run through `sops exec-env ... pulumi ...`. The stack config holds no secrets |
| CI | Push to the main branch for `pulumi/**` runs `up`. PR gates: typecheck, lint, Trivy scan, `preview` + policy pack (CrossGuard). A daily `preview --refresh` job opens an issue if there's drift. Written rule: **all IaC runs in CI, never on a laptop** |
| DNS and zones | IaC is the sole writer for one zone; zone ID in the stack config, account ID derived from the zone lookup |
| Access | App and policy are code. **The Google Workspace IdP is created manually in the dashboard, then looked up by type** (the IaC doesn't create the IdP). `email domain` policy, 24-hour session. One JWT audience per app, and the Worker verifies the JWT itself again. The Access org (team domain, login page) isn't in code. The repo notes a limit of 5 hostnames per app (I haven't verified that in the docs) |
| Conventions | **Import-first** for live objects (forgetting to import once produced a duplicate policy). **IaC holds the edge binding, the app repo holds the code**: the Worker script is deployed from the app repo through `wrangler` in GitHub Actions with an account-owned token; putting the script in two places once overwrote a live revision. Workers Builds is avoided because it only accepts user-owned tokens (matches the [Cloudflare docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token), page updated 22 September 2026). Release Please, no branch protection |

### 1.4 Patterns I reuse for wp

1. **One writer per resource.** If wrangler holds the `wp` script, no other IaC may declare it.
2. **Code is deployed by the app through wrangler from GitHub Actions**, not from IaC.
3. **Account-owned tokens with minimum scope**, clearly named and split per task.
4. **One `concurrency` group** for deploys.
5. **Actions pinned to SHAs** with Dependabot bumping them.
6. **No secrets in the stack config or repo**; values arrive at run time.
7. **Things deliberately not managed are written down with the reason**, like the `atqamz/github` README.

---

## 2. Collision analysis

### 2.1 Who manages what

| Resource class | Other org's repo | Office repo | What wp needs |
|---|---|---|---|
| Account | None | Account tokens, Pages, R2, KV, D1 creation | One token of its own, one Worker, one D1 |
| Zone | One zone, DNS records only | One zone: settings, DNS, redirect rules, routes | Only the `atqamz.com` zone |
| DNS records | Six explicit records including one wildcard | Many, one zone | One record, created automatically by Custom Domain |
| Access org | Not managed | App/policy/token in code; **org, team domain, IdP created manually** | One Google IdP and one app |
| Workers | None | Only routes and subdomain; script from the app repo | The `wp` script deployed by wrangler |
| D1 / KV | None | Created by IaC, schema in the app repo | D1 `wp` created once through `wrangler d1 create` |

### 2.2 Is the `atqamz.com` zone in their state?

**According to the configuration: no.** Reasons:

- Searching for `atqamz.com` in both private repos found nothing.
- Both programs use **one** zone ID as a variable/config and don't enumerate zones in the account.
- No DNS or Access resource is parameterised per zone beyond that.

**What I can't verify:**

- The other org's repo state is SOPS-encrypted and I didn't decrypt it (and don't have the key).
- The office repo's state is in an R2 bucket I can't access.
- The zone ID value is in encrypted tfvars, so it can't be compared with the `atqamz.com` zone ID without the Cloudflare API.

### 2.3 Is it one Cloudflare account?

Evidence from public DNS (DoH `cloudflare-dns.com`, 6 October 2026): the `atqamz.com` zone uses `chloe.ns.cloudflare.com` and `ray.ns.cloudflare.com`. The zone from the other org's repo and the zone from the office repo each use a different pair, and all three pairs differ from each other.

Cloudflare writes that the default assignment method will "favor consistent nameserver names across all zones within an account", but also "in case there are conflicts, you may get different nameserver names, even for domains that are within the same account" ([docs](https://developers.cloudflare.com/dns/zone-setups/reference/nameserver-assignment/), checked 6 October 2026). So three different pairs **point to** three accounts, but are **not proof**.

**A 30-second manual check:** open the Cloudflare dashboard, look at the account list at the top left, and see which account `atqamz.com` is in. If that account also holds another org's zones or Workers, scenario B below applies. The full procedure, with four independent checks, is [M1 in the bootstrap runbook](bootstrap.md#m1-find-the-cloudflare-account).

### 2.4 What can go wrong

| # | Risk | Mechanism | Mitigation |
|---|---|---|---|
| 1 | Two writers for one object | If a wp resource (route, Access app) is someday imported into another IaC, their `apply` can overwrite or delete it. The office repo records one incident: a script declared in two places overwrote each other | All wp objects are prefixed `wp`. Never imported into another repo. The "one writer" rule is written in this repo |
| 2 | Token swept | An account API token is visible to account admins, and the office repo keeps a token inventory in IaC. A token that isn't listed risks being revoked in a sweep | Token names are prefixed `wp-`. Scoped to one account and one zone. On a shared account, tell the inventory owner |
| 3 | Access org is a per-account singleton | The team domain, login page, IdP list, global session duration and the "Protect all Workers" application apply across the whole account. If `all_workers` is on, the wp Worker gets that policy too ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), 18 August 2026) | Check the **Protect all Workers** card in Workers & Pages before deploying. Never turn it on from wp |
| 4 | A new IdP shows up in another app | Adding an IdP to a shared org can add login options to apps that don't pin an IdP. The default behaviour of an app without `allowed_idps` is **unverified** | Only relevant in scenario B. Pin `allowed_idps` in the wp app and ask the other org's owner to pin too |
| 5 | Shared quota | See §2.5 | Watch the usage dashboard |
| 6 | Wrong account | Member of several accounts: `wrangler login` gives access to any account, and the `account_id` config says "You might have more than one account" ([docs](https://developers.cloudflare.com/workers/wrangler/configuration/), 5 October 2026) | Always set `CLOUDFLARE_ACCOUNT_ID`, and create a token limited to one account as the [CI docs](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/) recommend |
| 7 | Account plan changed by someone else | Free vs Paid limits change without wp doing anything | **unverified**: which account plan is used |
| 8 | Unknown records deleted | State-based IaC only changes objects in its own state ([OpenTofu state](https://opentofu.org/docs/language/state/)). The two Cloudflare repos I read have no mass-deletion loop | A real risk only if `atqamz.com` was ever put into that state; the current configuration doesn't do that |
| 9 | Certificate obstacle | Custom Domain creates a certificate automatically. The `atqamz.com` apex has no CAA, MX or TXT (DoH 6 October 2026), so nothing blocks it | No action needed |

### 2.5 Quotas shared per account

| Resource | Free limit | Source |
|---|---|---|
| Workers requests | 100,000/day **per account**, reset 00:00 UTC; error 1027 when it runs out | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (5 September 2026) |
| Workers per account | 100; Cron Triggers 5 per account | same |
| Static assets | Requests to assets are free and unlimited; `run_worker_first` paths get 429 when the quota runs out | [Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) (23 April 2026) |
| D1 | 10 databases per account, 5 GB total, 500 MB per database, Time Travel 7 days | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) (21 April 2026) |
| D1 daily | 5 million rows read and 100,000 rows written per day | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (21 April 2026) |
| Workers Builds | 3,000 minutes/month, 1 concurrent build **across an account** | [Builds limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/) (29 May 2026) |
| Zero Trust Free | A seat is consumed by every user who performs an authentication event; Free "for up to 50 users" | [Seat management](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/) (1 May 2026), [reference architecture](https://developers.cloudflare.com/reference-architecture/architectures/sase/) |

wp usage: ±200 requests/day, 1 database, 2 seats. **Unverified:** how much the other org's Worker already uses in the same account, and whether that account is on the Free plan.

### 2.6 Boundary recommendation

**Scenario A (separate accounts, most likely):** everything below applies, with no extra caution.

**Scenario B (same account as another org):** add the "Protect all Workers" card check, pin `allowed_idps`, and send one message to the account owner about the `wp-*` tokens. Or move wp to a new personal account (a free Cloudflare account), but Custom Domain needs the `atqamz.com` zone in that account too, and how to move a zone between accounts is **unverified**.

| Owned by wp | Stays owned by others / don't touch |
|---|---|
| Worker `wp` (script, versions, secrets, assets) | All other Workers and their routes |
| D1 `wp` and its contents | Other databases |
| Custom Domain `wp.atqamz.com` (one DNS record + one certificate) | Other records in `atqamz.com`, zone settings, zone-wide rules |
| One Access app `wp` (hostname-based, inline policy) | Other Access applications, reusable policies, the `all_workers` application |
| One Google IdP `wp-google` (the only account-level object) | The Access org (team domain, login page, global duration), other IdPs |
| Tokens `wp-ci` (deploy) and `wp-access-setup` (temporary) | Other tokens and their inventory |

**Smallest footprint:** Worker, D1, Custom Domain, Access app, IdP, two tokens. The policy is created **inline** in the app (not reusable), so wp doesn't add an account-level policy object: the API says "Reusable and inline policies are mutually exclusive" ([API reference](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/)).

---

## 3. IaC comparison

### 3.1 Versions (checked 6 October 2026)

| Tool | Version | Date | Source |
|---|---|---|---|
| wrangler | 4.147.0 | 2 October 2026 | [npm](https://www.npmjs.com/package/wrangler) |
| Alchemy | 2.0.0-beta.81 (npm `latest` tag is still beta); previous line 0.94.0 | 5 October 2026; 1 August 2026 | [npm](https://www.npmjs.com/package/alchemy), [repo](https://github.com/alchemy-run/alchemy) |
| Effect | 4.0.1 (4.0.0 released 1 October 2026) | 4 October 2026 | [npm](https://www.npmjs.com/package/effect) |
| Pulumi CLI | 3.267.0 | 1 October 2026 | [releases](https://github.com/pulumi/pulumi/releases) |
| Pulumi Cloudflare (Go and TS) | v6.21.0 | 18 September 2026 | [Go proxy](https://proxy.golang.org/github.com/pulumi/pulumi-cloudflare/sdk/v6/@latest), [npm](https://www.npmjs.com/package/@pulumi/cloudflare) |
| Terraform Cloudflare provider | 5.27.0 | 3 October 2026 | [releases](https://github.com/cloudflare/terraform-provider-cloudflare/releases) |
| OpenTofu | 1.13.1 | 1 October 2026 | [releases](https://github.com/opentofu/opentofu/releases) |
| Terraform | 1.16.5 | 2 October 2026 | [releases](https://github.com/hashicorp/terraform/releases) |
| `cloudflare/wrangler-action` | v4.1.3 | 24 September 2026 | [releases](https://github.com/cloudflare/wrangler-action/releases) |

Alchemy v2 started its beta on 13 April 2026 and has had 81 beta releases in ±25 weeks (npm version history). The `latest` tag points to a beta.

### 3.2 What has to be done whatever the tool

The scope: one Worker with static assets, one D1, one Custom Domain, one Access app, one IdP.

- **Worker code and assets have to go through wrangler or the upload API.** The `WorkersScript` resource in Pulumi has an `assets.jwt` field (a token from an upload session), not a directory ([Pulumi docs](https://www.pulumi.com/registry/packages/cloudflare/api-docs/workersscript/)); I infer the provider doesn't upload the folder itself (an inference from the schema, unverified). The office repo even moved the script out of IaC after two copies overwrote each other.
- **D1 migrations are not a provider resource.** The Terraform provider only has `d1_database` ([resource list](https://github.com/cloudflare/terraform-provider-cloudflare/tree/main/docs/resources)). Migrations stay `wrangler d1 migrations apply`.
- **What's left for IaC: Access (3 objects)** and, if wanted, Custom Domain.

### 3.3 Comparison table

| Criterion | Alchemy v2 | Pulumi (Go / TS) | OpenTofu / Terraform | wrangler + one script |
|---|---|---|---|---|
| Simplicity (line counts are my estimates) | An Effect program, `alchemy.run.ts`, rolldown bundler; needs `effect@^4` as a peer dep | Program + CLI + state account + provider; ±100 lines of Go for 3 objects | HCL ±40 lines + state backend + provider | One config file + ±50 lines of bash |
| Free plan fit | Uses D1 and Worker, but the default state store adds a Worker with a Durable Object and Secrets Store to the account | Pulumi Cloud Free: 1 user, unlimited projects and stacks ([pricing](https://www.pulumi.com/pricing/)) | Free; state in R2 needs an R2 subscription through checkout ([R2 get-started](https://developers.cloudflare.com/r2/get-started/)) | No extra cost |
| State storage | Local `.alchemy/` (gitignored) or `Cloudflare.state()`: a Worker + DO SQLite + Secrets Store in your account, reused by all stacks ([docs](https://alchemy.run/state-store/)). The Secrets Store status on Free is **unverified** (its docs say "open beta") | Pulumi Cloud (like `atqamz/github`) or a DIY backend | Local backend, encrypted git, or S3-compatible in R2 with `use_lockfile` ([docs](https://opentofu.org/docs/language/settings/backends/s3/)) | None. State = Cloudflare itself |
| Secrets | A separate secret provider, state key in Secrets Store | `pulumi config set --secret`; the value goes into state | `TF_VAR_*`; sensitive values go into state, so you need [state encryption](https://opentofu.org/docs/language/state/encryption/) (PBKDF2) | Worker secrets + local password store; no state holds secrets |
| Consistency with your repos | None | **Go** same as `atqamz/github`; **TS** same as the office repo | Same as the other org's repo | wrangler same as how the Worker in the office repo is deployed |
| Maturity | Beta, 81 releases in ±25 weeks | Provider v6.21.0; the office repo records import friction (a pre-check rejects hand-written programs, some R2 resources can't be imported) | The v5 provider has 223 open issues and PRs ([repo](https://github.com/cloudflare/terraform-provider-cloudflare), API count 6 October 2026) | wrangler 4.147.0, very frequent releases |
| Access with Google IdP | Yes: `Access/IdentityProvider` (type `google`), `Application`, `Policy` ([code](https://github.com/alchemy-run/alchemy/tree/main/packages/alchemy/src/Cloudflare/Access), commit 5 October 2026) | `ZeroTrustAccessIdentityProvider`, `ZeroTrustAccessApplication` ([docs](https://www.pulumi.com/registry/packages/cloudflare/api-docs/zerotrustaccessapplication/)) | `cloudflare_zero_trust_access_identity_provider`, `..._application` ([docs](https://github.com/cloudflare/terraform-provider-cloudflare/tree/main/docs/resources)) | Direct API; the fields `allowed_idps`, `client_id`, `client_secret`, `session_duration` are in the API reference |
| D1 migrations | `D1.ApplyMigrations` ([code](https://github.com/alchemy-run/alchemy/tree/main/packages/alchemy/src/Cloudflare/D1)) | None, use wrangler | None, use wrangler | Native |
| Preview environment | A stage per PR (`staging-{number}`), destroyed when the PR closes through the [built-in GitHub Action](https://alchemy.run/environments/ci/) | A stack per PR, manual wiring | A workspace per PR, manual wiring | `wrangler preview` (wrangler ≥ 4.135, `previews` block) or `env.<name>`; D1 is isolated only if bound to a separate database ([Previews](https://developers.cloudflare.com/workers/previews/), 24 September 2026) |
| Collision risk in a shared account | Adds a state-store Worker to the account | Safe if token scope and name prefix are kept | Safe if `zero_trust_organization` is never used | Smallest: no inventory that could delete the wrong thing |

### 3.4 Honest recommendation

**wrangler alone is enough for the Worker, assets, D1, migrations, Custom Domain and secrets.** Access is set once and hardly ever changes; one script is enough there.

Reasons:

1. Once code, assets and migrations are in wrangler, IaC would only hold 3 Access objects. That isn't worth a state backend, extra tokens and a program to maintain.
2. No state, so no state that can clash with another org's IaC.
3. `secrets.required` in wrangler makes the deploy fail if a secret isn't set yet ([docs](https://developers.cloudflare.com/workers/wrangler/configuration/#secrets-configuration-property)).

**The Access script (`scripts/access.sh`)** is the part you may skip: if you never intend to rebuild from scratch, clicking in the dashboard once is enough. I suggest still writing it because (a) it works as a runnable checklist, and (b) it forces the two emails to come from the environment, not be typed into a file. What it does: upsert the IdP `wp-google`, upsert the app `wp` with an inline policy, print the AUD. Run manually with a temporary token; **not** part of CI.

**Why not the others now:**

- **Alchemy v2:** beta, forces Effect (§4), and the default state store adds a Worker and Secrets Store to an account that may be shared. Its features are complete (Access, D1 migrations, stage per PR), so it's worth another look once it's stable.
- **OpenTofu/Terraform:** consistent with the other org's repo, not with yours; state needs R2 (a card) or an encrypted file in git; the end result still needs wrangler for code.
- **Pulumi now:** consistent with your Go, but a program, CI and state for 3 objects is heavier than one script.

**Triggers to move to Pulumi Go** (if any one happens):

1. wp needs a third Cloudflare resource type besides Worker, D1 and Access (e.g. R2, a queue, a second hostname, or a permanent staging environment).
2. You want Cloudflare settings reviewed through diffs like GitHub settings.
3. A second person needs to change the Access policy without the dashboard.

If that happens: a **separate repo** (e.g. `atqamz/cloudflare`, same shape as `atqamz/github`: one table, `Protect(true)`, an `adopt` flag), not inside wp, because account-level objects (IdP, tokens, Access org) span projects. The split "IaC holds the edge and account, the app repo holds the code through wrangler" is exactly the office repo's pattern.

---

## 4. Effect: is it needed for a two-user app?

**Answer: no.** Later only with the triggers below.

Assessment:

- **What Effect solves:** errors as types, composable retry/timeout, resource scopes and structured concurrency. That's useful for complex async orchestration, not for a Worker with three endpoints and one D1 `batch()`.
- **Learning cost:** `Effect.gen` generators, `Layer`, tagged errors and the runtime model. Partner B also has to be able to read the code. The SPA and the Worker now share TypeScript ([§5.5](#55-sharing-types-and-code-between-the-worker-and-the-spa)), so Effect could technically be shared, but nothing in the app needs it.
- **Maturity:** stable 4.0.0 only came out on 1 October 2026 and 4.0.1 on 4 October 2026 ([npm](https://www.npmjs.com/package/effect)); the docs site still shows v3 docs by default with a version picker to v4 ([effect.website](https://effect.website/docs/getting-started/introduction/)), so the docs and ecosystem are still shifting.
- **Coupling with IaC:** Alchemy v2 is built on Effect (`effect@^4` peer dependency, the README says "Infrastructure-as-Effects"), so choosing Alchemy means choosing Effect. By choosing wrangler, the two come apart.

**"Later" triggers:**

1. The Worker gets real async orchestration: retry with backoff to third-party APIs, Workflows or Queues with partial failure.
2. You decide on Alchemy for other reasons and are ready to accept Effect.
3. You want to learn Effect for its own sake: do it in an experiment repo, not in wp.

---

## 5. Application stack

### 5.1 Decisions

| Aspect | Choice | Notes |
|---|---|---|
| Language | TypeScript everywhere (Worker, SPA, shared code) | wrangler and Vite bundle TS with no extra config; TS is [first-class on Workers](https://developers.cloudflare.com/workers/languages/typescript/) (3 July 2026). `typescript` 7.0.2, `tsc -b` ([§5.5](#55-sharing-types-and-code-between-the-worker-and-the-spa)) |
| Frontend | React 19.3.0 + Vite 8.3.2 + `@vitejs/plugin-react` 6.1.2 | The operator's choice, and it is the layout of Cloudflare's own [React guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/) (5 September 2026). Details in [§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker) |
| Serving | One Worker: static assets from `dist/client` + `/api/*` | `@cloudflare/vite-plugin` 1.62.5; `assets.not_found_handling = "single-page-application"`, `assets.run_worker_first = ["/api/*"]` |
| Worker structure | One `fetch` handler with a `switch` on `${method} ${pathname}`, three files (`worker/index.ts`, `worker/auth.ts`, `worker/sync.ts`) | See [§5.3](#53-worker-structure-and-dev-auth) |
| Router | No library; hash routing (`#/budget`) with a 10-line `useSyncExternalStore` hook in `src/router.ts` | Hash links are plain `<a>` tags, so no click interception and no history code; the service worker only ever sees navigations to `/`. Trigger for [`wouter`](https://www.npmjs.com/package/wouter) (3.13.0, 30 September 2026; peer `react >=16.8`, ships a hash-location hook in its package, `wouter/use-hash-location`; depends on `regexparam` and `use-sync-external-store`): path URLs are wanted (shareable deep links) or more than about 8 routes. Not `react-router` (8.4.0, 15 September 2026): a framework-sized API for 6 screens |
| Data and state | `src/store/` + `src/domain/`, bridged by `useSyncExternalStore` | See [§5.6](#56-data-and-state-layer). No TanStack Query, Redux or Zustand |
| Validation | A hand-written function in `shared/validate.ts`, driven by the table specs and the `kind` registry in `shared/tables.ts`, which are also the SQL whitelist | Trigger: payload shape grows beyond a per-table patch → `valibot` ([1.5.0](https://www.npmjs.com/package/valibot), 9 September 2026) or `zod` ([4.6.5](https://www.npmjs.com/package/zod), 13 September 2026) |
| D1 access | `env.DB.prepare(sql).bind(...)` and `env.DB.batch([...])`; SQL only from the whitelist | Trigger: many dynamic queries → Kysely (0.29.6). Drizzle is supported by wrangler through `migrations_pattern` ([docs](https://developers.cloudflare.com/d1/reference/migrations/)) but adds a toolchain |
| Migrations | `migrations/NNNN_*.sql`, `wrangler d1 migrations apply wp --remote` in CI | Use the database name, not the binding name, so it doesn't hit the wrong target ([docs](https://developers.cloudflare.com/d1/reference/migrations/), 8 June 2026). In CI the confirmation is skipped, a backup is still taken, and a failed migration is rolled back ([docs](https://developers.cloudflare.com/workers/wrangler/commands/d1/)). `0001_init.sql` creates `sync_state`, `settings`, `items` and `budget_entries` (SQL in `docs/brainstorm.md` §7.2); **verified locally** that it applies to a local D1. D1 rejects `GLOB` patterns over 50 bytes ([limits](https://developers.cloudflare.com/d1/platform/limits/), 21 April 2026), which is why the instant checks in that SQL are short. Adding a kind of list later needs no migration; adding a column to `items` does The generated deploy config keeps `migrations_dir` pointing at the source folder (verified locally: `../../migrations` in `dist/wp/wrangler.json`; also in the [plugin changelog](https://newreleases.io/project/github/cloudflare/workers-sdk/release/@cloudflare%2Fvite-plugin@1.42.4), PR 14490) |
| Tests | `node --test` for `shared/`, `src/domain/`, JWT verification and other pure Worker code. One optional integration test that starts `CLOUDFLARE_ENV=dev vite` and calls the API | Node 24 runs `.ts` directly: type stripping is stable since v24.12.0, needs `.ts` extensions in imports and `import type`, and doesn't run `.tsx` ([Node docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)), so `domain/` and `shared/` contain no JSX. **verified locally:** a `node --test` file importing `src/domain/*.ts`, which imports a type from `shared/*.ts`, passes. No component tests; trigger for `vitest` ([5.0.3](https://www.npmjs.com/package/vitest), 30 September 2026) + Testing Library: views gain logic that isn't in `domain/`. `@cloudflare/vitest-plugin` ([1.3.6](https://www.npmjs.com/package/@cloudflare/vitest-plugin), 2 October 2026) peers `vitest ^4.1.0`, so vitest would have to be pinned to 4.x; it is only worth it for per-test D1 isolation inside workerd |
| PWA | Hand-written service worker + a small Vite plugin | [§5.7](#57-pwa-and-service-worker) |
| Local dev | `npm run dev` = `CLOUDFLARE_ENV=dev vite`: HMR for the SPA, the Worker runs in workerd, D1 is local, seed `scripts/seed.sql` containing **fake data only** | Local D1 comes from `wrangler d1 migrations apply wp --local`; **verified locally** that the Vite dev server reads that database. Dev auth is described in [§5.3](#53-worker-structure-and-dev-auth) |
| Worker types | `wrangler types` generates `worker-configuration.d.ts` (committed) | No need for `@cloudflare/workers-types`. **verified locally:** it includes the dev-only vars (`AUTH_MODE?`, `DEV_WHO?`) and lists the three secrets as optional `string`, so `authenticate` must treat them as possibly missing (fail closed) |

### 5.2 Frontend build: a Vite React SPA on the Worker

Sources: [Vite plugin overview](https://developers.cloudflare.com/workers/vite-plugin/) (30 September 2026), [React SPA with an API tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) (5 September 2026), [static assets in the plugin](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/) (18 August 2026), [SPA mode](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/) (25 August 2026). Requirements from npm: Vite 8.3.2 needs Node `^20.19.0 || >=22.12.0` ([npm](https://www.npmjs.com/package/vite), 1 October 2026); `@cloudflare/vite-plugin` 1.62.5 peers `vite ^6.1.0 || ^7.0.0 || ^8.0.0` and `wrangler ^4.147.0` ([npm](https://www.npmjs.com/package/@cloudflare/vite-plugin), 2 October 2026); `@vitejs/plugin-react` 6.1.2 peers `vite ^8.0.0` ([npm](https://www.npmjs.com/package/@vitejs/plugin-react), 5 October 2026).

`vite.config.ts` (the `serviceWorker` plugin is explained in [§5.7](#57-pwa-and-service-worker)); **verified locally** that this builds:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const serviceWorker = (): Plugin => ({
  name: "wp-service-worker",
  apply: "build",
  applyToEnvironment: (env) => env.name === "client",
  generateBundle(_, bundle) {
    const files = [
      "/",
      ...Object.keys(bundle).filter((f) => !f.endsWith(".map") && !f.startsWith(".")).map((f) => `/${f}`),
      ...readdirSync("public").filter((f) => !f.startsWith(".")).map((f) => `/${f}`),
    ];
    const wp = { cache: `wp-${Date.now().toString(36)}`, files };
    this.emitFile({
      type: "asset",
      fileName: "sw.js",
      source: `self.WP=${JSON.stringify(wp)};\n${readFileSync("src/sw.js", "utf8")}`,
    });
  },
});

export default defineConfig({ plugins: [react(), cloudflare(), serviceWorker()] });
```

`wrangler.jsonc` (replaces the earlier sketch; `assets.directory` is deliberately absent because the plugin fills it in, per the static-assets page above):

```jsonc
{
  "name": "wp",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-06",
  "workers_dev": false,
  "preview_urls": false,
  "routes": [{ "pattern": "wp.atqamz.com", "custom_domain": true }],
  "assets": { "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [
    { "binding": "DB", "database_name": "wp", "database_id": "<uuid from wrangler d1 create>", "migrations_dir": "migrations" }
  ],
  "secrets": { "required": ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ALLOWED_EMAILS"] },
  "env": {
    "dev": {
      "routes": [],
      "d1_databases": [
        { "binding": "DB", "database_name": "wp", "database_id": "<same uuid>", "migrations_dir": "migrations" }
      ],
      "vars": { "AUTH_MODE": "dev", "DEV_WHO": "a" }
    }
  }
}
```

**Build output** (**verified locally** with `vite build` followed by `wrangler deploy --dry-run`; a stub Worker and fake IDs):

```
dist/
  client/                 the static assets
    index.html
    sw.js
    manifest.webmanifest  copied as is from public/
    assets/index-<hash>.js
    .assetsignore
  wp/                     the Worker
    index.js
    wrangler.json         generated: main = index.js, assets.directory = ../client,
                          migrations_dir = ../../migrations, no env.dev, no AUTH_MODE
.wrangler/deploy/config.json   points at dist/wp/wrangler.json
```

`wrangler deploy` printed "Using redirected Wrangler configuration" and read `dist/wp/wrangler.json` and the static files in `dist/client` (the dry run did not need credentials). The [plugin docs](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/) say the same: "an output `wrangler.json` configuration file is generated as part of the build output". So the deploy step is `npx vite build && npx wrangler deploy`, not a bare `wrangler deploy`.

**Why `run_worker_first: ["/api/*"]` stays.** In SPA mode an unmatched navigation returns `index.html` with 200, and the docs warn: "if you navigate to `/api/date` in your browser, you will be served an HTML file" ([SPA mode](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)). `/api/login` is a navigation that must reach the Worker ([§6.5](#65-manifest-and-service-worker-behind-access-rechecking-the-caveats)). **verified locally** in `vite dev`: a request with `Sec-Fetch-Mode: navigate` to `/api/login` returned the Worker's response and one to `/budget/x` returned the HTML. Navigations are otherwise answered by the asset layer without invoking the Worker, because the `assets_navigation_prefers_asset_serving` flag is on by default from compatibility date 2025-04-01 ([flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)); this one is covered by the 2026-10-06 date above. With hash routing ([§5.1](#51-decisions)) SPA mode is not needed to make deep links work; it is kept because the operator chose it, it makes stray paths return the app instead of a bare 404, and path routing needs it.

`package.json` scripts:

```json
{
  "scripts": {
    "dev": "CLOUDFLARE_ENV=dev vite",
    "build": "vite build",
    "typecheck": "tsc -b",
    "test": "node --test test/",
    "check": "npm run typecheck && npm test && npm run build && ! grep -q AUTH_MODE dist/wp/wrangler.json && grep -q 'rel=\"manifest\"[^>]*use-credentials' dist/client/index.html && ! grep -rEq 'from \"react' src/domain src/store shared worker"
  }
}
```

The `CLOUDFLARE_ENV=dev` prefix needs a POSIX shell (Windows is **unverified**; add `cross-env` only if Partner B needs it).

### 5.3 Worker structure and dev auth

The `fetch` flow:

1. Only `/api/*` reaches the Worker (`assets.run_worker_first: ["/api/*"]`); static files are served by the platform and free.
2. `authenticate(request, env)` returns `"a"`, `"b"` or `null`, never an email; `null` means a 401 JSON. The side is what the Worker writes to `updated_by` and returns to the client (`me`, brainstorm §3.3).
3. `switch` to `GET /api/sync`, `POST /api/sync`, `GET /api/login` (redirect to `/`, the contract from brainstorm §3.3).
4. Errors return generic JSON; no stack traces or emails in responses or logs.

**Dev mode without Access.** The earlier plan used `wrangler dev --var AUTH_MODE:dev ...`; the Vite dev server doesn't take that flag, so the dev-only variables live in the `env.dev` block of `wrangler.jsonc` ([§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker)) and `npm run dev` selects it with `CLOUDFLARE_ENV=dev`. The plugin applies `CLOUDFLARE_ENV` to `vite dev` and `vite build`, and "specifying `CLOUDFLARE_ENV` when running `vite preview` or `wrangler deploy` will have no effect" ([docs](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/), 23 April 2026). Production fails closed because the production build never selects that environment: **verified locally**, `dist/wp/wrangler.json` from a plain `vite build` has empty `vars`, and from `CLOUDFLARE_ENV=dev vite build` it has `AUTH_MODE` and the worker name `wp-dev`. `npm run check` greps the production output for `AUTH_MODE` ([§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker)). Details:

- Bindings are not inherited by an environment, so `env.dev` repeats the `d1_databases` entry; without it `env.DB` is `undefined` in dev (**verified locally**). `"routes": []` stops wrangler warning that the environment inherits the custom domain.
- `.dev.vars` is not an alternative: with `secrets.required` defined, only the three registered keys are loaded from it (**verified locally**: `AUTH_MODE` set in `.dev.vars` was not visible to the Worker; the same rule is in the [secrets docs](https://developers.cloudflare.com/workers/configuration/secrets/)). `.dev.vars` is only needed to give the three secrets placeholder values when you run `vite preview` on the production build (**unverified**, not run).
- `database_id` is a UUID, not a credential (useless without a token); that's my judgement, not a docs claim. `workers_dev` and `preview_urls` are turned off explicitly: `workers_dev` defaults to `false` when there are `routes`, and for `preview_urls` "If omitted, Wrangler does not change an existing setting" ([config docs](https://developers.cloudflare.com/workers/wrangler/configuration/)).

### 5.4 Each dependency and why

Versions and publish dates are from the npm registry on 6 October 2026. A scratch install of the packages below (without `jose`, and with `@types/node` 26.6.4 instead of 24.x) resolved to **62 packages and 298 MB** in `node_modules` (`npm ls --all`; mostly `workerd` and `wrangler`), **verified locally**.

| Package | Kind | Reason | Rejected alternatives |
|---|---|---|---|
| [`react`](https://www.npmjs.com/package/react) 19.3.0 (9 September 2026), [`react-dom`](https://www.npmjs.com/package/react-dom) 19.3.0 (9 September 2026) | runtime (browser) | The UI, the operator's choice. React supplies `useSyncExternalStore` itself, so no state library is needed | |
| [`jose`](https://www.npmjs.com/package/jose) 6.2.12 (5 September 2026) | runtime (Worker) | Access JWT verification: signature, `iss`, `aud`, `exp`, remote JWKS with caching and key rotation. A security path, don't write it yourself. The [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) give a Workers example with `jose` | Manual WebCrypto (±40 lines, but key rotation and subtle mistakes become your burden); `hono/jwk` (pulls in Hono) |
| [`vite`](https://www.npmjs.com/package/vite) 8.3.2 (1 October 2026) | dev | Dev server with HMR and the production build, for both the SPA and the Worker | Bundling by hand: no |
| [`@cloudflare/vite-plugin`](https://www.npmjs.com/package/@cloudflare/vite-plugin) 1.62.5 (2 October 2026) | dev | Runs the Worker in workerd inside the Vite dev server, builds Worker and assets together, writes the deploy config ([§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker)). Its npm dependencies include an alpha `miniflare` 5.x | Two toolchains (Vite for the SPA, plain `wrangler dev` for the Worker): two dev servers and no shared build |
| [`wrangler`](https://www.npmjs.com/package/wrangler) 4.147.0 (2 October 2026) | dev | Deploy, D1 and migrations, `wrangler types`; a peer dependency of the plugin | |
| [`@vitejs/plugin-react`](https://www.npmjs.com/package/@vitejs/plugin-react) 6.1.2 (5 October 2026) | dev | React Fast Refresh in dev. **verified locally** that `vite build` works without it (Vite compiles JSX itself); it is kept for the dev experience and because Cloudflare's React guide uses it. Drop it if you don't care about state-preserving reloads | |
| [`typescript`](https://www.npmjs.com/package/typescript) 7.0.2 (8 July 2026) | dev | `tsc -b` checks the SPA, the Worker and the shared code | No type check: no |
| [`@types/react`](https://www.npmjs.com/package/@types/react) 19.3.0, [`@types/react-dom`](https://www.npmjs.com/package/@types/react-dom) 19.3.0 (both 9 September 2026) | dev | Types for React | |
| [`@types/node`](https://www.npmjs.com/package/@types/node) 24.19.1 (1 October 2026) | dev | Types for `node:test`, `node:assert` and `vite.config.ts`. Take the 24.x line to match `.node-version` 24 ([Node 24 is LTS "Krypton", 24.21.0 on 7 September 2026](https://nodejs.org/dist/index.json)); the `latest` tag is 26.6.4 | Write tests in JS: lose the types |

Deliberately absent: Hono, zod/valibot, ORM, a router library, TanStack Query, Redux/Zustand, `idb`, Workbox and `vite-plugin-pwa` ([§5.7](#57-pwa-and-service-worker)), vitest, `@cloudflare/workers-types`, `wrangler-action`, a linter and a formatter (none was asked for yet).

### 5.5 Sharing types and code between the Worker and the SPA

One `shared/` folder, plain TypeScript, imported by relative path from `src/` and from `worker/`. Vite bundles it into both outputs (**verified locally**: a `shared/*.ts` type and a `src/domain` function used by the SPA, and a `shared/` type used by the Worker, build and typecheck). There is no package, no codegen and no path alias.

- **`shared/tables.ts`:** the specs of the three synced tables (`items`, `budget_entries`, `settings`) and the `kind` registry of `items` (which statuses and `data` keys each kind has), as `const` objects. The row types, the `Mutation` contract and the API request and response types are derived from them. It is the SQL whitelist on the server and the generic list screen's configuration on the client. The data model itself (SQL in `docs/brainstorm.md` §7, rationale in `docs/features.md` §7.2) is one generic `items` table plus one `budget_entries` table, so this file stays small and a new kind of list is a registry entry, not a migration. Its contents are a public spec, not data.
- **`shared/validate.ts`:** the validation function. The SPA runs it before queueing a mutation; the Worker runs it again at the trust boundary and is the authority.
- **Rules for `shared/`:** no DOM globals, no Workers globals, no JSX, so it compiles in both projects and runs under `node --test`. Imports use the `.ts` extension and `import type` for types; `erasableSyntaxOnly` forbids syntax Node can't strip (such as `enum`).

Three TypeScript projects, referenced from a root `tsconfig.json` with `"files": []`, as in Cloudflare's [React SPA tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/) (which adds a separate `tsconfig.worker.json`):

| File | Includes | Library and types |
|---|---|---|
| `tsconfig.app.json` | `src`, `shared` | `lib` ES2023 + DOM, `jsx: react-jsx`, `types: ["vite/client"]` |
| `tsconfig.worker.json` | `worker`, `shared`, `worker-configuration.d.ts` | `lib` ES2023 only, `types: []` (the Workers types come from `wrangler types`) |
| `tsconfig.node.json` | `vite.config.ts`, `test`, `src/domain`, `shared` | `lib` ES2023, `types: ["node"]` |

All three set `strict`, `noEmit`, `moduleResolution: "bundler"`, `allowImportingTsExtensions`, `verbatimModuleSyntax` and `erasableSyntaxOnly`. **verified locally:** `tsc -b` with TypeScript 7.0.2 passes on a scratch project with this layout. Separate DOM and Workers projects are my choice for keeping each global type set out of the other's code; I did not test what a single combined project would do.

### 5.6 Data and state layer

The `store/` and `domain/` split from brainstorm §6.1 carries over unchanged; only the bridge to the view layer is now concrete.

- **`src/domain/`:** pure functions (budget total, remainder, countdown, savings progress, phone normalisation). No DOM, no React, tested with `node --test`.
- **`src/store/`:** `db.ts` (a hand-written promise wrapper over IndexedDB, about 30 lines, typed by the table specs), `sync.ts` (outbox and pull), `api.ts` (`fetch` and the login detection of brainstorm §5.5), `store.ts` (an immutable snapshot plus `subscribe`). No React import.
- **`src/hooks/use-store.ts`:** the only adapter, `useSyncExternalStore(store.subscribe, store.getSnapshot)` ([React docs](https://react.dev/reference/react/useSyncExternalStore)). The docs require that "while the store has not changed, repeated calls to `getSnapshot` must return the same value" and that the snapshot is immutable, which is why the store replaces its snapshot object on change instead of mutating it.
- **No state library.** The IndexedDB store plus outbox is already the source of truth for the UI; a server-state cache such as TanStack Query would be a second cache that disagrees with it about what is pending.
- **No `idb`.** The wrapper is about 30 lines; [`idb`](https://www.npmjs.com/package/idb) 8.0.3 (7 May 2025, 3.4 KB gzip measured earlier) is the drop-in if Partner B prefers it.
- **Routing:** `src/router.ts` is a `useSyncExternalStore` hook over `hashchange` returning the current hash path, plus a `switch` in `main.tsx`; links are `<a href="#/budget">`.

`npm run check` fails if anything under `src/domain`, `src/store`, `shared` or `worker` imports React (the `grep` in [§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker)). That is what keeps a later framework change limited to `views/`, `ui/`, `hooks/` and `main.tsx`.

### 5.7 PWA and service worker

**Decision: a hand-written service worker plus a small Vite plugin, not `vite-plugin-pwa`.**

| | Hand-written | [`vite-plugin-pwa`](https://www.npmjs.com/package/vite-plugin-pwa) 2.0.0 (3 October 2026) |
|---|---|---|
| Extra packages | 0 | **+329**: `npm ls --all` went from 62 to 391 packages and `node_modules` from 298 to 375 MB (**verified locally**; it depends on `workbox-build` 7.4.1 and `workbox-window` 7.4.1, 4 May 2026, and peers `vite` up to `^8.0.0`) |
| Code you own | `src/sw.js` (about 25 lines), the plugin in `vite.config.ts` (about 20 lines), `src/pwa.ts` (about 12 lines) | Config only (a few lines) |
| Precache with versioned revisions, old-cache cleanup, update prompt | Written by hand ([brainstorm §5.1](brainstorm.md#51-service-worker-strategy)); the cache name changes on every build, so `sw.js` changes byte for byte and the browser sees an update | Built in |
| Works with `@cloudflare/vite-plugin` | Yes (**verified locally**: `dist/client/sw.js` lists `/`, the hashed bundle and `manifest.webmanifest`) | Yes, with a wart (**verified locally**): it also writes `registerSW.js` and `manifest.webmanifest` into the Worker output, and `wrangler deploy --dry-run` then reported "Attaching additional modules: registerSW.js" (0.13 KiB, harmless) |
| Manifest `crossorigin` | Your own `<link>` in `index.html`; Vite keeps `use-credentials` (**verified locally**) | Injects its own `<link rel="manifest">` into `index.html` ([guide](https://vite-pwa-org.netlify.app/guide/)); the option `useCredentials: true` is in its type definitions and, with it, the build output carries `crossorigin="use-credentials"` (**verified locally**). A hand-written link next to it gives two link tags, so you would drop yours |
| Maturity | Your own code, tested only by M9 | Mature library, but major version 2.0.0 is 3 days old as of 6 October 2026 |
| Offline correctness (the app's core promise) | **unverified** until tested on two phones ([§8.2](#82-bootstrap-checklist) M9) | Better trodden, also **unverified** in this setup |

Why hand-written: the earlier decision was "No Workbox", the service worker caches one fixed shell, and 329 build-time packages is a large supply-chain surface for 25 lines of logic. **The weak point is yours to own:** a `sw.js` that never changes never updates. The plugin below prevents that by stamping the file on every build.

**The plugin** is the `serviceWorker` function in the `vite.config.ts` of [§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker). It runs only for the `client` environment, so the Worker build is untouched. It writes `sw.js` as `self.WP = { cache, files }` followed by `src/sw.js`, which is plain JavaScript (the one file outside the TypeScript projects, because the plugin prepends it as text), where `files` = `/` + every file Vite emitted (all chunks, so lazy-loaded chunks are covered; I assume old hashed files vanish from the server after a deploy, **unverified**, which is why the whole set is precached) + every non-dot file in `public/` (manifest, icons). The service worker itself is in [brainstorm §5.1](brainstorm.md#51-service-worker-strategy).

**Triggers to switch to `vite-plugin-pwa`:** `src/sw.js` grows past about 60 lines, you need runtime caching strategies beyond the fixed shell, you want generated icons, or M9 finds a stale or broken-offline bug that Workbox's precache would not have.

**Not verified in a browser:** install, the update prompt, offline start, and behaviour with an expired Access session. All of it is on the M9 checklist.

---

## 6. Auth

A short answer to your question: **yes, Cloudflare can do it**. Access + a Google identity provider + an `allow` policy containing exactly two emails. Google only proves who logged in; what restricts it to two accounts is the Access policy.

### 6.1 Google IdP vs one-time PIN

| | Access + Google IdP | Access + email OTP |
|---|---|---|
| UX on the phone | Tap the Google account (instant auth, no picker page) | Type the email, open the email app, copy a 10-minute code ([docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)); in an iOS standalone PWA, switching apps may get in the way (a guess, unverified) |
| Setup | Needs a Google OAuth client (manual) | Zero: just the email in the policy |
| Who is allowed | Google lets anyone with a Google account *log in*; the **Access policy** is what restricts it to two emails ([Google IdP docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)) | Cloudflare only sends a code if the email is allowed by the policy |
| Failure | A wrong OAuth configuration breaks login | The code gets caught by an email filter |

**Recommendation: Google IdP**, as you asked. OTP can still be attached to the same app within a minute as an emergency path; it isn't enabled by default so the login page stays one button.

### 6.2 Setup steps

**M** = manual, **C** = can be coded (script or wrangler).

| # | Step | Kind | Detail |
|---|---|---|---|
| 1 | Decide the account, then Zero Trust onboarding (team name, Free plan) | M | Onboarding asks for payment details even on Free: "you will not be charged" ([docs](https://developers.cloudflare.com/cloudflare-one/setup/)). The team name is unique per organisation and becomes the `cloudflareaccess.com` subdomain |
| 2 | Google Cloud: create a project, a consent screen of type **External**, an OAuth client of type Web | M | The Cloudflare docs use External so a regular Gmail account can log in ([docs](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/google/)). I didn't find an official API to create a web client (only a secondary source: [review](https://apievangelist.com/2026/09/08/google-oauth-console-only-service-accounts-scriptable/index.md), unverified from Google's docs) |
| 3 | Fill in the Authorized JavaScript origin `https://<team>.cloudflareaccess.com` and the redirect URI `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback` | M | Exactly as in the Cloudflare docs above |
| 4 | Consent screen status **Testing**, add `<email-partner-a>` and `<email-partner-b>` as test users | M | Testing is limited to 100 test users and "authorizations by a test user will expire seven days from the time of consent" ([Google](https://support.google.com/cloud/answer/15549945)), **except** when the app requests only the `openid`, `email` and `profile` scopes. The Cloudflare Google page does not list the scopes it requests, so whether you will be asked to consent every week is **unverified**. The alternative is "Publish app"; Google says verification is not mandatory for non-sensitive scopes ([Google](https://support.google.com/cloud/answer/13463073)). Details in [bootstrap M3](bootstrap.md#m3-google-oauth-client) |
| 5 | Create the `google` IdP in Zero Trust (`client_id`, `client_secret`, optional PKCE) | C | `scripts/access.sh`, or the dashboard. The fields are in the [API reference](https://developers.cloudflare.com/api/resources/zero_trust/subresources/identity_providers/methods/create/) |
| 6 | Create a `self_hosted` Access app for `wp.atqamz.com`, `allowed_idps` = the IdP above, `auto_redirect_to_identity` = true, `session_duration` = `720h`, an inline `allow` policy with two `email` rules | C | `scripts/access.sh`. The app session can go up to "one month" ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)); 720h = 30 days. Instant auth is recommended when there's only one IdP ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)) |
| 7 | Note the app's AUD tag | C | The script prints it (it's also in the dashboard: Applications → Additional settings) |
| 8 | Set three Worker secrets: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAILS` | M, once | `wrangler secret put`, or `wrangler deploy --secrets-file <file>` for the first deploy ([docs](https://developers.cloudflare.com/workers/configuration/secrets/)). `secrets.required` makes the deploy fail if any is missing |
| 9 | Custom Domain `wp.atqamz.com` | C | The `routes` block in `wrangler.jsonc`. Wrangler creates the DNS record and certificate; it can't be done on a hostname that already has a CNAME ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), 29 September 2026) |
| 10 | Turn off `workers.dev` and preview URLs | C | `wrangler.jsonc` (above) |
| 11 | Test on two phones | M | See §6.5 |

**The Access app is hostname-based, not Worker-level.** The [Workers + Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) describe two paths. Worker-level (destination `worker` + `worker_id`) protects all the Worker's domains at once, but is tied to the Worker ID and only offers a basic policy in the dashboard. Hostname-based protects exactly one URL. I chose hostname because `workers.dev` and preview are already turned off in the config, and the Worker still verifies the JWT itself on `/api/*` as a second layer.

### 6.3 Where the two emails are stored

The emails **never** go into the repo and **never into D1**: not in `wrangler.jsonc` (`vars` is forbidden for sensitive data, [docs](https://developers.cloudflare.com/workers/configuration/secrets/)), not in test fixtures, not in docs, not in CI logs.

| Place | Mechanism | Role |
|---|---|---|
| The personal password store you already use | Source of truth, read manually | Injected into the environment when running `scripts/access.sh` and `wrangler secret put` |
| Access policy (in Cloudflare) | Set by the script or the dashboard | The main gate |
| Worker secret `ALLOWED_EMAILS` | `wrangler secret put` | Second layer, and the only place the app learns which email is which partner. An **ordered pair**, comma-separated and compared lowercase: position 1 is `a` (Partner A), position 2 is `b` (Partner B). The Worker rejects an email that isn't in the list even if the Access policy is misconfigured, and rejects everything if the list doesn't have exactly two entries |

**How `a` and `b` are derived:** after `jwtVerify` succeeds ([§6.4](#64-jwt-verification-in-the-worker)), the Worker compares the verified `email` claim with the two entries of `ALLOWED_EMAILS` and maps position 1 to `a` and position 2 to `b`. Everything stored in D1 (`updated_by`, the default of `who`) uses `a`, `b` or `import`; the SQL has a `CHECK` that rejects any other `updated_by` value, so an email can't end up there by mistake (**verified locally**). The display names (`partner_a_label`, `partner_b_label`) are in `settings`; they are not emails. Swapping the order of the secret swaps who is `a`; do it before the first data, not after.

Deliberately **not** copied into GitHub Actions secrets: the deploy workflow doesn't need them ("Wrangler will not delete your secrets unless you run `wrangler secret delete`", [docs](https://developers.cloudflare.com/workers/wrangler/configuration/); `secrets.required` only checks existence). Tests and fixtures use made-up addresses on the reserved `example.test` domain (two entries in `ALLOWED_EMAILS` order). The initial `.gitignore` (merged with the list in brainstorm §8): `.dev.vars*`, `.env*`, `.wrangler/`, `dist/`, `node_modules/`, `*.ods`, `*.xlsx`, `*.csv`, `import*.sql`, `wp-private/`.

### 6.4 JWT verification in the Worker

Per the [docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): validate the `Cf-Access-Jwt-Assertion` header (not the cookie; the cookie "is not guaranteed to be passed"), fetch the keys from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, check `aud` against the app's AUD, `iss` against the team domain, `exp`, then read `email`. Keys rotate every 6 weeks and the old key stays valid for 7 days, so match by `kid`; `createRemoteJWKSet` from `jose` does that.

`worker/auth.ts` sketch:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function authenticate(request: Request, env: Env): Promise<"a" | "b" | null> {
  if (env.AUTH_MODE === "dev") return env.DEV_WHO ?? null;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAILS) return null;
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.ACCESS_AUD });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    const pair = env.ALLOWED_EMAILS.toLowerCase().split(",").map((e) => e.trim());
    if (!email || pair.length !== 2) return null;
    return email === pair[0] ? "a" : email === pair[1] ? "b" : null;
  } catch {
    return null;
  }
}
```

Notes: `ctx.access` is **not available** to a Worker with static assets: "the router does not pass `ctx.access` to the user Worker" ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), 18 August 2026), and the Vite plugin's [static assets page](https://developers.cloudflare.com/workers/vite-plugin/reference/static-assets/) (18 August 2026) repeats that Workers with static assets won't receive `ctx.access`. Manual verification is needed. The three `ACCESS_*` values and `ALLOWED_EMAILS` are typed as optional by `wrangler types` ([§5.1](#51-decisions)), so the sketch returns `null` (401) when any is missing. Restrict `algorithms` in the `jwtVerify` options after you check `alg` in the JWKS (unverified). If Access is missing or misconfigured, the static files (frontend code, no data) are open, but `/api/*` is still 401. That's intentional.

### 6.5 Manifest and service worker behind Access: rechecking the caveats

The old caveats were written for a hand-written `public/` folder. They were rechecked against the Vite build output of [§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker); "verified locally" means a scratch build, not a browser.

| Caveat | Status 6 October 2026 | Action |
|---|---|---|
| The manifest needs `crossorigin="use-credentials"` | **Confirmed, and survives the build.** MDN: "If the manifest requires credentials to fetch, the `crossorigin` attribute must be set to `use-credentials`, even if the manifest file is in the same origin as the current page" ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)). **verified locally:** a `<link rel="manifest" ... crossorigin="use-credentials">` in the root `index.html` is kept as is in `dist/client/index.html`, and `public/manifest.webmanifest` is copied unchanged | Keep the link in the root `index.html`; `npm run check` greps the built file for it ([§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker)) |
| **NEW:** Vite adds `crossorigin` to the module script and preload tags | `<script type="module" crossorigin src="/assets/index-<hash>.js">` (**verified locally**). A plain `crossorigin` means `anonymous`, which still sends credentials for same-origin requests: "no exchange of user credentials ... unless destination is the same origin" ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin)) | None: the Access cookie is sent with the bundle request |
| `ctx.access` isn't there with static assets | **Confirmed**, and now also stated on the Vite plugin's static-assets page (§6.4) | Manual JWT verification in `worker/auth.ts` |
| **NEW:** `/api/login` must reach the Worker although the app is an SPA | In SPA mode, a browser navigation to an unmatched path gets `index.html` ([docs](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)). **verified locally** in `vite dev`: with `run_worker_first: ["/api/*"]` a navigation to `/api/login` reached the Worker and a navigation to `/budget/x` got the HTML | Keep `run_worker_first: ["/api/*"]` ([§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker)). The production edge behaviour is **unverified** until M9 |
| Navigation is served by the SW from the cache, never reaching Access | Applies by design; the hand-written SW answers every navigation with the cached `/` (brainstorm §5.1) | The "Log in again" button navigates to `/api/login`; the `/api/*` path is skipped by the SW |
| Session expires during a `fetch` to the API | Access answers with a redirect to the team domain (cross-origin). Whether a browser `fetch` gets a 302 or a 401 is **unverified**: the 401 toggle in the docs is only for the Cloudflare One Client and service auth ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)). With the default `fetch` (follow), the redirect to the team domain probably ends up as a network error that's hard to tell apart from offline (inference; [Access CORS docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/), 25 August 2026, which only covers cross-origin requests *to* the Access domain) | `fetch(..., { redirect: "manual" })` and handle `opaqueredirect`, 401 and 403. **Test on a real phone** |
| Service worker script fetch when the session has expired | `sw.js` is now a built file in `dist/client`, served by the asset layer behind the hostname-based Access app, so it is protected like any other path. The SW spec sets redirect mode `error` for fetching the SW script ([W3C](https://w3c.github.io/ServiceWorker/)): if Access redirects `sw.js` to the login, the update check fails | Harmless: the old SW keeps running. The "new version" banner only shows after logging in again |
| **NEW:** the SW install fetches the whole precache list | `install` calls `cache.addAll(files)` for `/`, the hashed bundle and the manifest. With an expired session those requests are redirected to the team domain; as cross-origin redirects without CORS headers they should fail, `addAll` rejects and the install fails, leaving the old SW and its cache in place (inference from the Fetch and SW specs, **unverified** in a browser) | Nothing to build; test in M9 by letting the session expire, then deploying a new version |
| The iOS PWA cookie jar is separate from Safari | A secondary source says Home Screen app storage is isolated from Safari ([MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)); **unverified** from Apple's docs. The Access login also leaves the app's origin (the team domain), and the behaviour of redirects out of and back into scope in iOS standalone is **unverified** | This is risk #1 in §9.1. Test on day one, before writing features |
| Default 24-hour session | Up to "one month" ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)) | Set 720h |
| CORS and OPTIONS | The app is same-origin, so not needed. But if the frontend is opened from another origin (e.g. `localhost` calling the production API), the preflight gets a 403 ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)) | Partner B develops against the local Worker that runs inside the Vite dev server (`npm run dev`), not against production |
| `workers.dev` and preview URLs open | Hostname-based Access only protects that URL ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)); preview URLs are "public by default" ([Previews](https://developers.cloudflare.com/workers/previews/)) | Both are turned off in the config |

---

## 7. CI/CD and environments

### 7.1 GitHub Actions vs Workers Builds

| | GitHub Actions + `npx vite` and `npx wrangler` | Workers Builds |
|---|---|---|
| Token | An account API token that you scope yourself ([docs](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), 18 September 2026) | "Currently, only user tokens are supported, with account-owned token support coming soon". Default token: Account Settings read, Workers Scripts edit, KV edit, R2 edit, Workers Routes edit for all zones; D1 isn't included, so it has to be added ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token), 22 September 2026) |
| Tests and type check | One workflow: `check` first, `deploy` after | Needs a separate GitHub workflow for PRs too, so two CI systems |
| Preview | None (see §7.4) | If preview builds are enabled, non-production branches run `wrangler preview` by default ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), 22 September 2026); preview URLs are public by default ([Previews](https://developers.cloudflare.com/workers/previews/)) |
| Secrets | GitHub Actions secrets. Public repo: secrets aren't passed to workflows from forks ([GitHub](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions)) | Build variables and secrets in the Cloudflare dashboard |
| Free limit | Actions minutes for a public repo | 3,000 minutes/month, 1 concurrent build, 20-minute timeout |
| Migrations | An explicit step before deploy | Has to be put in the deploy command |
| Consistency | The office repo's pattern: wrangler from GitHub Actions, not Workers Builds | Opposite to that pattern |

**Recommendation: GitHub Actions**, calling `npx vite build` and `npx wrangler` directly from the lockfile (not using `cloudflare/wrangler-action`, one fewer third party; that action is optional according to the Cloudflare docs). The main reasons: one system for checks, migrations, build and deploy, and a token whose scope you control. Workers Builds could also run `npm run build`; that doesn't change the token reasoning above.

### 7.2 Workflow

One file `.github/workflows/ci.yml`, no comments:

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
      - run: npx vite build
      - run: npx wrangler deploy
```

`npm run check` = `tsc -b`, `node --test`, `vite build` and the output guards of [§5.2](#52-frontend-build-a-vite-react-spa-on-the-worker) (no `AUTH_MODE` in the production config, the manifest `crossorigin` survived, no React import in `domain/`, `store/`, `shared/` and `worker/`). The deploy job builds again instead of passing the `check` output along, so no build artifact is uploaded (see the note on logs and artifacts at the end of this paragraph). **Order:** migrations run before the build so a fresh checkout reads the root `wrangler.jsonc`; the build then writes `.wrangler/deploy/config.json`, which `wrangler deploy` follows (**verified locally** with `--dry-run`). `vite build` prints a "Missing required secrets" warning when the three secrets aren't in the CI environment and still exits 0 (**verified locally**); the real check is `secrets.required` at deploy. Whether `wrangler d1 migrations apply` also follows the redirect after a build is **unverified**; the generated config keeps `migrations_dir` pointing at the source folder either way. The PR workflow doesn't touch secrets. The pattern from the other two repos: actions pinned to SHAs with Dependabot bumping them (`<sha>` above is a placeholder). A public repo means **public logs**: no `wrangler whoami`, no `echo` of values, and **don't upload a D1 export as an artifact** (artifacts of a public repo can be downloaded by anyone).

### 7.3 Tokens and secrets

| Name | Place | Contents / scope | Notes |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Account API token `wp-ci`: Account **Workers Scripts Edit** and **D1 Edit**, limited to one account. A zone permission for Custom Domain is not named by any official page ([bootstrap M4](bootstrap.md#m4-cloudflare-api-tokens) has the order to add one if the first deploy needs it, scoped to the `atqamz.com` zone) | The need for a zone permission for Custom Domain is **unverified**; add as little as possible when the first deploy fails. Permission group names are in the [permission list](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | The account ID | The Cloudflare docs say to store it as a secret; whether the account ID is secret isn't stated in the docs I read, so it's safe to treat it as a secret |
| Token `wp-access-setup` | **Not** in GitHub; local, temporary | Account: **Access: Apps and Policies Edit** and **Access: Organizations, Identity Providers, and Groups Edit** (the API reference for creating an identity provider names this combined group, not "Identity Providers Edit") | Created for `scripts/access.sh`, revoked afterwards. Kept separate from the deploy token so a leaked GitHub secret doesn't give the power to change the Access policy |
| Worker secrets (3) | Cloudflare | See §6.2 step 8 | Survive across deploys |

### 7.4 Environments and preview

- **One environment: `production`.** Deploy only from a push to `main`.
- **No preview.** PRs only run `check` without secrets. `workers_dev` and `preview_urls` are false.
- **Local dev** is enough for the frontend and Worker (local D1, fake data).
- **Trigger for staging:** Partner B wants to test the frontend against a real backend without touching production, or a risky migration. Then use `wrangler preview` with the `previews` block (needs wrangler ≥ 4.135): previews "do not inherit production settings", and D1 is only isolated "when you bind the Preview to a separate resource" ([docs](https://developers.cloudflare.com/workers/previews/), [resources](https://developers.cloudflare.com/workers/previews/resources/)). A preview would need its own hostname and its own Access, so that's extra work, not free.

### 7.5 Adding wp to `atqamz/github` later

**Status: done.** The `wp` row was merged into `atqamz/github` and applied; secret scanning and push protection are already enabled on the repo. What follows is kept as the record of how and why.

Per that repo's README and `AGENTS.md`, the change was to the `repos` **table** in `repos.go`, not a new resource:

```go
{
	Name:        "wp",
	Description: "Wedding planner PWA",
	RequirePR:   true,
},
```

- `wp` already exists on GitHub, so run **adopt**: `pulumi config set adopt true`, `pulumi preview`, `pulumi up`, then `pulumi config rm adopt` (README section "Adopting a repo that already exists"). Don't run it unattended.
- Automatic baseline: no rebase merge, delete branch on merge, vulnerability alerts, default workflow permission `read`, dependabot security updates, and the `main guard` ruleset (blocks deletion and force-push).
- `RequirePR: true` makes sense for wp: `main` deploys to production, so changes should go through a PR. **Required status checks are deliberately not managed** by that repo (the reason is in the README: direct-push deadlock), so the CI gate depends on your discipline, not GitHub. This is your decision.
- Manual per the README: secret scanning and push protection (the `gh api` snippet in the README, required for public repos; **done**), and interaction limits (they expire every six months; still the operator's to renew).
- **Don't** put CI secret values in Pulumi (they'd go into state): `gh secret set CLOUDFLARE_API_TOKEN --repo atqamz/wp` and `CLOUDFLARE_ACCOUNT_ID`.
- `dependabot.yml` for `npm` and `github-actions` lives in the wp repo, not in `atqamz/github` (a rule in that repo's `AGENTS.md`).

---

## 8. Repo layout and bootstrap checklist

### 8.1 Layout

```
wp/
  .github/
    dependabot.yml
    workflows/
      ci.yml
  docs/
    brainstorm.md
    features.md
    infra.md
  migrations/
    0001_init.sql
  public/
    icon-192.png
    icon-512.png
    manifest.webmanifest
  scripts/
    access.sh
    seed.sql
  shared/
    tables.ts
    validate.ts
  src/
    main.tsx
    router.ts
    pwa.ts
    sw.js
    domain/
    store/
    hooks/
    views/
    ui/
  test/
    auth.test.ts
    sync.test.ts
    domain.test.ts
  worker/
    index.ts
    auth.ts
    sync.ts
  .dev.vars.example
  .gitignore
  .node-version
  index.html
  package.json
  package-lock.json
  tsconfig.json
  tsconfig.app.json
  tsconfig.node.json
  tsconfig.worker.json
  vite.config.ts
  worker-configuration.d.ts
  wrangler.jsonc
```

Notes: `dist/` and `.wrangler/` are build and dev output and are gitignored, so they are not in the tree. `index.html` sits in the project root (Vite's entry) and holds the `<link rel="manifest" crossorigin="use-credentials">`. `public/` is copied as is into `dist/client`, and `src/sw.js` is not in `public/` because the build stamps it ([§5.7](#57-pwa-and-service-worker)). `src/domain/`, `src/store/` and `shared/` import nothing from React. `.dev.vars.example` holds placeholders for the three secrets (`example.test`); it is only used for `vite preview` of the production build. A Nix flake + direnv like `atqamz/github` is deliberately **deferred**: Partner B needs to run locally with `npm ci`, and Nix could be an obstacle. Add it later if you want full consistency. The earlier layout (`public/app/`, `public/vendor/`, `public/shared/`, `src/worker.ts`) is gone.

### 8.2 Bootstrap checklist

**Manual** (you, once). Each step M1 to M8 is written out click by click, with verification, what to record and what to do on failure, in [`docs/bootstrap.md`](bootstrap.md); this table only keeps the list and the order.

| # | Step | Notes |
|---|---|---|
| M0 | Scaffold the app: start from Cloudflare's React template (`npm create cloudflare@latest -- wp --framework=react`, from the [React guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/)), then reshape it to the layout in §8.1 and the packages in §5.4. I did not run the scaffolder, so what extra packages and files it adds is **unverified**; delete anything not listed in §5.4 | §5.2, §5.4 |
| M1 | Check the account: which account the `atqamz.com` zone is in, what is in that account (Workers, Zero Trust org, the Protect all Workers card) | [Runbook M1](bootstrap.md#m1-find-the-cloudflare-account); §2.3, decision #1 |
| M2 | Zero Trust onboarding (team name, Free, payment details) if the account has no org yet | [Runbook M2](bootstrap.md#m2-zero-trust-free-onboarding); decision #16, §9.2 item 2 |
| M3 | Google Cloud: project, External consent screen, test users, Web OAuth client, origin and redirect URI | [Runbook M3](bootstrap.md#m3-google-oauth-client); §6.2 steps 2 to 4 |
| M4 | Create the tokens `wp-ci` and `wp-access-setup` | [Runbook M4](bootstrap.md#m4-cloudflare-api-tokens); §7.3 |
| M5 | `wrangler d1 create wp`, copy `database_id` into `wrangler.jsonc` (both the top level and `env.dev`) | [Runbook M5](bootstrap.md#m5-create-the-d1-database); manual so the ID lands in the repo |
| M6 | Create the Access app and policy (`scripts/access.sh`, or the API calls in the runbook), note the AUD, then revoke `wp-access-setup` | [Runbook M6](bootstrap.md#m6-create-the-access-app-and-note-the-aud) |
| M7 | Set the three Worker secrets | [Runbook M7](bootstrap.md#m7-set-the-three-worker-secrets); before the first deploy, because of `secrets.required` |
| M8 | `gh secret set` for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` | [Runbook M8](bootstrap.md#m8-set-the-github-actions-secrets) |
| M9 | Test on Android and iPhone: install, Google login, offline start (airplane mode), offline edit, session expiry, the log in again button, and a service-worker update (deploy a second version, see the update prompt, apply it; once more with an expired session) | §6.5; risk #1 |
| M10 | ~~Add the `wp` row to `atqamz/github`, enable secret scanning and push protection~~ **Done** (the row is merged and applied; secret scanning and push protection are enabled) | §7.5 |

Do M5, M7 and M8 before the first push to `main` that contains `ci.yml`: that push runs the deploy job.

**Automatic** (CI, every push to `main`):

| # | Step |
|---|---|
| A1 | `npm ci`, then `npm run check`: `tsc -b`, `node --test`, `vite build`, the output guards (§5.2) |
| A2 | `wrangler d1 migrations apply wp --remote` (before the build) |
| A3 | `vite build`, then `wrangler deploy`: Worker, static assets from `dist/client`, Custom Domain (DNS record + certificate), `secrets.required` validation |
| A4 | Weekly Dependabot for `npm` and `github-actions` |

---

## 9. Risks, open questions, and what is superseded

### 9.1 Risks (most important first)

1. **Access login inside the iOS PWA** (and Android). A separate cookie jar and a redirect to the team domain outside the app's scope (§6.5). Mitigation: test on two phones on day one; if it's annoying, move to the brainstorm's Plan B (device-key cookie), or attach OTP to the same app.
2. **An unnoticed shared Cloudflare account** (§2.3). Impact: quota, the Access org, token sweeps, and the login look. Mitigation: the manual check M1 before writing anything.
3. **Leaks through the public repo**: emails in fixtures, CI logs, artifacts, `.dev.vars`, D1 exports, screenshots. Mitigation: `.gitignore` from the first commit, secret scanning and push protection, fake data, no data artifacts.
4. **A leaked deploy token** gives the power to deploy code to a Worker connected to D1. Mitigation: minimum scope, two separate tokens, `main` through PRs, only official first-party actions pinned to SHAs, 7-day D1 Time Travel ([docs](https://developers.cloudflare.com/d1/reference/time-travel/)).
5. **A Google consent in Testing status may expire every 7 days** (Google exempts apps that request only `openid`, `email` and `profile`; whether Cloudflare's Google integration stays within those is unverified, [bootstrap M3](bootstrap.md#m3-google-oauth-client)) and **Zero Trust onboarding asks for a card**. Both are friction, not failures.
6. **The dev `AUTH_MODE` leaks into production.** Mitigation: the flag only in the `npm run dev` command, checked in `npm run check`.
7. **Account quota** (§2.5): a polling bug or another Worker in the same account.
8. **Toolchain churn:** wrangler 4.x releases very often; `@cloudflare/vite-plugin` 1.62.5 pulls in an alpha `miniflare` 5.x ([npm](https://www.npmjs.com/package/@cloudflare/vite-plugin)); Vite is on major 8 and TypeScript on major 7; Node 24 LTS vs 26. Mitigation: lockfile and Dependabot.
9. **The temptation of excessive IaC/Effect.** Mitigation: the triggers in §3.4 and §4.
10. **The hand-written service worker serves a stale or broken shell.** The cost is the wedding-day offline rundown. Mitigation: the cache name is stamped on every build, the M9 checklist tests offline start and update, and the switch triggers to `vite-plugin-pwa` are in §5.7.
11. **React turns out to be the wrong choice.** Mitigation: the layer rules in brainstorm §6.1, enforced by the grep in `npm run check`; only `views/`, `ui/`, `hooks/` and `main.tsx` would change.
12. **After the event:** who maintains it, and whether the Worker is shut down after exporting the data. Unchanged from the brainstorm.

### 9.2 Open questions for you

1. Which Cloudflare account is `atqamz.com` in, and does another org share that account? (M1)
2. Okay to fill in payment details for Zero Trust Free? If not, Plan B device-key (brainstorm §4) replaces Access, and all of §6 changes.
3. Google consent screen: stay on **Testing** (consent again every week) or **Publish app**?
4. Is a 30-day Access session enough, or do you want it shorter given the personal data?
5. `RequirePR` for `wp` in `atqamz/github`, given that status checks can't be enforced from there?
6. Nix flake now or later, considering Partner B?
7. Does Partner B use Android or iPhone? (from the brainstorm; decides the test order in M9)
8. Do we need periodic D1 exports? If yes, where to (not a public repo artifact)?

**Settled by the operator (no longer open):** hand-written service worker (§5.7); hash routing (§5.1); `en-ID` for `Intl` with the `en-GB` fallback noted in `docs/features.md` §5.7; every identifier in the D1 schema is English; the data model is one generic `items` table plus one `budget_entries` table (`docs/brainstorm.md` §7, `docs/features.md` §7.2).

### 9.3 What this revision supersedes

Statements from the earlier version of this document, removed or rewritten in place (no old text is kept next to the new):

| Earlier statement | Now |
|---|---|
| Decision #6: "plain JS + JSDoc for the frontend; `tsc --noEmit` as the type check", "the frontend stays build-free" | TypeScript everywhere, `tsc -b` over three projects (§5.5) |
| Decision #7 / §5.1: "Router: None, a `switch`", 3 routes | Hash routing with a 10-line hook, 6 screens (§5.1) |
| Decision #8 / §5.1: hand-written validation from `public/shared/tables.js` | Same idea, in `shared/tables.ts` (table specs and the `kind` registry) and `shared/validate.ts` (§5.5) |
| Decision #11 / §5.1: tests run through `wrangler dev` | `node --test` plus an optional test against `CLOUDFLARE_ENV=dev vite` (§5.1) |
| Decision #17 / §5.3: 1 runtime + 3 dev dependencies; "Deliberately absent: ... Workbox, Vite" | 3 runtime + 8 dev; Vite is now in, Workbox stays out (§5.4) |
| §5.2: "With hash routing, SPA mode isn't needed" | SPA mode is on (operator's decision) and `run_worker_first: ["/api/*"]` keeps `/api/login` reachable (§5.2) |
| §5.2: `wrangler.jsonc` with `main: src/worker.ts` and `assets.directory: ./public` | `main: worker/index.ts`, no `assets.directory`, plus an `env.dev` block (§5.2) |
| §5.2: dev auth through `wrangler dev --var AUTH_MODE:dev` | `CLOUDFLARE_ENV=dev vite` and the `env.dev` block (§5.3) |
| §5.4: `src/types.d.ts` with JSDoc `@typedef import(...)`, `allowJs`, `checkJs`, optional `AUTH_MODE` declared by hand | A `shared/` TypeScript folder; `wrangler types` already emits the optional dev vars (§5.5) |
| §6.4: `src/auth.ts` | `worker/auth.ts` |
| §6.5: "Keep it in `index.html`" (for `public/index.html`), "Partner B develops the frontend against the local Worker (`wrangler dev`)" | Rechecked against the build output (§6.5) |
| §7.2: deploy = migrations then `wrangler deploy` | migrations, `vite build`, then `wrangler deploy` (§7.2) |
| §8.1: layout with `public/app/`, `public/vendor/`, `public/shared/`, `src/worker.ts` | New layout (§8.1) |
| §8.2: A1 `tsc --noEmit` | `npm run check` (§8.2) |

### 9.4 Parts of `docs/brainstorm.md` that are superseded

`docs/brainstorm.md` was updated in the same pass; this table says what happened to each section.

| Brainstorm section | Status |
|---|---|
| Summary paragraph at the top | **Rewritten:** React + TypeScript + Vite, Google IdP |
| §3.3 API: one Worker, manual router | **Stays**, plus the `run_worker_first` detail and the file structure (§5.3) |
| §3.4 Architecture overview | **Rewritten:** hostname-based Access with Google IdP, assets from the Vite build |
| §3.5 Free plan limits | **Stays**, re-verified in §2.5 (Worker size: "There is no compressed size limit", only 64 MiB uncompressed, [docs](https://developers.cloudflare.com/workers/platform/limits/)) |
| §4 Auth (OTP recommendation and the "Worker-level" Access setup) | **Marked superseded** at the top of the section; the replacement is §6 here (Google IdP, hostname-based app, inline policy, JWT verification on `/api/*`). The text of the OTP comparison is kept as the record of the options |
| §5.1 Service Worker strategy | **Rewritten:** the precache list is generated at build time; the service worker sketch is updated (§5.7 here) |
| §5.2 Reading and writing offline | **Updated:** own IndexedDB wrapper instead of `idb`, file locations |
| §5.5 Access + offline | **Partly replaced:** 302-vs-401 is still unverified; adds the SW update (§6.5) and the 720h session |
| §6 Frontend without a build step | **Replaced** by "Frontend: React, TypeScript, Vite"; the framework matrix (vanilla, Lit, Preact + htm, Alpine, Vue, HTMX, petite-vue) is removed |
| §8 "How `wp.atqamz.com` is served" (`wrangler.jsonc` sketch) | **Replaced** by the sketch in §5.2 here |
| §8 "Deploy flow" (Workers Builds recommendation) | **Reversed:** GitHub Actions (§7.1), with a build step (§7.2) |
| §8 "Preview builds" paragraph | **Replaced** by §7.4: the new `wrangler preview` mechanism, and wp doesn't use preview for now |
| §9 Risks #3, #6, #7, #9 | **Reordered** in §9.1; #9 (framework debate) is closed |
| §10 Recommendation steps 1, 2, 5 | **Updated** (React from the start; no framework discussion step) |
| §2 "Merged" list and generic-screen paragraph, §3.3, §3.6, §5.2, §5.3 | **Updated** for the three-table model (per-`kind` screens, the table whitelist, rows written per edit, object stores, the example write with `json_patch`) |
| §7 Data model sketch | **Replaced** by "Data model (D1)": one generic `items` table + `budget_entries` + `settings` + `sync_state`, English identifiers, formats from features §6.1, the import mapping rewritten for it. The 12-table sketch is removed |
| §1, §5.4, §5.6 | **Untouched** |
