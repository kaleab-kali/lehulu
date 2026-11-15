# Lehulu architecture

## 1. The big picture

One core, three doors (as in the hackathon training): a **web component** for any site, a **REST API** for partner apps, and **standard job data** for job platforms. All three share one form engine and one database.

```mermaid
flowchart LR
  subgraph Browser["Learner's phone or laptop"]
    WC["&lt;lehulu-signup&gt; web component<br/>(Lit + TypeScript)"]
    FE["Form engine<br/>renders JSON flows"]
    MODES["Access modes<br/>listen · speak · pictures · big · sign · data"]
    STORE["DataStore interface"]
    LS["LocalStore<br/>(live demo: browser storage)"]
    AS["ApiStore<br/>(Docker: calls /v1)"]
    WC --> FE --> MODES
    FE --> STORE
    STORE --> LS
    STORE --> AS
  end

  subgraph Host["Host page"]
    SAV["Savanna page<br/>one script tag"]
  end
  SAV -- "events: preferences, signup-complete" --> WC

  subgraph Server["Rust server (axum) · one container"]
    API["REST API /v1<br/>OpenAPI at /docs"]
    AUTH["OAuth 2.0 client credentials<br/>(partners, employers)"]
    FLOWS["Flow files<br/>signup · apply · employer"]
    SMS["SMS adapter<br/>(simulator by default)"]
    MEDIA["Voice recordings<br/>on disk"]
    STT["Speech-to-text<br/>(optional, off)"]
    DB[("SQLite")]
    API --> DB
    API --> MEDIA
    API --> SMS
    API -.-> STT
    AUTH --> API
    FLOWS --> API
  end

  AS -- "HTTPS JSON" --> API
  PARTNER["Partner screen<br/>/partner"] --> API
  EMP["Employer screen<br/>/employer"] --> API
  JOBP["Job platforms"] -- "schema.org JobPosting" --> API
```

### Design rules
1. **Native HTML first.** Real `<button>`, `<input>`, `<fieldset>`, `<label>`. ARIA only for live messages and linking errors.
2. **One question per screen**, autosaved after each answer. No timers anywhere.
3. **Flows are data, not code.** Sign-up, job application and employer form are JSON files read by one renderer. A new flow needs no new UI code.
4. **Modes change presentation, never content.** Every mode shows the same questions. Audio and sign clips always have on-screen text, so sound-off still works.
5. **Store needs, never diagnoses.** No disability field exists in the database.
6. **No outside services.** Everything runs offline in one container. SMS and speech-to-text sit behind adapters.

---

## 2. Repository structure

```
lehulu/
├── README.md · LICENSE · Dockerfile · docker-compose.yml · .env.example
├── .github/workflows/
│   ├── ci.yml                 # cargo fmt/clippy/test · typecheck · unit · Playwright + axe · docker build
│   └── pages.yml              # live demo on GitHub Pages, published only if the axe tests pass
├── docs/                      # ARCHITECTURE · FEATURES (tracker) · CONFORMANCE · RECORDING
├── scripts/import-savanna-starter.sh   # puts Lehulu inside the real Savanna starter pages
├── flows/                     # shared by web and server
│   ├── signup.json · apply.json · employer.json
│   └── needs.json             # the shared list of needs (learner ↔ employer) + ways → needs
├── web/
│   ├── index.html             # front page; signup/, jobs/, partner/, employer/, blank.html are the other pages
│   ├── jobs/ · partner/ · employer/ · embed/   # pages for the other screens and the iframe version
│   ├── public/audio/{am,en}/  # recorded prompts <step-id>.opus (by people, see docs/RECORDING.md)
│   ├── public/sign/           # interpreter clips <step-id>.webm
│   ├── src/
│   │   ├── lehulu.ts          # the one script: registers all custom elements
│   │   ├── pages.ts · pages.css   # demo host pages only
│   │   ├── components/
│   │   │   ├── lehulu-signup.ts       # renders ANY flow: signup, apply, employer
│   │   │   ├── lehulu-jobs.ts         # private filter + list + apply
│   │   │   ├── lehulu-partner.ts      # confirm learners without ID
│   │   │   ├── lehulu-applications.ts # what the employer receives
│   │   │   ├── lehulu-profile.ts      # view + delete (edit: F12)
│   │   │   └── styles.ts              # shared, themeable, light/dark
│   │   ├── engine/            # flow.ts · validators.ts · modes.ts · i18n.ts · recorder.ts · fonts.ts · assets.ts · types.ts
│   │   ├── lib/ethiopian-calendar.ts
│   │   └── data/store.ts      # DataStore · ApiStore (Docker) · LocalStore (live demo) · session
│   ├── tests/unit/            # Vitest
│   ├── tests/e2e/             # Playwright: keyboard-only main task + axe on every screen
│   ├── vite.config.ts         # pages build
│   └── vite.lib.config.ts     # lehulu.js for other sites
└── server/
    ├── Cargo.toml · Cargo.lock
    ├── migrations/0001_init.sql
    ├── seed/jobs.json · partners.json
    └── src/
        ├── main.rs            # serve | healthcheck | seed
        ├── config.rs · db.rs · error.rs · openapi.rs
        ├── routes/            # flows · drafts · learners · jobs · applications · partners · dev (SMS page) · tests in mod.rs
        ├── domain/            # validate · ethiopian_calendar · needs
        └── adapters/          # sms (simulator) · stt (stub, off)
```

