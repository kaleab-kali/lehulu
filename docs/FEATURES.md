# Lehulu features — build tracker

Status: ✅ done (automated tests pass) · 🟡 partial · ⬜ to do · 👤 needs a person (cannot be done by code or AI).
"Done" means: works by keyboard, passes axe in `pnpm exec playwright test`, and has a test. **A human still checks every
screen with TalkBack and NVDA** before CONFORMANCE.md says "Supports".

Track 1 requirement each feature serves is in brackets. Owners: A server · B web component · C content and co-designer · D tests, docs, deploy.

| # | Feature | Owner | Status | What is built | What is left |
|---|---|---|---|---|---|
| F0 | Repo, CI, GitHub Pages, Savanna host page | D | ✅ | `ci.yml`, `pages.yml`, demo host page, `scripts/import-savanna-starter.sh` (inserts Lehulu below Savanna's course bar, Savanna red, light theme) | Turn on Pages in repo settings |
| F1 | Flow files + shared needs list | A+B | ✅ | `flows/*.json` (en + am) | 👤 native speaker checks Amharic |
| F2 | Question screen, errors, focus [clear labels, plain errors, one question per screen] | B | ✅ | `lehulu-signup.ts` | 👤 TalkBack/NVDA pass |
| F3 | Choice, checks, Ethiopian date, review with Change | B | ✅ | Same component; calendar tested against the site's test vector | — |
| F4 | Autosave + continue later [no time limits, save & resume] | B | ✅ | Draft after every question; "Continue later" code; SMS via simulator in API mode | Resume from an SMS link (`?resume=CODE`) |
| F5 | Server skeleton, SQLite, migrations, Docker | A | ✅ | axum + sqlx, `healthcheck`, Dockerfile, compose | Run `docker compose up --build` once on a laptop |
| F6 | Learners + drafts API, OpenAPI | A | ✅ | `/v1/learners`, `/v1/drafts`, Swagger at `/docs` | — |
| F7 | Access modes [low-literacy path, works for everyone] | B | 🟡 | Flags: voice-first, picture tiles, big, play prompt, sign clips, data saver | Big number keypad for phone in "big"/"speak"; voice-only mode (stretch) |
| F8 | Voice answers [voice input on every field, review and edit] | B+A | 🟡 | Record/stop on every text field; recording counts as the answer | Upload recordings (multipart `POST /v1/applications`, learner name audio); play back for review |
| F9 | Pictures mode + recorded prompts [low-literacy path] | C | 🟡 | UI ready; plays `audio/<lang>/<step>.opus` | 👤 Record prompts (see docs/RECORDING.md) |
| F10 | ID routes + partner vouch [other ID routes, partner referral] | A+C | ✅ | Kebele/Fayda, refugee, other, partner, skip; partner screen confirms/declines; consent log | — |
| F11 | Support needs pre-ticked [private support request, no proof] | B | ✅ | From first answer via `needs.json` `fromWays` | — |
| F12 | Profile: view, edit, delete [profile] | B+A | 🟡 | View + delete; `PATCH /v1/learners/{id}` exists | "Change" per answer in `<lehulu-profile>`; real session instead of localStorage id |
| F13 | Jobs API, JSON-LD, employer form, auth [employer accommodations form, Level 3] | A | 🟡 | Jobs + support offered; `Accept: application/ld+json`; employer flow posts jobs | OAuth 2.0 client credentials for partners/employers (`/oauth/token`, JWT); restrict CORS |
| F14 | Job list with private filter [private "support I need" filter] | B | ✅ | Filter on device, ranked by needs met, count announced, titles are headings | — |
| F15 | Apply flow + share choice + employer view [application flow with voice] | B+A | ✅ | Reuses engine; share yes/no; employer sees needs only if shared | Voice upload (F8) |
| F16 | Sign language mode | C | 🟡 | Plays `sign/<step>.webm`; text always shown; lazy in data-saver | 👤 Record clips with the interpreter |
| F17 | Amharic interface | C | 🟡 | All flow screens bilingual; `lang` set | Partner/employer/profile screens are English only; 👤 Amharic review |
| F18 | SMS simulator, partner registers learner with consent [bonus features] | A | 🟡 | Simulator at `/dev/sms`; continue-later SMS | `POST /v1/partners/{id}/registrations` + learner code confirmation screen |
| F19 | Host adapts to preferences | B | ✅ | `lehulu:preferences` event; demo host enlarges text | Consent before `GET /v1/learners/{id}/preferences` |
| F20 | Automated accessibility gate | D | ✅ | Playwright keyboard-only main task + axe on every screen, desktop + phone, 320 px reflow; Lehulu inside the real Savanna page (keyboard only, axe, focused heading clear of Savanna's fixed bars) | Add a test for every new screen |
| F21 | README, conformance, pitch deck, cold install | D | 🟡 | README, ARCHITECTURE, CONFORMANCE template | 👤 Fill CONFORMANCE from real tests; pitch deck; cold install by a non-builder; encrypt ID number; retention job |
| F22 | Iframe embed for LMSs and portals that block scripts | B | ✅ | `/embed/?flow=signup&lang=am` | — |
| F23 | Offline queue (service worker) [Built for Ethiopia, 3G] | B | ⬜ | — | Cache app shell; queue answers offline; send when back online |
| S1 | Stretch: speech-to-text (whisper-rs) | A | ⬜ | `adapters/stt.rs` stub, off by default | Only after everything above |
| S2 | Stretch: LTI 1.3 launch | A | ⬜ | — | Only after everything above |

## Human test checklist (do at every co-designer session)
- [ ] TalkBack (Android, Chrome): complete the main task in README unaided
- [ ] NVDA (Windows, Chrome or Firefox): same
- [ ] Keyboard only: same, focus always visible
- [ ] 200% zoom and 400% (320 px) reflow: nothing cut off
- [ ] Sound off: every step understandable from text
- [ ] Inside a real Savanna page (`/savanna/`): focused items not hidden under Savanna's fixed top bar (WCAG 2.4.11)
- [ ] Amharic screens read with an Amharic voice where installed
