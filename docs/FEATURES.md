# Lehulu features: build tracker

Status: **Done** (built and covered by automated tests) · **Partly** · **Not started**. "Needs a person" marks work code cannot do: recordings, reviews, user testing.
"Done" means: works by keyboard, passes axe in `pnpm exec playwright test`, and has a test. **A person still checks every
screen with TalkBack and NVDA** before CONFORMANCE.md says "Supports".

The Track 1 requirement each feature serves is in brackets.

| # | Feature | Status | What is built | What is left |
|---|---|---|---|---|
| F0 | Repo, CI, GitHub Pages, Savanna host page | Done | `ci.yml`, `pages.yml`, demo host page, `scripts/import-savanna-starter.sh` (inserts Lehulu below Savanna's course bar, Savanna red, light theme) | Turn on Pages in repo settings |
| F1 | Flow files + shared needs list | Done | `flows/*.json` (en + am) | Needs a person: native speaker checks Amharic |
| F2 | Question screen, errors, focus [clear labels, plain errors, one question per screen] | Done | `lehulu-signup.ts` | Needs a person: TalkBack/NVDA pass |
| F3 | Choice, checks, Ethiopian date, review with Change | Done | Same component; calendar tested against the site's test vector | |
| F4 | Autosave + continue later [no time limits, save & resume] | Done | Copy kept on the phone after every answer (survives reload and lost signal; never the ID number); draft on the server after every question; "Continue later" SMS with a `?resume=CODE` link (max 3 texts per draft); 8-character codes | |
| F5 | Server skeleton, SQLite, migrations, Docker | Done | axum + sqlx, `healthcheck`, Dockerfile, compose | Run `docker compose up --build` once on a laptop |
| F6 | Learners + drafts API, OpenAPI | Done | `/v1/learners`, `/v1/drafts`, Swagger at `/docs` | |
| F7 | Access modes [low-literacy path, works for everyone] | Partly | Flags: voice-first, picture tiles, big, play prompt, sign clips, data saver | Big number keypad for phone in "big"/"speak"; voice-only mode (stretch) |
| F8 | Voice answers [voice input on every field, review and edit] | Done | Record/stop on every text field; recording counts as the answer; uploaded as soon as it stops (`POST /v1/media`), kept on the phone if offline and sent before the answers; play back, record again, delete; Play button on the review screen; employer hears the answer and the spoken name, partner hears the spoken name; deleted with the account | Needs a person: TalkBack/NVDA check of the voice controls; speech-to-text stays a stretch goal (S1) |
| F9 | Pictures mode + recorded prompts [low-literacy path] | Partly | "Play question" plays `audio/<lang>/<step>.opus` when listed in `public/media.json`, otherwise the phone's own voice; the button is hidden when neither exists (no placeholder text) | Needs a person: Record prompts, Amharic first (phones rarely have an Amharic voice) |
| F10 | ID routes + partner vouch [other ID routes, partner referral] | Done | Kebele/Fayda, refugee, other, partner, skip; partner screen confirms/declines; consent log | |
| F11 | Support needs pre-ticked [private support request, no proof] | Done | From first answer via `needs.json` `fromWays`; captions added; "Prefer not to say" is an ordinary choice that clears the others | |
| F12 | Profile: sign in, view, change, export, delete [profile] | Done | Phone + SMS code sign-in (no password), account chooser for shared phones; "Change" per answer; "Download my data" (`GET /v1/learners/{id}/export`); sign out; delete with a confirmation step | |
| F13 | Jobs API, JSON-LD, employer form, auth [employer accommodations form, Level 3] | Done | OAuth 2.0 client credentials (`/oauth/token`) for partners and employers; employers see only their own jobs' applications; learner tokens; recordings playable only by the owner or an employer/partner they chose; CORS limited by `ALLOWED_ORIGINS`; security headers | |
| F14 | Job list with private filter [private "support I need" filter] | Done | Filter on device, ranked by needs met, count announced, titles are headings | |
| F15 | Apply flow + share choice + employer view [application flow with voice] | Done | Reuses engine; share yes/no; employer sees needs only if shared; answer by voice and the employer plays it | |
| F16 | Sign language mode | Partly | Plays `sign/<step>.webm` when listed in `public/media.json`; nothing shown otherwise; text always shown; lazy in data-saver | Needs a person: Record clips with the interpreter |
| F17 | Amharic interface | Partly | Every screen bilingual, including sign-in, profile, partner and employer (`src/engine/screens.ts`); Amharic line height 1.7 | Needs a person: a final read by a native speaker |
| F18 | Partner registers learner with consent [bonus features] | Done | `POST /v1/partners/{id}/registrations`; nothing is saved until the learner signs in with the texted code; ID starts "confirmed by partner"; simulator at `/dev/sms` (DEMO_MODE only) | |
| F19 | Host adapts to preferences, with consent | Done | Sign-up asks "Can the learning site adapt to you?"; `lehulu:preferences` only on yes; `adaptPage()` exported for hosts; Savanna demo enlarges text, shows what changed, adds Jobs to its sidebar; `/v1/link` account linking | |
| F24 | Level 2 extras | Done | `openapi.yaml` at the repo root (`lehulu openapi`); signed webhook (`WEBHOOK_URL`, HMAC-SHA256) with ids and statuses only; gzip/brotli | |
| F25 | Privacy enforcement | Done | ID numbers encrypted (AES-256-GCM); tokens and codes stored hashed; retention job (`RETENTION_DAYS`); demo secrets stop working outside DEMO_MODE; `lehulu backup` | |
| F20 | Automated accessibility gate | Done | Playwright keyboard-only main task + axe on every screen, desktop + phone, 320 px reflow; Lehulu inside the real Savanna page (keyboard only, axe, focused heading clear of Savanna's fixed bars) | Add a test for every new screen |
| F21 | README, conformance, pitch deck, cold install | Partly | README in the hackathon outline, ARCHITECTURE, CONFORMANCE template, `blank.html` install proof, measured Slow 3G numbers | Needs a person: Fill CONFORMANCE from real tests; pitch deck; cold install by a non-builder |
| F22 | Iframe embed for LMSs and portals that block scripts | Done | `/embed/?flow=signup\|profile\|jobs\|partner\|employer&lang=am` | |
| F23 | Offline [Built for Ethiopia, 3G] | Done | Service worker (network first, cached fallback) on the Lehulu pages; answers kept on the phone and sent when back online; recordings kept until they can be uploaded | Background sync of a finished sign-up made fully offline |
| S1 | Stretch: speech-to-text (whisper-rs) | Not started | `adapters/stt.rs` stub, off by default | Only after everything above |
| S2 | Stretch: LTI 1.3 launch | Not started | | Only after everything above |

## Human test checklist (do at every co-designer session)
- [ ] TalkBack (Android, Chrome): complete the main task in README unaided
- [ ] NVDA (Windows, Chrome or Firefox): same
- [ ] Keyboard only: same, focus always visible
- [ ] 200% zoom and 400% (320 px) reflow: nothing cut off
- [ ] Sound off: every step understandable from text
- [ ] Inside a real Savanna page (`/savanna/`): focused items not hidden under Savanna's fixed top bar (WCAG 2.4.11)
- [ ] Amharic screens read with an Amharic voice where installed