## 3. Form engine: flow file format

```json
{
  "id": "signup",
  "version": 1,
  "steps": [
    {
      "id": "ways", "type": "checks", "icon": "phone",
      "title": { "am": "ስልክዎን እንዴት ይጠቀማሉ?", "en": "How do you use your phone?" },
      "hint":  { "am": "...", "en": "Choose any. We never ask about your disability." },
      "options": [
        { "value": "listen", "icon": "speaker", "label": { "am": "...", "en": "I listen (screen reader)" } }
      ],
      "audio": "audio/{lang}/ways.opus",
      "sign": "sign/ways.webm"
    },
    {
      "id": "phone", "type": "tel", "autocomplete": "tel",
      "validate": [{ "rule": "et_phone", "message": { "en": "Enter 10 digits that start with 09 or 07, for example 0911 234 567." } }]
    },
    {
      "id": "idnum", "type": "text", "optional": true,
      "when": { "field": "id", "in": ["kebele", "refugee", "other"] }
    }
  ]
}
```

Step types: `text`, `tel`, `choice`, `checks`, `et-date`, `audio-answer`, `review`, `info`.
The server validates with the **same rules** (`et_phone`, `required`, `et_date`), so the web and API never disagree.

Sign-up step ids: `language`, `ways`, `name`, `phone`, `dob`, `idType`, `idNumber` (when kebele/refugee/other), `partner` (when partner), `supportNeeds`, `review`.

---

## 4. Data model (SQLite)

Source of truth: `server/migrations/` (embedded in the binary, run on start). `0002_voice.sql` adds the `media` table (voice recordings, owned by a learner, deleted with them) and `learners.name_audio`.

```sql
-- Lehulu schema. There is deliberately no disability or diagnosis column anywhere.

CREATE TABLE learners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('am', 'en')),
  dob_eth_y INTEGER, dob_eth_m INTEGER, dob_eth_d INTEGER,
  access_preferences TEXT NOT NULL DEFAULT '[]',
  id_type TEXT NOT NULL CHECK (id_type IN ('kebele', 'refugee', 'other', 'partner', 'later')),
  id_number TEXT,                 -- optional; AES-256-GCM encrypted (migration 0003, auth.rs)
  partner_id TEXT REFERENCES partners(id),
  id_status TEXT NOT NULL CHECK (id_status IN ('not_given', 'not_checked', 'waiting_partner', 'confirmed_by_partner')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Separate table so access can be limited to the learner and support roles.
CREATE TABLE support_needs (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  need TEXT NOT NULL,
  PRIMARY KEY (learner_id, need)
);

CREATE TABLE drafts (
  resume_code TEXT PRIMARY KEY,
  flow_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  answers TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  client_id TEXT UNIQUE,
  client_secret_hash TEXT
);

CREATE TABLE vouches (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES partners(id),
  status TEXT NOT NULL CHECK (status IN ('requested', 'confirmed', 'declined')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  PRIMARY KEY (learner_id, partner_id)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  org TEXT NOT NULL,
  city TEXT,
  remote INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE job_support (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  need TEXT NOT NULL,
  PRIMARY KEY (job_id, need)
);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  why_text TEXT,
  why_audio_path TEXT,
  support_shared INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE consent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id TEXT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  at TEXT NOT NULL
);
```

---

## 5. API (v1): as built

