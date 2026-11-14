# Lehulu

Accessible sign-up, profile and job-application component for ALX Savanna and other learning or job platforms.

A learner signs up one question at a time, by typing or by voice, without needing an ID document, and then
applies for jobs. Instead of asking about disability, Lehulu asks how the learner uses their phone (screen
reader, voice, pictures, large text, sign language, low data) and adapts the screens to that answer.

- **Web component:** TypeScript, Lit 3, Vite 5 (`web/`)
- **API:** Rust, axum 0.8, sqlx + SQLite, OpenAPI via utoipa (`server/`)
- **Question flows:** JSON shared by web and server (`flows/`)
- **Tests:** Vitest, Playwright + axe-core, `cargo test`

## Requirements

| To run | You need |
|---|---|
| Full stack in Docker | Docker 24+ with Compose v2 |
| Web only (demo mode, no server) | Node 22+ with pnpm (`corepack enable pnpm`) |
| Web + API locally | The above, plus Rust 1.80+ |

No API keys or outside services. Everything runs offline after the first install.

## Quick start (Docker)

```bash
git clone https://github.com/kaleab-kali/lehulu.git
cd lehulu
docker compose up --build
```

Open http://localhost:8080. The first build takes 5–10 minutes. Data is stored in the `lehulu-data` volume.

```bash
docker compose down -v      # stop and delete all data
PORT=8090 docker compose up # if port 8080 is taken
```

## Local development

Install once:

```bash
cd web
pnpm install
pnpm exec playwright install chromium   # only needed for end-to-end tests
```

**Demo mode** (no server; data stays in the browser):

```bash
cd web
pnpm dev                 # http://localhost:5173
```

**Against the Rust API** (two terminals):

```bash
cd server
cargo run                # API on http://127.0.0.1:8080, creates server/data/lehulu.db
```

```bash
cd web
pnpm dev:api             # http://localhost:5173, /v1 is proxied to :8080
```

To serve the built pages from the Rust server itself (as Docker does): `cd web && pnpm run build`, then
open http://127.0.0.1:8080.

## Tests

| What | Command |
|---|---|
| Type check | `cd web && pnpm typecheck` |
| Web unit tests | `cd web && pnpm test` |
| End-to-end + accessibility (demo mode) | `cd web && pnpm exec playwright test` |
| End-to-end against a running server | `cd web && BASE_URL=http://localhost:8080 pnpm exec playwright test` |
| Rust tests | `cd server && cargo test` |
| Rust lint | `cd server && cargo fmt --check && cargo clippy --all-targets -- -D warnings` |
| Against the Docker stack | `docker compose --profile test run --rm test` |

On Windows PowerShell, set the variable first: `$env:BASE_URL="http://localhost:8080"; pnpm exec playwright test`.

The end-to-end suite completes every screen with the keyboard only, runs axe on each screen and fails on any
serious or critical issue. It runs on a desktop and a phone viewport. CI (`.github/workflows/ci.yml`) runs
all of the above on every push.

## Using it, step by step

Start the app (Docker or local), then follow these steps.

### 1. Sign up as a learner (http://localhost:8080/)

1. Choose **English** or **አማርኛ**, then **Next**.
2. **How do you use your phone?** Tick one or more, for example **I listen (screen reader)** and
   **Pictures and audio**. The next screens change straight away (picture tiles, a large voice button).
3. **Name:** type it, or press **Answer by voice**, speak, then **Stop recording**. You can then
   **Play my recording**, **Record again** or **Delete recording**.
4. **Phone:** try `123` first to see the error message, then `0911 234 567`.
5. **Date of birth:** Ethiopian calendar (day, month, year). The Gregorian date is shown below.
6. **ID:** choose **No document. A partner can vouch for me**, then **AAAPD**. No ID is ever required.
7. **Support:** already ticked from step 2. Change it if you like. No proof is asked for.
8. **Check your answers:** each answer has **Change**, and spoken answers have **Play recording**.
   Press **Create my account**.

You can stop at any point with **Continue later**. Reload the page and your answers come back.
In Docker or API mode the "continue later" text message appears at http://localhost:8080/dev/sms.

### 2. Find a job and apply (http://localhost:8080/jobs/)

1. The support filter is pre-set from your sign-up. Jobs that offer more of your support come first,
   with matching support marked ✓. The filter runs in the browser; your needs are not sent to the server.
2. Open a job title, answer **Why do you want this job?** by typing or by voice.
3. Choose whether to share your support needs with **this employer only**.
4. **Send application**.

**My profile** on the same page shows your answers and lets you delete your account (and recordings).

### 3. See it as the employer (http://localhost:8080/employer/)

- **Applications received:** pick the job. You see the answer (text or a player for the voice answer) and,
  only if the learner agreed, their support requests in plain words. No diagnosis is ever shown.
- **Post a job:** fill in title, organisation, city (optional) and the support the job offers.
  It appears in the learner's job list.

### 4. Confirm a learner as a partner (http://localhost:8080/partner/)

Choose **AAAPD**, find the learner from step 1 (you can play their spoken name) and press
**I know this person, confirm**. Their ID status becomes "confirmed by partner".

### 5. Inside Savanna

