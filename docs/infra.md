# Infra and stack: wp on Cloudflare

Research and decisions as of 6 October 2026. This is a recommendation for you to approve, not an implementation. Some parts of `docs/brainstorm.md` are superseded (list in [§9](#9-risks-open-questions-and-what-is-superseded)); the brainstorm itself isn't changed.

> **Privacy.** This repo is public. No real emails here: addresses are written as `<email-partner-a>` and `<email-partner-b>`. Findings from private repos are written generically ("other org's repo", "office repo"), with no code, hostnames, IDs, secret names or people's names. The `atqamz/github` repo is public, so it can be quoted.
>
> **Label.** **unverified** = I can't prove it from the repo, docs or public DNS. I have no Cloudflare, Google or GitHub write credentials. All versions and dates were checked on 6 October 2026 through npm, the GitHub API, the Go proxy and the linked docs pages; versions of npm packages that aren't linked (e.g. `jose`, `zod`, `valibot`, `kysely`, `vitest`, `typescript`) come from `npm view` on that date.

## Decision table

| # | Area | Choice | One-line reason |
|---|---|---|---|
| 1 | Cloudflare account | The account that holds the `atqamz.com` zone, with its own Zero Trust org. Check first whether another org shares that account | Custom Domain needs an active zone in the same account; the three zones I saw use three different NS pairs, so they are probably separate accounts (unverified) |
| 2 | IaC for Worker, D1, domain | `wrangler.jsonc` only, deployed from CI | wrangler already declares everything; any other IaC still needs wrangler for code, assets and migrations |
| 3 | IaC for Access | One-time manual setup (Google OAuth client) + one `scripts/access.sh` script (curl to the API) for IdP, app, policy | Only 3 objects; a state backend is heavier than the work |
| 4 | Pulumi, OpenTofu, Alchemy | Not yet. If later: Pulumi Go, in a separate repo | Consistent with `atqamz/github`; trigger is in §3.4 |
| 5 | Effect | **No** (later only with the trigger in §4) | Two users and ±3 endpoints; Alchemy v2 forces Effect, so choosing it means choosing both |
| 6 | Language | TypeScript for the Worker; plain JS + JSDoc for the frontend; `tsc --noEmit` as the type check | wrangler bundles TS with no config; the frontend stays build-free |
| 7 | Router | None, a `switch` | 3 routes |
| 8 | Validation | Hand-written from the same table spec as the SQL whitelist | One source of truth, zero dependencies |
| 9 | D1 access | `prepare().bind()` and `batch()`, no ORM | Small queries, already written in brainstorm §5.3 |
| 10 | Migrations | SQL files + `wrangler d1 migrations apply`, run in CI before deploy | Built into D1; a failed migration is rolled back automatically |
| 11 | Tests | `node --test` (TS directly, Node 24) + one integration test through `wrangler dev` | Zero test framework; `@cloudflare/vitest-plugin` later if needed |
| 12 | Auth | Access + Google IdP, hostname-based app, allow policy for two emails; the Worker verifies the JWT with `jose` | What you asked for, and zero login code |
| 13 | The two emails | Local password store (source), Worker secret, and the Access policy. Not in the repo, not in GitHub secrets | Fewer copies, smaller chance of a leak |
| 14 | CI/CD | GitHub Actions calls `npx wrangler` directly; not Workers Builds | One CI system for tests + migrations + deploy; Workers Builds only accepts user-owned tokens |
| 15 | Environment | A single `production`, no preview. Staging later if there's a trigger | Preview URLs are public by default and share D1 unless separated |
| 16 | Repo settings | A `wp` row in `repos.go` of `atqamz/github` later; CI secrets stay `gh secret set` | That repo's own rule: settings there, workflow and dependabot in each repo |
| 17 | Dependencies | 1 runtime (`jose`) + 3 dev (`wrangler`, `typescript`, `@types/node`) | Each one is justified in §5.3 |

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

**A 30-second manual check:** open the Cloudflare dashboard, look at the account list at the top left, and see which account `atqamz.com` is in. If that account also holds another org's zones or Workers, scenario B below applies.

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
- **Learning cost:** `Effect.gen` generators, `Layer`, tagged errors and the runtime model. Partner B also has to be able to read the code, and a frontend without a build step can't share Effect code with the Worker.
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
| Worker language | TypeScript | wrangler bundles TS automatically; TS is [first-class](https://developers.cloudflare.com/workers/languages/typescript/) (3 July 2026). The only other first-class languages are JavaScript, Python and Rust; Go only through Wasm ([docs](https://developers.cloudflare.com/workers/languages/), 3 July 2026) |
| Frontend language | JS ES modules + JSDoc, `// @ts-check` | The no-build-step constraint stays intact |
| Worker structure | One `fetch` handler with a `switch` on `${method} ${pathname}`, three files (`worker.ts`, `auth.ts`, `sync.ts`) | See §5.2 |
| Router | None | Trigger: > ±8 routes or per-route middleware → Hono ([4.13.13](https://www.npmjs.com/package/hono), has `hono/jwk` with `jwks_uri`, [docs](https://hono.dev/docs/middleware/builtin/jwk); whether it checks `aud` and `iss` is **unverified**) |
| Validation | A hand-written function from the table spec (`public/shared/tables.js`) which is also the SQL whitelist | Trigger: payload shape grows beyond a per-table patch → `valibot` (1.5.0) or `zod` (4.6.5) |
| D1 access | `env.DB.prepare(sql).bind(...)` and `env.DB.batch([...])`; SQL only from the whitelist | Trigger: many dynamic queries → Kysely (0.29.6). Drizzle is supported by wrangler through `migrations_pattern` ([docs](https://developers.cloudflare.com/d1/reference/migrations/)) but adds a toolchain |
| Migrations | `migrations/NNNN_*.sql`, `wrangler d1 migrations apply wp --remote` in CI | Use the database name, not the binding name, so it doesn't hit the wrong target ([docs](https://developers.cloudflare.com/d1/reference/migrations/), 8 June 2026). In CI the confirmation is skipped, a backup is still taken, and a failed migration is rolled back ([docs](https://developers.cloudflare.com/workers/wrangler/commands/d1/)) |
| Tests | `node --test` for pure logic and JWT verification; one integration test that runs `wrangler dev --persist-to <tmp>` then calls the API | Node 24 runs `.ts` directly: type stripping is stable since v24.12.0 ([Node docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)). Trigger for [`@cloudflare/vitest-plugin`](https://developers.cloudflare.com/workers/testing/vitest-integration/) (1.3.6, peer `vitest ^4.1`; latest vitest is 5.0.3, so it has to be pinned to 4.x): if you need per-test D1 isolation or tests running in the workerd runtime |
| Local dev | `wrangler dev` (local D1, persisted between runs, [docs](https://developers.cloudflare.com/d1/best-practices/local-development/)), seed `scripts/seed.sql` containing **fake data only** | Dev auth through a flag, see §5.2 |
| Worker types | `wrangler types` generates `worker-configuration.d.ts` (committed) | No need for `@cloudflare/workers-types` |

### 5.2 Worker structure and dev auth

The `fetch` flow:

1. Only `/api/*` reaches the Worker (`assets.run_worker_first: ["/api/*"]`); static files are served by the platform and free. With hash routing, SPA mode isn't needed.
2. `authenticate(request, env)` returns an email or `null`; `null` means a 401 JSON.
3. `switch` to `GET /api/sync`, `POST /api/sync`, `GET /api/login` (redirect to `/`, the contract from brainstorm §3.3).
4. Errors return generic JSON; no stack traces or emails in responses or logs.

**Dev mode without Access:** `package.json` has `"dev": "wrangler dev --var AUTH_MODE:dev --var DEV_EMAIL:dev@example.test"`. `wrangler dev` supports `--var` ([docs](https://developers.cloudflare.com/workers/wrangler/commands/workers/)). Because `AUTH_MODE` only exists in that command, production fails closed. The reason for not using `.dev.vars`: once `secrets.required` is defined, only the registered keys are loaded from `.dev.vars` ([secrets docs](https://developers.cloudflare.com/workers/configuration/secrets/)). `npm run check` includes `! grep -q AUTH_MODE wrangler.jsonc` so that flag never ships.

`wrangler.jsonc` sketch:

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
    { "binding": "DB", "database_name": "wp", "database_id": "<uuid from wrangler d1 create>", "migrations_dir": "migrations" }
  ],
  "secrets": { "required": ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "ALLOWED_EMAILS"] }
}
```

`database_id` is a UUID, not a credential (useless without a token); that's my judgement, not a docs claim. `workers_dev` and `preview_urls` are turned off explicitly: `workers_dev` defaults to `false` when there are `routes`, and for `preview_urls` "If omitted, Wrangler does not change an existing setting" ([config docs](https://developers.cloudflare.com/workers/wrangler/configuration/)).

### 5.3 Each dependency and why

| Package | Kind | Reason | Rejected alternatives |
|---|---|---|---|
| `jose` 6.2.12 | runtime | Access JWT verification: signature, `iss`, `aud`, `exp`, remote JWKS with caching and key rotation. A security path, don't write it yourself. The [Cloudflare docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) give a Workers example with `jose` | Manual WebCrypto (±40 lines, but key rotation and subtle mistakes become your burden); `hono/jwk` (pulls in Hono) |
| `wrangler` 4.147.0 | dev | Bundle, deploy, D1, local dev, `wrangler types`. No replacement | |
| `typescript` 7.0.2 | dev | `tsc --noEmit` checks the Worker (TS) and the frontend (JSDoc) together | No frontend type check at all |
| `@types/node` | dev | Types for `node:test` and `node:assert` for test files | Write tests in JS: lose the types |

Deliberately absent: Hono, zod/valibot, ORM, Workbox, Vite, vitest, `@cloudflare/workers-types`, `wrangler-action`.

### 5.4 Sharing types with a build-free frontend

- **Types only (zero runtime):** `src/types.d.ts` holds the row, mutation and API contract. The JS frontend references it through JSDoc, with exactly the pattern in the [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html): `/** @typedef {import('<relative path>/src/types').Mutation} Mutation */`. That's a comment, so the browser executes nothing. `tsconfig.json` with `allowJs`, `checkJs` and [`erasableSyntaxOnly`](https://www.typescriptlang.org/tsconfig/#erasableSyntaxOnly) checks the Worker and frontend in a single `tsc --noEmit`. `erasableSyntaxOnly` forbids TS syntax that can't be erased (e.g. `enum`), so TS files can still be run by Node in tests through type stripping. The `Env` generated by `wrangler types` doesn't know `AUTH_MODE` and `DEV_EMAIL` (they only come from the dev flag); declare them as optional in `src/types.d.ts`.
- **Shared code:** `public/shared/tables.js` (table and column spec) is a plain ES module. The browser loads it as an asset, the Worker imports it (`../public/shared/tables.js`) and wrangler bundles it. One file becomes both the server whitelist and the client generic list screen. Its contents are a public spec, not data.
- **Only shared once proven duplicated:** start with types only; move the spec to `shared/` when the generic list screen really needs it.

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
| 4 | Consent screen status **Testing**, add `<email-partner-a>` and `<email-partner-b>` as test users | M | Testing is limited to 100 test users and "authorizations by a test user will expire seven days from the time of consent" ([Google](https://support.google.com/cloud/answer/15549945)): you'll be asked to consent again every week. The alternative is "Publish app"; whether an "unverified" screen shows up for basic scopes is **unverified** |
| 5 | Create the `google` IdP in Zero Trust (`client_id`, `client_secret`, optional PKCE) | C | `scripts/access.sh`, or the dashboard. The fields are in the [API reference](https://developers.cloudflare.com/api/resources/zero_trust/subresources/identity_providers/methods/create/) |
| 6 | Create a `self_hosted` Access app for `wp.atqamz.com`, `allowed_idps` = the IdP above, `auto_redirect_to_identity` = true, `session_duration` = `720h`, an inline `allow` policy with two `email` rules | C | `scripts/access.sh`. The app session can go up to "one month" ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)); 720h = 30 days. Instant auth is recommended when there's only one IdP ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)) |
| 7 | Note the app's AUD tag | C | The script prints it (it's also in the dashboard: Applications → Additional settings) |
| 8 | Set three Worker secrets: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ALLOWED_EMAILS` | M, once | `wrangler secret put`, or `wrangler deploy --secrets-file <file>` for the first deploy ([docs](https://developers.cloudflare.com/workers/configuration/secrets/)). `secrets.required` makes the deploy fail if any is missing |
| 9 | Custom Domain `wp.atqamz.com` | C | The `routes` block in `wrangler.jsonc`. Wrangler creates the DNS record and certificate; it can't be done on a hostname that already has a CNAME ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), 29 September 2026) |
| 10 | Turn off `workers.dev` and preview URLs | C | `wrangler.jsonc` (above) |
| 11 | Test on two phones | M | See §6.5 |

**The Access app is hostname-based, not Worker-level.** The [Workers + Access docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) describe two paths. Worker-level (destination `worker` + `worker_id`) protects all the Worker's domains at once, but is tied to the Worker ID and only offers a basic policy in the dashboard. Hostname-based protects exactly one URL. I chose hostname because `workers.dev` and preview are already turned off in the config, and the Worker still verifies the JWT itself on `/api/*` as a second layer.

### 6.3 Where the two emails are stored

The emails **never** go into the repo: not in `wrangler.jsonc` (`vars` is forbidden for sensitive data, [docs](https://developers.cloudflare.com/workers/configuration/secrets/)), not in test fixtures, not in docs, not in CI logs.

| Place | Mechanism | Role |
|---|---|---|
| The personal password store you already use | Source of truth, read manually | Injected into the environment when running `scripts/access.sh` and `wrangler secret put` |
| Access policy (in Cloudflare) | Set by the script or the dashboard | The main gate |
| Worker secret `ALLOWED_EMAILS` | `wrangler secret put` | Second layer: the Worker rejects an email that isn't in the list even if the Access policy is misconfigured. Compared lowercase, comma-separated |

Deliberately **not** copied into GitHub Actions secrets: the deploy workflow doesn't need them ("Wrangler will not delete your secrets unless you run `wrangler secret delete`", [docs](https://developers.cloudflare.com/workers/wrangler/configuration/); `secrets.required` only checks existence). Tests and fixtures use `a@example.test` and `b@example.test`. The initial `.gitignore` (merged with the list in brainstorm §8): `.dev.vars*`, `.env*`, `.wrangler/`, `node_modules/`, `*.ods`, `*.xlsx`, `*.csv`, `import*.sql`, `wp-private/`.

### 6.4 JWT verification in the Worker

Per the [docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/): validate the `Cf-Access-Jwt-Assertion` header (not the cookie; the cookie "is not guaranteed to be passed"), fetch the keys from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, check `aud` against the app's AUD, `iss` against the team domain, `exp`, then read `email`. Keys rotate every 6 weeks and the old key stays valid for 7 days, so match by `kid`; `createRemoteJWKSet` from `jose` does that.

`src/auth.ts` sketch:

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

Notes: `ctx.access` is **not available** to a Worker with static assets: "the router does not pass `ctx.access` to the user Worker" ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), 18 August 2026), so manual verification is needed. Restrict `algorithms` in the `jwtVerify` options after you check `alg` in the JWKS (unverified). If Access is missing or misconfigured, the static files (frontend code, no data) are open, but `/api/*` is still 401. That's intentional.

### 6.5 Manifest and service worker behind Access: rechecking the brainstorm caveats

| Caveat | Status 6 October 2026 | Action |
|---|---|---|
| The manifest needs `crossorigin="use-credentials"` | **Confirmed.** MDN: "If the manifest requires credentials to fetch, the `crossorigin` attribute must be set to `use-credentials`, even if the manifest file is in the same origin as the current page" ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest)) | Keep it in `index.html` |
| `ctx.access` isn't there with static assets | **Confirmed** (§6.4) | Manual JWT verification |
| Navigation is served by the SW from the cache, never reaching Access | Applies by design | The "Log in again" button navigates to `/api/login`; the `/api/*` path is skipped by the SW |
| Session expires during a `fetch` to the API | Access answers with a redirect to the team domain (cross-origin). Whether a browser `fetch` gets a 302 or a 401 is **unverified**: the 401 toggle in the docs is only for the Cloudflare One Client and service auth ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)). With the default `fetch` (follow), the redirect to the team domain probably ends up as a network error that's hard to tell apart from offline (inference; [Access CORS docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/), 25 August 2026, which only covers cross-origin requests *to* the Access domain) | `fetch(..., { redirect: "manual" })` and handle `opaqueredirect`, 401 and 403. **Test on a real phone** |
| **NEW:** service worker update when the session has expired | The SW spec sets redirect mode `error` for fetching the SW script ([W3C](https://w3c.github.io/ServiceWorker/)): if Access redirects `sw.js` to the login, the update fails | Harmless: the old SW keeps running. The "new version" banner only shows after logging in again |
| The iOS PWA cookie jar is separate from Safari | A secondary source says Home Screen app storage is isolated from Safari ([MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)); **unverified** from Apple's docs. The Access login also leaves the app's origin (the team domain), and the behaviour of redirects out of and back into scope in iOS standalone is **unverified** | This is risk #1 in §9. Test on day one, before writing features |
| Default 24-hour session | Up to "one month" ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/)) | Set 720h |
| CORS and OPTIONS | The app is same-origin, so not needed. But if the frontend is opened from another origin (e.g. `localhost` calling the production API), the preflight gets a 403 ([docs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/)) | Partner B develops the frontend against the local Worker (`wrangler dev`), not against production |
| `workers.dev` and preview URLs open | Hostname-based Access only protects that URL ([docs](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)); preview URLs are "public by default" ([Previews](https://developers.cloudflare.com/workers/previews/)) | Both are turned off in the config |

---

## 7. CI/CD and environments

### 7.1 GitHub Actions vs Workers Builds

| | GitHub Actions + `npx wrangler` | Workers Builds |
|---|---|---|
| Token | An account API token that you scope yourself ([docs](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), 18 September 2026) | "Currently, only user tokens are supported, with account-owned token support coming soon". Default token: Account Settings read, Workers Scripts edit, KV edit, R2 edit, Workers Routes edit for all zones; D1 isn't included, so it has to be added ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#api-token), 22 September 2026) |
| Tests and type check | One workflow: `check` first, `deploy` after | Needs a separate GitHub workflow for PRs too, so two CI systems |
| Preview | None (see §7.4) | If preview builds are enabled, non-production branches run `wrangler preview` by default ([docs](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), 22 September 2026); preview URLs are public by default ([Previews](https://developers.cloudflare.com/workers/previews/)) |
| Secrets | GitHub Actions secrets. Public repo: secrets aren't passed to workflows from forks ([GitHub](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions)) | Build variables and secrets in the Cloudflare dashboard |
| Free limit | Actions minutes for a public repo | 3,000 minutes/month, 1 concurrent build, 20-minute timeout |
| Migrations | An explicit step before deploy | Has to be put in the deploy command |
| Consistency | The office repo's pattern: wrangler from GitHub Actions, not Workers Builds | Opposite to that pattern |

**Recommendation: GitHub Actions**, calling `npx wrangler` directly from the lockfile (not using `cloudflare/wrangler-action`, one fewer third party; that action is optional according to the Cloudflare docs). The main reasons: one system for tests, migrations and deploy, and a token whose scope you control.

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
      - run: npx wrangler deploy
```

`npm run check` = `tsc --noEmit`, `node --test`, and the `AUTH_MODE` check in §5.2. The PR workflow doesn't touch secrets. The pattern from the other two repos: actions pinned to SHAs with Dependabot bumping them (`<sha>` above is a placeholder). A public repo means **public logs**: no `wrangler whoami`, no `echo` of values, and **don't upload a D1 export as an artifact** (artifacts of a public repo can be downloaded by anyone).

### 7.3 Tokens and secrets

| Name | Place | Contents / scope | Notes |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Actions secret | Account API token `wp-ci`: Account **Workers Scripts Edit** and **D1 Edit**, plus a zone permission for Custom Domain (start from the "Edit Cloudflare Workers" template in the [CI docs](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), then revoke what isn't needed), limited to one account and the `atqamz.com` zone | The exact permission for Custom Domain is **unverified**; add as little as possible when the first deploy fails. Permission group names are in the [permission list](https://developers.cloudflare.com/fundamentals/api/reference/permissions/) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secret | The account ID | The Cloudflare docs say to store it as a secret; whether the account ID is secret isn't stated in the docs I read, so it's safe to treat it as a secret |
| Token `wp-access-setup` | **Not** in GitHub; local, temporary | Account: **Access: Apps and Policies Edit** and **Access: Identity Providers Edit** | Created for `scripts/access.sh`, revoked afterwards. Kept separate from the deploy token so a leaked GitHub secret doesn't give the power to change the Access policy |
| Worker secrets (3) | Cloudflare | See §6.2 step 8 | Survive across deploys |

### 7.4 Environments and preview

- **One environment: `production`.** Deploy only from a push to `main`.
- **No preview.** PRs only run `check` without secrets. `workers_dev` and `preview_urls` are false.
- **Local dev** is enough for the frontend and Worker (local D1, fake data).
- **Trigger for staging:** Partner B wants to test the frontend against a real backend without touching production, or a risky migration. Then use `wrangler preview` with the `previews` block (needs wrangler ≥ 4.135): previews "do not inherit production settings", and D1 is only isolated "when you bind the Preview to a separate resource" ([docs](https://developers.cloudflare.com/workers/previews/), [resources](https://developers.cloudflare.com/workers/previews/resources/)). A preview would need its own hostname and its own Access, so that's extra work, not free.

### 7.5 Adding wp to `atqamz/github` later

Per that repo's README and `AGENTS.md`, change the `repos` **table** in `repos.go`, not a new resource:

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
- Still manual per the README: secret scanning and push protection (the `gh api` snippet in the README, required for public repos), and interaction limits (they expire every six months).
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

Notes: `public/` follows the layout in brainstorm §6.1. `.dev.vars.example` holds placeholders for the three secrets (`example.test`). A Nix flake + direnv like `atqamz/github` is deliberately **deferred**: Partner B needs to run locally with `npm ci`, and Nix could be an obstacle. Add it later if you want full consistency.

### 8.2 Bootstrap checklist

**Manual** (you, once):

| # | Step | Notes |
|---|---|---|
| M1 | Check the account: which account the `atqamz.com` zone is in, what is in that account (Workers, Zero Trust org, the Protect all Workers card) | §2.3, decision #1 |
| M2 | Zero Trust onboarding (team name, Free, payment details) if the account has no org yet | Decision #12, §9.2 item 2 |
| M3 | Google Cloud: project, External + Testing consent screen, test users, Web OAuth client, origin and redirect URI | §6.2 steps 2 to 4 |
| M4 | Create the tokens `wp-ci` and `wp-access-setup` | §7.3 |
| M5 | `wrangler d1 create wp`, copy `database_id` into `wrangler.jsonc` | Manual so the ID lands in the repo. For resources auto-provisioned by a deploy through the dashboard/Git: the ID "will not be written back" to the repo ([docs](https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning)) |
| M6 | Run `scripts/access.sh` locally with env from the password store; note the AUD | Then revoke `wp-access-setup` |
| M7 | Set the three Worker secrets (`wrangler secret put`, or `--secrets-file` on the first deploy) | Before the first deploy, because of `secrets.required` |
| M8 | `gh secret set` for `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` | |
| M9 | Test on Android and iPhone: install, Google login, offline edit, session expiry, the log in again button | §6.5; risk #1 |
| M10 | Add the `wp` row to `atqamz/github`, enable secret scanning and push protection | §7.5; after the repo has content |

**Automatic** (CI, every push to `main`):

| # | Step |
|---|---|
| A1 | `npm ci`, `tsc --noEmit`, `node --test`, the `AUTH_MODE` check |
| A2 | `wrangler d1 migrations apply wp --remote` |
| A3 | `wrangler deploy`: Worker, static assets, Custom Domain (DNS record + certificate), `secrets.required` validation |
| A4 | Weekly Dependabot for `npm` and `github-actions` |

---

## 9. Risks, open questions, and what is superseded

### 9.1 Risks (most important first)

1. **Access login inside the iOS PWA** (and Android). A separate cookie jar and a redirect to the team domain outside the app's scope (§6.5). Mitigation: test on two phones on day one; if it's annoying, move to the brainstorm's Plan B (device-key cookie), or attach OTP to the same app.
2. **An unnoticed shared Cloudflare account** (§2.3). Impact: quota, the Access org, token sweeps, and the login look. Mitigation: the manual check M1 before writing anything.
3. **Leaks through the public repo**: emails in fixtures, CI logs, artifacts, `.dev.vars`, D1 exports, screenshots. Mitigation: `.gitignore` from the first commit, secret scanning and push protection, fake data, no data artifacts.
4. **A leaked deploy token** gives the power to deploy code to a Worker connected to D1. Mitigation: minimum scope, two separate tokens, `main` through PRs, only official first-party actions pinned to SHAs, 7-day D1 Time Travel ([docs](https://developers.cloudflare.com/d1/reference/time-travel/)).
5. **A Google consent in Testing status expires every 7 days** and **Zero Trust onboarding asks for a card**. Both are friction, not failures.
6. **The dev `AUTH_MODE` leaks into production.** Mitigation: the flag only in the `npm run dev` command, checked in `npm run check`.
7. **Account quota** (§2.5): a polling bug or another Worker in the same account.
8. **Toolchain churn:** wrangler 4.x releases very often and pulls in an alpha `miniflare` 5.x as a dependency, TypeScript just hit major 7, Node 24 LTS vs 26. Mitigation: lockfile and Dependabot.
9. **The temptation of excessive IaC/Effect.** Mitigation: the triggers in §3.4 and §4.
10. **After the event:** who maintains it, and whether the Worker is shut down after exporting the data. Unchanged from the brainstorm.

### 9.2 Open questions for you

1. Which Cloudflare account is `atqamz.com` in, and does another org share that account? (M1)
2. Okay to fill in payment details for Zero Trust Free? If not, Plan B device-key (brainstorm §4) replaces Access, and all of §6 changes.
3. Google consent screen: stay on **Testing** (consent again every week) or **Publish app**?
4. Is a 30-day Access session enough, or do you want it shorter given the personal data?
5. `RequirePR` for `wp` in `atqamz/github`, given that status checks can't be enforced from there?
6. Nix flake now or later, considering Partner B?
7. Does Partner B use Android or iPhone? (from the brainstorm; decides the test order in M9)
8. Do we need periodic D1 exports? If yes, where to (not a public repo artifact)?

### 9.3 Parts of `docs/brainstorm.md` that are superseded

| Brainstorm section | Status |
|---|---|
| §3.3 API: one Worker, manual router | **Stays**, plus the `run_worker_first` detail and the file structure (§5.2) |
| §3.4 Architecture overview | **Replaced**: hostname-based Access with Google IdP, not "Worker-level, email OTP" |
| §3.5 Free plan limits | **Stays**, re-verified in §2.5 (Worker size: "There is no compressed size limit", only 64 MiB uncompressed, [docs](https://developers.cloudflare.com/workers/platform/limits/)) |
| §4 Auth (OTP recommendation and the "Worker-level" Access setup) | **Replaced** by §6: Google IdP, hostname-based app, inline policy, JWT verification on `/api/*`. The "Traps" list is updated in §6.5 |
| §5.5 Access + offline | **Partly replaced:** 302-vs-401 is still unverified; adds the SW update (§6.5) and the 720h session |
| §8 "How `wp.atqamz.com` is served" (`wrangler.jsonc` sketch) | **Replaced** by the sketch in §5.2 (`secrets.required`, `run_worker_first`, `compatibility_date`) |
| §8 "Deploy flow" (Workers Builds recommendation) | **Reversed:** GitHub Actions (§7.1) |
| §8 "Preview builds" paragraph | **Replaced** by §7.4: the new `wrangler preview` mechanism, and wp doesn't use preview for now |
| §9 Risks #3, #6, #7 | **Reordered** in §9.1 |
| §10 Recommendation step 2 ("Worker-level Access") | **Replaced** by §8.2 |
| §1, §2, §5.1 to 5.4, §5.6, §6, §7 | **Untouched** |
