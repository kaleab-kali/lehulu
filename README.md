# Lehulu (ለሁሉ, "for everyone")

Track 1, Accessible onboarding · Digital Bridge Accessibility Hackathon 2026.
Team: Kaleab Girma, Melaku Abebe, Leulseged Bekele, Ezana Tegegne · Co-designer: _add name_

**Live test system: https://kaleab-kali.github.io/lehulu/**

![Lehulu front page](docs/screenshots/front-page.jpg)

## Test accounts

Every screen opens inside Savanna's own layout (header and sidebar). The live site is a test system: SMS codes are
shown on screen, and each tester's data stays in their own browser. Docker Compose has the same accounts.

| Who | Page | Sign in with | What you will see |
|---|---|---|---|
| New learner | `/savanna/pages/lehulu-signup.html` | Nothing; any phone number, for example `0911 234 567` | The sign-up questions |
| Hanna Tesfaye, returning learner | `/savanna/pages/lehulu-profile.html` | Phone `0911 000 001`, code `123456` | Her profile; no ID, waiting for AAAPD |
| Dawit Bekele, applicant | `/savanna/pages/lehulu-jobs.html` | Phone `0911 000 002`, code `123456` | Jobs, and his application |
| Partner: AAAPD | `/savanna/pages/lehulu-partner.html` | ID `aaapd`, password `aaapd-demo`, or **Continue as AAAPD** | Hanna, waiting to be confirmed |
| Employer: Lideta Tech | `/savanna/pages/lehulu-employer.html` | ID `lideta-tech`, password `lideta-tech-demo`, or **Continue as Lideta Tech** | Dawit's application, with his support needs |

The test learners are in [`server/seed/test-learners.json`](server/seed/test-learners.json). They exist only when
`DEMO_MODE=true`, and only their phones get the fixed code; everyone else gets a random one.

## What it does

Lehulu is a sign-up, profile and job-application module that any learning or job platform adds with one script
tag. A learner signs up one question at a time, by typing or by voice, in Amharic or English, without needing an
ID document. Instead of asking about disability, it asks how the learner uses their phone, adapts every screen to
that answer, and (only if the learner agrees) lets the host platform adapt too.

## Screens

**Inside Savanna.** Each Lehulu screen in Savanna's header and sidebar, in Savanna's colours
(made by `scripts/make-savanna-pages.py`):

| Sign-up | Hanna's profile | Jobs |
|---|---|---|
| ![Sign-up inside Savanna](docs/screenshots/savanna-signup.jpg) | ![Hanna Tesfaye signed in, her profile inside Savanna](docs/screenshots/savanna-profile.jpg) | ![Jobs inside Savanna](docs/screenshots/savanna-jobs.jpg) |

| Partner: AAAPD confirms Hanna | Employer: Lideta Tech reads Dawit's application |
|---|---|
| ![Partner screen inside Savanna](docs/screenshots/savanna-partner.jpg) | ![Employer screen inside Savanna](docs/screenshots/savanna-employer.jpg) |

The same script tag on all three ALX Savanna starter pages:

| Learner dashboard (paced) | Learner dashboard (self-paced) | Lesson page |
|---|---|---|
| ![Lehulu sign-up inside the paced Savanna dashboard](docs/screenshots/savanna-dashboard.jpg) | ![Lehulu sign-up inside the self-paced Savanna dashboard](docs/screenshots/savanna-self-paced.jpg) | ![Lehulu sign-up inside the Savanna lesson page](docs/screenshots/savanna-lesson.jpg) |

**Sign-up**, one question at a time:

| How do you use your phone? | A plain error, read out | Picture choices, no ID needed |
|---|---|---|
| ![Ways of using the phone](docs/screenshots/signup-ways.jpg) | ![Phone number error with an example](docs/screenshots/signup-error.jpg) | ![ID question as picture tiles](docs/screenshots/signup-pictures.jpg) |

| Check your answers | Account ready | Amharic, by voice, on a phone |
|---|---|---|
| ![Review with a Change button on every answer](docs/screenshots/signup-review.jpg) | ![Account ready, ID waiting for the partner, the site adapts](docs/screenshots/signup-done.jpg) | ![Amharic name question with a large voice button](docs/screenshots/phone-amharic-voice.jpg) |