```bash
bash scripts/import-savanna-starter.sh   # downloads the ALX Savanna starter pages into web/public/savanna/
cd web && pnpm run build
```

Open http://localhost:8080/savanna/ (or `/savanna/pages/homepage-v1-paced.html`). Lehulu appears below
Savanna's course bar in Savanna's colours. The end-to-end suite also tests this page when it exists.

### Other pages

| URL | What |
|---|---|
| `/docs` | Swagger UI for the API (spec at `/openapi.json`) |
| `/embed/?flow=signup&lang=am` | Iframe version (`flow` = `signup`, `apply`, `employer`, `jobs`) |
| `/dev/sms` | SMS simulator |

## Adding Lehulu to another site

**Script tag:**

```html
<script type="module" src="https://YOUR-LEHULU-HOST/lehulu.js"></script>
<lehulu-signup lang="am" jobs-url="/jobs"></lehulu-signup>
```

| Element | Attributes |
|---|---|
| `<lehulu-signup>` | `flow` (`signup` · `apply` · `employer`), `lang` (`am` · `en`), `job-id` (with `apply`), `jobs-url`, `profile-url`, `theme` (`light` · `dark`) |
| `<lehulu-jobs>` | `lang` |
| `<lehulu-profile>`, `<lehulu-partner>`, `<lehulu-applications>` | none |

Events bubble out of the component: `lehulu:signup-complete` `{ learnerId, idStatus }`,
`lehulu:preferences` `{ language, accessPreferences }`, `lehulu:application-sent` `{ jobId, supportShared }`,
`lehulu:job-posted` `{ job }`, `lehulu:start-lesson` `{ learnerId }`.

Theming with CSS custom properties: `--lehulu-accent`, `--lehulu-soft`, `--lehulu-font`, `--lehulu-radius`,
`--lehulu-scroll-offset` (height of a fixed header on the host page).

**Iframe** (for sites that block scripts):

```html
<iframe src="https://YOUR-LEHULU-HOST/embed/?flow=signup&lang=am" title="Lehulu sign-up"
        allow="microphone" style="width:100%;min-height:640px;border:0"></iframe>
```

**REST API:** see `/docs`. Main endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/flows/{id}` | Question flow JSON (`signup`, `apply`, `employer`, `needs`) |
| POST · PUT · GET | `/v1/drafts`, `/v1/drafts/{code}` | Autosave and continue later |
| POST | `/v1/learners` | Create an account |
| GET · PATCH · DELETE | `/v1/learners/{id}` | Profile, edit, delete (with recordings) |
| GET | `/v1/jobs` | Jobs; send `Accept: application/ld+json` for schema.org JobPosting |
| POST | `/v1/jobs` | Post a job |
| POST | `/v1/applications` | Apply (`why` text and/or `whyAudio`) |
| GET | `/v1/jobs/{id}/applications` | Applications for a job |
| POST · GET | `/v1/media`, `/v1/media/{id}` | Upload and play a voice answer |
| GET · POST | `/v1/partners/{id}/vouches[/{learnerId}]` | Partner confirms a learner |

Every error has the same shape:

```json
{ "error": { "code": "phone_invalid", "message": "Enter 10 digits that start with 09 or 07, for example 0911 234 567.", "field": "phone" } }
```

## Configuration

Server (environment variables; defaults work for local development, see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `BIND` | `127.0.0.1:8080` | Listen address (`0.0.0.0:8080` in Docker) |
| `DATABASE_URL` | `sqlite://data/lehulu.db?mode=rwc` | SQLite file; migrations run on start |
| `PUBLIC_DIR` | `../web/dist` | Built web files to serve |
| `FLOWS_DIR` | `../flows` | Question flows |
| `SEED_DIR` | `seed` | Jobs and partners loaded into an empty database |
| `MEDIA_DIR` | `data/media` | Voice recordings |
| `SMS_ADAPTER` | `simulator` | Messages shown at `/dev/sms` |
| `PORT` | `8080` | Host port for Docker Compose |

Web (build time): `VITE_DATA_MODE` (`api` or `local`; set by `pnpm dev` / `pnpm dev:api` / `pnpm run build:demo`),
`VITE_API_BASE` (API origin if different from the page), `VITE_BASE` (path prefix, e.g. for GitHub Pages).

## Repository layout

```
web/        components (src/components), flow engine (src/engine), data layer (src/data/store.ts), tests
server/     Rust API: routes, domain rules, migrations, seed data
flows/      signup.json, apply.json, employer.json, needs.json
scripts/    import-savanna-starter.sh
docs/       ARCHITECTURE.md, FEATURES.md (status), CONFORMANCE.md (WCAG 2.2 AA), RECORDING.md
```

To change a question, edit the JSON in `flows/` (keep `en` and `am`). Validation rules must match in
`web/src/engine/validators.ts` and `server/src/domain/validate.rs`.

## Not built yet

- Authentication for employer and partner endpoints (anyone who can reach the API can read applications).
- Offline mode (service worker); opening a "continue later" link directly.
- Recorded audio prompts and sign-language clips (`web/public/audio/`, `web/public/sign/`; see `docs/RECORDING.md`).

Full status: [docs/FEATURES.md](docs/FEATURES.md).

## Licence

See [LICENSE](LICENSE).
