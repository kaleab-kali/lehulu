# Lehulu (ለሁሉ) — accessible sign-up, profile and job applications for Savanna

> Digital Bridge Accessibility Hackathon 2026 · **Track 1: Accessible onboarding** (registration, profile and Career Gateway)
>
> Team: _[team name]_ · Members: _[names]_ · Co-designer: _[first name, with consent]_ · Sign language: _[interpreter, with consent]_

Lehulu is a drop-in sign-up and profile component. After choosing a language, the learner is asked **how they use their phone** (listen with a screen reader, speak, pictures and audio, big and simple, sign language, save data), never what their disability is. The rest of the sign-up adapts to that answer, and the same answer sets up the private job filter and the support request an employer receives.

- **Live demo (phone friendly, nothing to install):** _[https://<github-user>.github.io/<repo>/]_
- **Conformance report:** [docs/CONFORMANCE.md](docs/CONFORMANCE.md) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Feature status:** [docs/FEATURES.md](docs/FEATURES.md)

---

## For testers: the main task (5–10 minutes)

The hackathon site does not define Track 1's main task, so this is the task we ask testers to complete **unaided**:

1. Open the demo. Choose a language, then choose how you use your phone (for example “I listen”).
2. Sign up **without a kebele ID**: at the ID question choose **“No document. A partner can vouch for me”** and pick a partner.
3. Check the support that was pre-ticked for you (for example “Screen-reader-friendly tests”). No proof is asked for.
4. Check your answers and create your account.
5. Open **Find jobs**. Jobs offering your support come first. Open one and **apply** by typing or by voice.
6. Choose whether to share your support needs with that employer.

**Done when** the screen says “Application sent”, and you never had to type the same thing twice, show an ID or race a timer.

Optional:
- Leave halfway with **Continue later**, then reload the page: your answers come back.
- Open the **Partner** page and confirm the learner (the ID status changes to “confirmed by your partner”).
- Open the **Employer** page, post a job with the support it offers, and see applications received.

| Condition we test | How |
|---|---|
| TalkBack + Chrome (Android) | Swipe right through each screen, double-tap to activate |
| NVDA + Chrome or Firefox (Windows) | Tab, H (headings), F (form fields) |
| Keyboard only | Tab, Shift+Tab, Space, Enter, arrow keys inside radio groups |
| 200% zoom and 400% reflow | Browser zoom; at 320 px wide there is no sideways scrolling |
| Sound off | Every audio prompt and sign video has the same text on screen |

---

## Two ways to run it

| | **Live demo** | **Docker Compose** |
|---|---|---|
| For | Co-designers and anyone on a phone | Judges and tech teams |
| How | Open the link above | `docker compose up --build` |
| What runs | The web component in **demo mode** | Web component + Rust API + SQLite |
| Where data goes | Only **your browser** (a note on screen says so) | SQLite database in a Docker volume |
| API docs | — | http://localhost:8080/docs |

Both run the **same component code**. Only the data layer differs (`web/src/data/store.ts`: `LocalStore` or `ApiStore`), chosen at build time with `VITE_DATA_MODE`.

## Install in under an hour (judges)

Requirements: Docker 24+ with Compose v2, about 2 GB disk. **No API keys. No internet needed after the first build.**

```bash
git clone _[repo url]_ lehulu && cd lehulu
docker compose up --build        # first build about 5–10 minutes
```

| URL | What it is |
|---|---|
| http://localhost:8080/ | Demo host page with Lehulu added by one tag (Level 1) |
| http://localhost:8080/jobs/ | Job list with the private support filter, and My profile |
| http://localhost:8080/partner/ | Partner screen (for example AAAPD) to confirm learners without ID |
| http://localhost:8080/employer/ | Employer form (job + support offered) and applications received |
| http://localhost:8080/embed/?flow=signup&lang=am | Iframe version for platforms that block scripts |
| http://localhost:8080/docs | Interactive API docs (Level 2, OpenAPI) · spec at `/openapi.json` |
| http://localhost:8080/dev/sms | SMS simulator: “continue later” messages |
| http://localhost:8080/savanna/ | Real Savanna starter pages with Lehulu inside (after `scripts/import-savanna-starter.sh`) |

Seed data: 4 jobs and 4 partners (AAAPD, Tomorrow is Better, a refugee agency, a school).

```bash
docker compose --profile test run --rm test   # Playwright + axe against the running stack
docker compose down -v                        # stop and delete all data
```

**Testing on a phone against a laptop:** the microphone only works on `localhost` or HTTPS. Use the live demo, or connect the phone by USB, open `chrome://inspect` on the laptop, forward port `8080`, then open `localhost:8080` on the phone.

| Problem | Fix |
|---|---|
| Port 8080 in use | `PORT=8090 docker compose up` |
| Mic button says the microphone is not available | You opened an `http://192.168…` address: use the live demo or port forwarding |

### Without Docker (developers)
```bash
cd server && cargo run                                  # API on :8080 (needs Rust 1.80+)
cd web && pnpm install && pnpm dev:api                  # UI on :5173, API calls forwarded to :8080
# or, with no server at all:
cd web && pnpm dev
```

### Live demo deployment
GitHub Pages: repo **Settings → Pages → Source: GitHub Actions**, then push to `main` (`.github/workflows/pages.yml` runs the accessibility tests first and refuses to publish if they fail).
Vercel instead: root directory `web`, install command `pnpm install`, build command `pnpm run build:demo`, output `dist`.

---

## Adding Lehulu to another platform

| Way | For | Code |
|---|---|---|
| **Script tag** (Level 1) | Savanna, WordPress, any page you control | see below |
| **Iframe** | LMSs and job portals that block scripts (Moodle, Canvas, most portals) | `<iframe src="https://HOST/embed/?flow=signup&lang=am" title="Lehulu sign-up" allow="microphone" style="width:100%;min-height:640px;border:0"></iframe>` |
| **REST API** (Level 2) | Platforms with their own app or Telegram bot | `GET /v1/flows/signup` gives the questions; `POST /v1/learners` saves |
| **schema.org JobPosting** (Level 3) | Job boards importing job feeds | `GET /v1/jobs` with `Accept: application/ld+json` |

```html
<script type="module" src="https://YOUR-LEHULU-HOST/lehulu.js"></script>
<lehulu-signup lang="am" jobs-url="/jobs"></lehulu-signup>
```

| Element | Attributes |
|---|---|
| `<lehulu-signup>` | `flow` = `signup` (default) · `apply` · `employer`; `lang` = `am` · `en`; `job-id` (with `apply`); `jobs-url`; `profile-url` |
| `<lehulu-jobs>` | `lang` |
| `<lehulu-profile>`, `<lehulu-partner>`, `<lehulu-applications>` | — |

Events (bubble out of the component):
| Event | `detail` |
|---|---|
| `lehulu:signup-complete` | `{ learnerId, idStatus }` |
| `lehulu:preferences` | `{ language, accessPreferences }`, so the host can adapt (the demo page enlarges text for “big”) |
| `lehulu:application-sent` | `{ jobId, supportShared }` |
| `lehulu:job-posted` | `{ job }` |
| `lehulu:start-lesson` | `{ learnerId }` |

Theming: CSS custom properties `--lehulu-accent`, `--lehulu-soft`, `--lehulu-font`, `--lehulu-radius`, `--lehulu-scroll-offset` (height of a fixed header); `theme="light"` or `theme="dark"` on any element to stop it following the device (Savanna uses `theme="light"`). Styles are isolated in shadow DOM. `lehulu.js` is about 25 KB gzipped; fonts load separately.

API errors always look like this:
```json
{ "error": { "code": "phone_invalid", "message": "Enter 10 digits that start with 09 or 07, for example 0911 234 567.", "field": "phone" } }
```

---

## Keyboard and screen reader support

| Element | Keyboard | What a screen reader says (example) |
|---|---|---|
| New question | Focus moves to the question heading | “Question 4 of 10. What is your phone number?, heading” |
| Text field | Tab | “What is your phone number?, edit text. Example: 0911 234 567” |
| Radio group (language, ID) | Arrow keys move, Space selects | “Refugee ID, radio button, 2 of 5” |
| Checkbox group (support) | Tab between, Space toggles | “Extra time for tests, checkbox, checked” |
| Error | Focus returns to the field | “Enter 10 digits that start with 09 or 07, for example 0911 234 567” |
| Voice answer | Enter or Space on “Answer by voice”, again to stop | “Recording saved (4 seconds). It counts as your answer.” |
| Job results | H jumps between job titles | “3 jobs offer all the support you need.” |

ARIA is used only where HTML has no native equivalent: `role="alert"` for errors, `role="status"` for saved, recording and result messages, `aria-describedby` to link hints and errors, `aria-invalid` on fields with errors. Amharic text carries `lang="am"`.

## Built for Ethiopia
- Amharic and English throughout the sign-up, with Noto Sans Ethiopic bundled (Savanna loads no Ethiopic font)
- Ethiopian calendar date of birth: three dropdowns, Pagume handled, the Gregorian date shown. Test: ኅዳር 5, 2019 = 14 Nov 2026
- Ethiopian phone formats (09…, 07…, +251…)
- Small download for 3G: `lehulu.js` about 25 KB gzipped
- Recorded human Amharic audio prompts and human interpreter sign clips (no text-to-speech or avatar service)

## Voice input: what is real
- Every text question has a voice button. **The recording itself counts as the answer**, so voice works offline with no outside service.
- Phone numbers: use the phone keyboard's own microphone or the number pad.
- Speech-to-text is not built (Amharic accuracy is limited); it is an optional stretch goal and would always be editable.

## Privacy (Proclamation No. 1321/2024)
- Stored: name, phone, date of birth, language, how the learner uses their phone, support needs, ID **type** and optional number, partner confirmation.
- Never stored: disability or diagnosis (there is no such field), medical documents, ID photos.
- Support needs go to an employer **only** when the learner says yes for that job.
- Consent log for sign-up, partner decisions and applications. Learners can delete their account.
- No analytics or third-party scripts.

## Tests
```bash
cd server && cargo test                 # API, validation, Ethiopian calendar
cd web && pnpm test                      # flow engine, calendar, phone rules
cd web && pnpm exec playwright test           # keyboard-only main task + axe on every screen, desktop and phone
```
Latest result: _[date]_ — axe: 0 critical, 0 serious on _[n]_ screens.

## Co-design
| What our co-designer found (their words) | What we changed |
|---|---|
| _[e.g. “TalkBack said ‘button’ and nothing else”]_ | _[Named every button]_ |

## Known limitations
See [docs/FEATURES.md](docs/FEATURES.md). _[Update before submitting, for example: sign clips cover the sign-up questions only; voice recordings are not uploaded yet; partner/employer sign-in is not built.]_

## Licence
_[Licence named by ALX at kick-off]_ — see [LICENSE](LICENSE).