| Method | Path | What | Who may call |
|---|---|---|---|
| POST | `/oauth/token` | OAuth 2.0 client credentials → 12-hour bearer token (`scope` = `partner:<id>` or `employer:<id>`) | partner / employer |
| POST | `/v1/auth/code` · `/v1/auth/verify` | Learner sign-in: SMS code (same answer whether or not the number has an account); shared phones get an account chooser | anyone |
| POST · GET | `/v1/auth/signout` · `/v1/me` | End this device's session · the signed-in learner | learner |
| POST | `/v1/link` | Host server exchanges a one-time `linkToken` (1 h) for the learner's identity | host server |
| GET | `/v1/flows/{id}` | A flow JSON (`signup`, `apply`, `employer`, `needs`) | anyone |
| POST | `/v1/drafts` | Start autosave, returns an 8-character `resumeCode`; `sendLinkTo` texts a `?resume=` link (max 3) | anyone |
| PUT / GET | `/v1/drafts/{code}` | Autosave after each question / resume | holder of the code |
| POST | `/v1/learners` | Create account → learner, `token`, `linkToken` | anyone |
| GET / PATCH / DELETE | `/v1/learners/{id}` | Profile, edit, delete (right to erasure) | that learner |
| GET | `/v1/learners/{id}/export` | Everything held: profile, applications, recordings, consent log | that learner |
| GET | `/v1/learners/{id}/preferences` | Language + access preferences only | that learner, if they agreed (`shareWithHost`) |
| GET | `/v1/jobs` | Jobs + support offered; `Accept: application/ld+json` → schema.org JobPosting | anyone |
| POST | `/v1/jobs` | Post a job with support offered | employer |
| GET | `/v1/jobs/{id}/applications` | Applications with phone; support needs only where the learner said yes | the employer that posted the job |
| POST | `/v1/applications` | Apply: `why` text and/or `whyAudio` | learner |
| POST | `/v1/media` | Upload a voice answer (raw `audio/*` body, max 5 MB) → `{ id, url }` | anyone (owned once used, or at once if signed in) |
| GET | `/v1/media/{id}` | Play a recording | the owner; an employer for applications to its jobs; a partner for learners who chose it |
| GET | `/v1/partners` | Partner list | anyone |
| GET | `/v1/partners/{id}/vouches` | Learners waiting for confirmation | that partner |
| POST | `/v1/partners/{id}/vouches/{learnerId}` | `{ "decision": "confirm" \| "decline" }` | that partner |
| POST | `/v1/partners/{id}/registrations` | Register a learner who is present; account made only when they enter the texted code | that partner |
| GET | `/healthz` · `/openapi.json` · `/docs` · `/dev/sms` | Health, spec, Swagger UI, SMS simulator (DEMO_MODE only) | |

**Security as built.** Tokens are 32 random bytes; only their SHA-256 is stored (also for SMS codes, max 5 tries
and 5 codes a day per number). Learner sessions never expire (no time limits) and end on sign-out or deletion.
ID numbers are encrypted with AES-256-GCM. CORS is closed unless `ALLOWED_ORIGINS` lists the host. Responses carry
`X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. Demo secrets (`<id>-demo`) work only while
`DEMO_MODE=true` and are removed at start-up otherwise. A signed webhook (`WEBHOOK_URL`) carries ids and statuses
only. Retention: unused accounts after `RETENTION_DAYS`, unclaimed recordings after 2 days.

Every error: `{ "error": { "code": "...", "message": "plain words + how to fix", "field": "..." } }`

## 6. Key flows

**Sign-up with autosave**
1. The component loads `signup.json` and renders step 1.
2. After each **Next**, the client validates, then `PUT /v1/drafts/{code}` (in demo mode: browser storage).
3. Focus moves to the next question heading, so the screen reader reads “Question 4 of 9. …”.
4. On the review screen, **Create my account** → `POST /v1/learners`. The draft is deleted and the returned
   token is kept on the device as the learner's session.
5. The component fires `lehulu:signup-complete` (with `linkToken`) and, only if the learner said yes to "Can the
   learning site adapt to you?", `lehulu:preferences`. The host can call `adaptPage()` from `lehulu.js`.

**Partner vouch**
1. Learner picks “No document, a partner can vouch for me” + AAAPD → a `vouches` row with status `requested`. `id_status = waiting_partner`. Learning is not blocked.
2. The AAAPD officer opens `/partner` → `GET /v1/partners/aaapd/vouches`.
3. **I know this person** → `POST …/vouches/{id}` → `confirmed_by_partner`. A consent-log entry is written.

**Apply with private support**
1. The job list filters on the phone using the learner’s needs. Needs are not sent to the server for filtering.
2. The application reuses name and phone (WCAG 3.3.7).
3. The learner chooses whether to share. `support_shared` is stored per application.
4. The employer API returns needs only for applications where the learner said yes.

---

## 7. Accessibility architecture

| Concern | Where it lives |
|---|---|
| Focus after each step, error and confirmation | `engine/focus.ts`: one function used by every screen |
| Errors announced | `role="alert"` element linked by `aria-describedby`, field gets `aria-invalid` |
| Saved / result count / “we heard” messages | `role="status"` |
| Amharic inside an English host page | `lang="am"` on the component root or on each Amharic string |
| Modes | `engine/modes.ts` turns ways into flags. Components read flags. No mode removes text. |
| Fixed Savanna top bar (WCAG 2.4.11) | `scroll-margin-top` on focus targets |
| Targets | 44 px minimum, 60 px in “big” mode |
| Regression guard | Playwright runs the main task in every mode and axe on every screen, in CI and before every live-demo publish |

## 8. Privacy (Proclamation No. 1321/2024)
- No disability or diagnosis field. Needs are a fixed list of practical supports.
- ID number optional and encrypted at rest. No document images.
- Support needs leave the server only to an employer the learner chose, per application.
- Consent log for partner actions. `DELETE /v1/learners/{id}` removes everything (cascade).
- No analytics or third-party scripts. Retention set by `RETENTION_DAYS`.

---