**Jobs, partner and employer** (Lehulu's own plain pages):

| Jobs and my profile | Application sent | Partner sign-in |
|---|---|---|
| ![Jobs sorted by support, and the profile](docs/screenshots/jobs-profile.jpg) | ![Application sent](docs/screenshots/apply-sent.jpg) | ![One-tap test accounts for partners](docs/screenshots/partner-sign-in.jpg) |

| Partner confirms or registers a learner | Employer posts jobs and reads applications | On a page with no other styles |
|---|---|---|
| ![Partner screen](docs/screenshots/partner.jpg) | ![Employer screen](docs/screenshots/employer.jpg) | ![The sign-up alone on a blank page](docs/screenshots/blank-page.jpg) |

## How it works for each learner

The second question, **How do you use your phone?**, sets how every later screen behaves.

| The learner | Chooses | Lehulu then |
|---|---|---|
| is blind | I listen (screen reader) | Announces every question and error, moves the cursor where it is needed, pre-ticks extra time |
| has low vision | Big and simple | Uses large text and 60-pixel buttons; works at 400% zoom with no sideways scrolling |
| is Deaf | Sign language | Keeps everything in writing, needs no sound, shows a picture for each question and picture choices, offers interpreter and captions as support |
| cannot type easily | I speak my answers | Puts **Answer by voice** first; the recording is the answer; no time limits, no dragging |
| reads little | Pictures and audio, few words | Shows choices as picture tiles and reads each question aloud |
| has little data | Save my data | Loads video only when tapped; keeps every answer on the phone if the signal drops |

A learner with no ID document chooses **No document. A partner can vouch for me**, finishes sign-up straight away,
and a partner such as AAAPD confirms them later.

## The main task we tested

A blind learner with no kebele ID signs up in Amharic on a low-cost Android phone with TalkBack, has a partner
organisation confirm who they are, and applies for a job, with nobody helping.

## Run it

```bash
git clone https://github.com/kaleab-kali/lehulu.git
cd lehulu
docker compose up --build
```

Open **http://localhost:8080**. The first build takes 5–10 minutes. `docker compose down -v` deletes all data;
`PORT=8090 docker compose up` if 8080 is taken.

Docker Compose runs Lehulu as a test system, because a laptop has no SMS service and no partner passwords: the
sign-in code is shown on screen instead of texted, and the partner and employer screens offer one-tap test
accounts (**Continue as AAAPD**). Everything else works as it would for real. [Going live](#going-live) lists the
four settings that turn this off.

| Page | What it is |
|---|---|
| http://localhost:8080/ | What Lehulu is, how it works, how to add it |
| http://localhost:8080/signup/ | Learner sign-up |
| http://localhost:8080/jobs/ | Jobs, and **My profile** (sign in, change, download, delete) |
| http://localhost:8080/partner/ | Partner screen |
| http://localhost:8080/employer/ | Employer screen |
| http://localhost:8080/blank.html | The sign-up alone on a page with no other styles |
| http://localhost:8080/docs | API documentation |
| http://localhost:8080/savanna/pages/homepage-v1-paced.html | Inside the real Savanna dashboard |
| http://localhost:8080/savanna/pages/lehulu-signup.html | Sign-up, jobs, profile, partner and employer in Savanna's layout (`lehulu-*.html`) |

## Testing with the co-designer

On their own phone, with their own settings, and with nobody helping:

1. Open `/signup/` and choose a language.
2. On **How do you use your phone?**, choose what they use every day.
3. Finish sign-up, choosing **No document. A partner can vouch for me** for ID.
4. Open **Find jobs**, apply to one job, and choose whether to share support needs.

A screen-reader user uses TalkBack, VoiceOver or NVDA. A Deaf co-designer tests with the sound off; a co-designer
with a motor disability uses their keyboard, switch or voice; a co-designer with low vision uses their own zoom.
Write down, in their words, anything they could not do, and add it to [docs/CONFORMANCE.md](docs/CONFORMANCE.md).

## Install, Level 1: one script tag

```html
<script type="module" src="https://lehulu.com/lehulu.js"></script>
<lehulu-signup lang="am" jobs-url="/jobs" profile-url="/profile"></lehulu-signup>
```

The API is the server `lehulu.js` was loaded from. To use another server add `api="https://lehulu.example.org"`
(or `api-base`). That server must list your site in `ALLOWED_ORIGINS`.

| Element | What it is | Attributes |
|---|---|---|
| `<lehulu-signup>` | Sign-up; also the apply and post-a-job flows | `flow` (`signup` · `apply` · `employer`), `lang` (`am` · `en`), `job-id` (apply), `jobs-url`, `profile-url`, `api`, `focus-on-load` |
| `<lehulu-profile>` | Sign in by SMS code; see, change, download, delete | `lang`, `signup-url`, `api` |
| `<lehulu-jobs>` | Jobs with the private support filter, and apply | `lang`, `signup-url`, `profile-url`, `api` |
| `<lehulu-partner>` | Partner sign-in, confirm learners, register a learner | `lang`, `api` |
| `<lehulu-employer>` | Employer sign-in, post jobs, read applications | `lang`, `api` |
| `<lehulu-applications>` | Applications only (shows sign-in if needed) | `lang`, `api` |

Events (all bubble and cross the shadow root):

| Event | `detail` |
|---|---|
| `lehulu:step` | `{ flow, step, of, id }` |
| `lehulu:signup-complete` | `{ learnerId, idStatus, linkToken }` |
| `lehulu:signed-in` | `{ learnerId, linkToken }` |
| `lehulu:preferences` | `{ language, accessPreferences }`, only when the learner agreed. Never support needs |
| `lehulu:application-sent` | `{ jobId, supportShared }` |
| `lehulu:job-posted` | `{ job }` |
| `lehulu:start-lesson` | `{ learnerId }` |

Make your platform adapt in one line (this is what the Savanna demo does):

```html
<script type="module">
  import { adaptPage } from 'https://lehulu.com/lehulu.js';
  document.addEventListener('lehulu:preferences', (e) => adaptPage(e.detail, { jobsUrl: '/jobs' }));
</script>
```

**Linking accounts.** Send `linkToken` from `lehulu:signup-complete` to your own server, which exchanges it once
(within an hour) at `POST /v1/link` and gets the learner's id, name, phone, language and ID status, plus their
access preferences if they agreed. Create or link your own user with that.

**Theming:** the component reads Bootstrap's `--bs-body-font-family` and `--bs-body-color` when the host has them,
and `--lehulu-accent`, `--lehulu-soft`, `--lehulu-font`, `--lehulu-radius`, `--lehulu-scroll-offset` (height of a
fixed header) for everything else. Styles stay inside the shadow root.

**Iframe** for sites that block scripts:
`<iframe src="https://lehulu.com/embed/?flow=signup&lang=am" title="Lehulu sign-up" allow="microphone" style="width:100%;min-height:640px;border:0"></iframe>`
(`flow` = `signup`, `profile`, `jobs`, `partner`, `employer`).

## Install, Level 2: the API

- Spec: [`openapi.yaml`](openapi.yaml) (regenerate with `cd server && cargo run -- openapi ../openapi.yaml`).
  Live Swagger UI at `/docs`, JSON at `/openapi.json`.
- Errors always look like `{ "error": { "code": "phone_invalid", "message": "Enter 10 digits that start with 09 or 07, for example 0911 234 567.", "field": "phone" } }`.
- Learners use the `token` from sign-up or sign-in; partners and employers use OAuth 2.0 client credentials.
  Create real credentials with `lehulu create-client partner|employer <id> "<name>"`.

```bash
H=http://localhost:8080
# Learner: sign up (returns token and linkToken)
curl -s -X POST $H/v1/learners -H 'Content-Type: application/json' \
  -d '{"name":"Test Learner","phone":"0911234567","language":"am","idType":"later","accessPreferences":["listen"],"supportNeeds":["sr"],"shareWithHost":true}'
# Learner: sign in on another device
curl -s -X POST $H/v1/auth/code   -H 'Content-Type: application/json' -d '{"phone":"0911234567"}'
curl -s -X POST $H/v1/auth/verify -H 'Content-Type: application/json' -d '{"phone":"0911234567","code":"123456"}'
# Learner: own data (T = token)
curl -s $H/v1/me -H "Authorization: Bearer $T"
curl -s -X PATCH $H/v1/learners/$ID -H "Authorization: Bearer $T" -H 'Content-Type: application/json' -d '{"language":"en"}'
curl -s $H/v1/learners/$ID/export -H "Authorization: Bearer $T"
curl -s -X DELETE $H/v1/learners/$ID -H "Authorization: Bearer $T"
# Host server: link the learner to your own account
curl -s -X POST $H/v1/link -H 'Content-Type: application/json' -d '{"linkToken":"..."}'
# Autosave and continue later
curl -s -X POST $H/v1/drafts -H 'Content-Type: application/json' -d '{"flowId":"signup","stepIndex":2,"answers":{"language":"am"}}'
curl -s $H/v1/drafts/CODE
# Jobs (JSON or schema.org JobPosting)
curl -s $H/v1/jobs
curl -s $H/v1/jobs -H 'Accept: application/ld+json'
# Partner or employer token
curl -s -X POST $H/oauth/token -d 'grant_type=client_credentials&client_id=aaapd&client_secret=aaapd-demo'
curl -s $H/v1/partners/aaapd/vouches -H "Authorization: Bearer $P"
curl -s -X POST $H/v1/partners/aaapd/vouches/$ID -H "Authorization: Bearer $P" -H 'Content-Type: application/json' -d '{"decision":"confirm"}'
curl -s -X POST $H/v1/partners/aaapd/registrations -H "Authorization: Bearer $P" -H 'Content-Type: application/json' \
  -d '{"name":"Meron","phone":"0922345678","language":"am","accessPreferences":["sign"],"supportNeeds":["sign"]}'
curl -s -X POST $H/v1/jobs -H "Authorization: Bearer $E" -H 'Content-Type: application/json' -d '{"title":"Data entry clerk","supportOffered":["sr"]}'
curl -s $H/v1/jobs/job-web-dev/applications -H "Authorization: Bearer $E"
# Voice answers
curl -s -X POST $H/v1/media -H 'Content-Type: audio/webm' --data-binary @answer.webm
```

**Webhook.** Set `WEBHOOK_URL` (and `WEBHOOK_SECRET`). The server posts `{ "event", "at", "data" }` for
`learner.created`, `learner.deleted`, `application.created` and `id.decided`, signed in
`X-Lehulu-Signature: sha256=<HMAC-SHA256 of the body>`. The data holds ids and statuses only: never a name, phone
number, recording or support need.

## Install, Level 3: open standards

- **schema.org JobPosting:** `GET /v1/jobs` with `Accept: application/ld+json`.
- **LTI 1.3 (not built).** How it would connect: Lehulu registers as an LTI tool; Moodle or Canvas sends a signed
  OIDC launch to a new `/lti/launch` endpoint; Lehulu checks the platform's signature against its JWKS, maps the
  LTI `sub` to a learner with the same account-linking table used by `/v1/link`, and opens `<lehulu-profile>` or
  `<lehulu-signup>` already signed in. Until then the iframe works in any LMS without single sign-on.

## Languages and how to add one

Amharic and English everywhere: questions and errors in `flows/*.json`, screen words in
`web/src/engine/i18n.ts` and `web/src/engine/screens.ts`. Amharic text is marked `lang="am"` (so screen readers
switch voice) and gets a line height of 1.7. When the learner picks a language, the page around the sign-up
switches too.

To add a language (for example Afaan Oromo, `om`): add an `om` value next to `en`/`am` in each `flows/*.json`
label, copy the `en` blocks in `i18n.ts` and `screens.ts` to `om`, and add `om` to the `Lang` type and to the
server's `language` check (`server/src/routes/learners.rs`). Layout uses `gap` and flex, so right-to-left scripts
need no CSS changes.

## Offline and slow connection

Measured with Chrome's Slow 3G profile (400 kbit/s, high latency), empty cache, against the Docker build:

| Page | First question usable | Transferred |
|---|---|---|
| `/blank.html` (module only) | 8.6 s | 112 KB |
| `/signup/` (sign-up page) | 8.5 s | 116 KB |

`lehulu.js` is about 40 KB compressed (the server sends gzip or brotli). 74 KB is the Noto Sans Ethiopic font, cached
after the first visit. Videos and recordings never load until tapped; in "low data" mode sign clips wait for a tap.

Offline: every answer is kept on the phone as it is given, so a reload or a lost signal loses nothing, and voice
recordings wait on the phone until they can be uploaded. The learner is told in words ("Recording kept on this
phone. It will be sent when you are connected."). The Lehulu pages use a service worker (network first, cached
copy when offline). A sign-up cannot be *submitted* with no connection at all; it is sent when the learner taps
**Create my account** again online.

## Data and privacy

- **Collected:** name (typed or spoken), phone, language, Ethiopian date of birth, how the learner uses their
  phone, support needs (practical supports, never a diagnosis), ID route and optional ID number, applications.
  There is no disability field anywhere.
- **Stored:** SQLite (`data/lehulu.db`) and recordings in `MEDIA_DIR`, on the host's own server. ID numbers are
  encrypted (AES-256-GCM, key in `DATA_KEY` or `KEY_FILE`). Sign-in codes and tokens are stored only as hashes.
- **Who sees what:** the learner sees everything. An employer sees an applicant's name, phone and answer, and
  support needs only if the learner said yes for that job. A partner sees the name and phone of learners who chose
  them. The host platform gets language and access preferences only if the learner agreed, never support needs.
  Every consent is logged.
- **Export and delete:** **My profile → Download my data** (`GET /v1/learners/{id}/export`) and **Delete my account**
  (`DELETE /v1/learners/{id}`), which removes answers, applications, recordings and sessions.
- **Retention:** accounts unused for `RETENTION_DAYS` (default 365) are deleted with everything they hold; unused
  recordings after 2 days; unconfirmed partner registrations after 30 days.
- **No third parties:** no analytics, no cloud speech, no outside services at runtime.
- Test data only: seeded jobs, partners and employers are fictional.

## Cost to run

For 3,000 learners: one small VPS (1 vCPU, 1 GB RAM, 20 GB disk), about **US$5–7 a month**. One Docker container
(~170 MB image), SQLite, no paid services. Recordings are about 50–150 KB each, so under 1 GB for 3,000 learners.
The only variable cost is the SMS gateway (sign-in codes and "continue later" links), billed per message by the
chosen Ethiopian provider. Back up with `lehulu backup data/backup.db` plus the `MEDIA_DIR` folder and the key file.

## Going live

For ALX engineers putting Lehulu on Savanna for real, after the test system:

1. In `.env`: `DEMO_MODE=false`, `ALLOWED_ORIGINS=https://savanna.alxafrica.com` (your site), `PUBLIC_URL` (where
   Lehulu is served), and `DATA_KEY` (`openssl rand -hex 32`).
2. Connect an SMS provider in `server/src/adapters/sms.rs`, so sign-in codes and "continue later" links are texted.
3. Give each partner and employer their own login: `lehulu create-client partner aaapd "AAAPD"` prints an
   organisation ID and password, shown once.
4. Back up `data/` (database, recordings, key) with `lehulu backup`.

With `DEMO_MODE=false` the test accounts stop working, codes are never shown on screen, and `/dev/sms` is gone.

## Configuration

Server environment variables (see [`.env.example`](.env.example)):

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_MODE` | `false` (`true` in Docker Compose) | Test system: one-tap test accounts, codes on screen, `/dev/sms` |
| `ALLOWED_ORIGINS` | empty | Sites allowed to call the API from the browser (comma-separated) |
| `PUBLIC_URL` | `http://localhost:8080` | Used in SMS links |
| `DATA_KEY` / `KEY_FILE` | empty / `data/lehulu.key` | Key that encrypts ID numbers |
| `WEBHOOK_URL` / `WEBHOOK_SECRET` | empty | Host webhook |
| `RETENTION_DAYS` | `365` | Delete unused accounts |
| `SMS_ADAPTER` | `simulator` | Real gateway adapter goes in `server/src/adapters/sms.rs` |
| `BIND`, `DATABASE_URL`, `PUBLIC_DIR`, `FLOWS_DIR`, `SEED_DIR`, `MEDIA_DIR` | see `server/src/config.rs` | Paths |

Server commands: `lehulu serve` (default) · `seed` · `create-client partner|employer <id> [name]` ·
`backup <file>` · `openapi [file]` · `healthcheck`.

**Question audio.** Every question has an audio file in Amharic and English, so **Play question** works on phones
with no Amharic voice: `web/public/audio/<lang>/<flow>/<step>.mp3` (mono, 24 kbit/s, 1.3 MB in all, loaded only
when played), listed in `web/public/media.json`. `python scripts/make-audio.py` makes them with Microsoft's neural
voices (`pip install edge-tts`); replace any file with a person's recording of the same name. Sign clips go in
`web/public/sign/<step>.webm` (see `docs/RECORDING.md`); until they exist, the sign-language way shows a picture for
each question and picture choices.

## Development and tests

Needs Node 22+ with pnpm, and Rust 1.80+ for the server.

```bash
cd web && pnpm install && pnpm exec playwright install chromium
pnpm dev                       # demo mode, data in the browser, http://localhost:5173
cd server && cargo run         # API on :8080 (then: cd web && pnpm dev:api)
```

| What | Command |
|---|---|
| Type check | `cd web && pnpm typecheck` |
| Web unit tests | `cd web && pnpm test` |
| End-to-end + axe, demo mode | `cd web && pnpm exec playwright test` |
| End-to-end + axe against a server | `cd web && BASE_URL=http://localhost:8080 pnpm exec playwright test` (server with `DEMO_MODE=true`) |
| Rust tests | `cd server && cargo test` |
| Rust lint | `cd server && cargo fmt --check && cargo clippy --all-targets -- -D warnings` |
| Against Docker | `docker compose --profile test run --rm test` |

The end-to-end suite does every journey with the keyboard only and runs axe on every screen (fails on any serious
or critical issue), on a desktop and a phone viewport, including inside the real Savanna page and on the blank
page.

```
web/      components (src/components), flow engine (src/engine), data layer (src/data/store.ts), tests
server/   Rust API: routes, auth, domain rules, migrations, seed data
flows/    signup.json, apply.json, employer.json, needs.json (shared by web and server)
scripts/  import-savanna-starter.sh, make-savanna-pages.py, make-audio.py
docs/     ARCHITECTURE.md, FEATURES.md, CONFORMANCE.md, RECORDING.md
```

## Finished and not finished

**Finished:** everything in the walkthrough above, with automated tests (27 Rust, 8 unit, and 12 end-to-end journeys each
run on a desktop and a phone viewport, in demo mode and against the server). Status per feature: [docs/FEATURES.md](docs/FEATURES.md).

**Not finished:**
- Question audio recorded by people (the current files are neural voices) and Ethiopian Sign Language clips.
- A final read of the Amharic by a native speaker on the team or the co-designer.
- The conformance report needs the co-designer's TalkBack and NVDA sessions ([docs/CONFORMANCE.md](docs/CONFORMANCE.md)).
- A real SMS gateway adapter (the simulator is built; production needs a provider's API key).
- Speech-to-text is not used: voice recordings are kept as the answer, which works in Amharic and offline.
- LTI 1.3 (see Level 3).

## Libraries and their licences

Web: lit (BSD-3-Clause), @fontsource/noto-sans-ethiopic (OFL-1.1), icons in the style of Lucide (ISC) and the
sign-language icon from Tabler Icons (MIT). The `web/public/savanna/` pages are ALX's Savanna starter, unchanged
except for the Lehulu script tag and a Lehulu group in the sidebar; the `lehulu-*.html` pages reuse its header and
sidebar. Front page photo: Simien Mountains, Ethiopia, by [A. Davey](https://www.flickr.com/people/40595948@N00),
[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), via Wikimedia Commons. Question audio made with
edge-tts (build-time only, not shipped). Build and test only: Vite, Vitest (MIT),
TypeScript, Playwright (Apache-2.0), @axe-core/playwright (MPL-2.0).
Server: axum, tokio, tower, tower-http, hyper, tracing (MIT); sqlx, serde, serde_json, utoipa, utoipa-swagger-ui
(Swagger UI is Apache-2.0), chrono, uuid, rand, sha2, hmac, aes-gcm, hex, reqwest, rustls, thiserror (MIT or
Apache-2.0); ring (ISC-style).

## Licence

See [LICENSE](LICENSE).
