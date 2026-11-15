# Lehulu: WCAG 2.2 Level AA conformance report

> **How to fill this in:** change every `TO TEST` to one of **Supports**, **Partially supports**, **Does not support** or **Not applicable**, and write what you saw in *Evidence*. Do not mark *Supports* without having tested it: the panel includes a certified accessibility specialist who will check. A truthful *Partially supports* with a known-issue note is better than a false *Supports*.

## 1. Summary

| Item | Value |
|---|---|
| Product | Lehulu (ለሁሉ) sign-up, profile and Career Gateway component, version _[x.y.z]_ |
| Standard | WCAG 2.2 (ISO/IEC 40500:2025), Levels A and AA, 55 success criteria |
| Report date | _[15 November 2026]_ |
| Prepared by | _[names]_, with co-designer _[first name]_ |
| Overall result | _[e.g. 52 Supports · 2 Partially supports · 0 Does not support · 1 Not applicable]_ |
| Automated scan | axe-core _[version]_: _[0 critical, 0 serious]_ on _[n]_ screens |

## 2. Scope

Screens tested (all inside the Savanna starter page at `http://localhost:8080`, Level 1 embed):

1. Sign-up, one screen per question: how you use your phone, language, name, phone, date of birth, ID, ID number / partner, support needs, review
2. Account ready
3. My profile
4. Job list with support filter
5. Job application
6. Partner screen (confirm a learner)
7. Employer form

Each screen was also tested in every access mode the learner can choose: listen, speak, pictures and audio, big and simple, sign language, save data.

Out of scope: the Savanna host page itself (it contains known accessibility defects, kept in the ALX starter on purpose).

## 3. Test environment

| Tool / assistive tech | Version | Browser / device |
|---|---|---|
| NVDA | _[2025.x]_ | Chrome _[x]_ and Firefox _[x]_, Windows _[x]_ |
| TalkBack | _[x]_ | Chrome _[x]_, _[phone model]_, Android _[x]_ |
| Keyboard only | | Chrome, Firefox |
| Zoom 200% and 400% reflow (320 CSS px) | | Chrome desktop |
| Sound off | | Phone muted, tasks completed from text only |
| axe-core (Playwright) | _[x]_ | Headless Chromium, every screen and mode |
| Contrast checker | _[tool]_ | |

## 4. Method

1. Automated: `pnpm run test:a11y` runs axe-core on every screen in every mode. The build fails on any serious or critical issue.
2. Manual: the 5-step routine from the hackathon training (keyboard → NVDA → TalkBack → zoom → axe) on every screen.
3. Co-designer: _[first name]_ completed the main task (see README) unaided on _[device]_ with _[AT]_. Time taken: _[mm:ss]_. Problems found and fixes: see section 7.

## 5. Results by success criterion

Status key: **S** Supports · **PS** Partially supports · **DNS** Does not support · **N/A** Not applicable.

### Principle 1: Perceivable

| SC | Name | Level | Status | Evidence / how Lehulu meets it |
|---|---|---|---|---|
| 1.1.1 | Non-text Content | A | TO TEST | Icons are decorative (`aria-hidden`) and always paired with text. Sign clips have a text label. The Play button has a text name. |
| 1.2.1 | Audio-only and Video-only (Prerecorded) | A | TO TEST | Audio prompts read the on-screen question word for word (the text is the alternative). Sign clips have no audio, and the question text on screen is the alternative. |
| 1.2.2 | Captions (Prerecorded) | A | TO TEST | Expected N/A: no prerecorded video with speech. Sign clips have no audio. If any video with speech is added, it needs captions. |
| 1.2.3 | Audio Description or Media Alternative (Prerecorded) | A | TO TEST | Expected N/A or S: sign clips repeat the visible question, so no visual-only information. |
| 1.2.4 | Captions (Live) | AA | N/A | No live audio or video. |
| 1.2.5 | Audio Description (Prerecorded) | AA | TO TEST | Expected N/A: no information is shown only visually in video. |
| 1.3.1 | Info and Relationships | A | TO TEST | Questions are headings. Fields use `<label>`. Radio and checkbox groups use `<fieldset>`/`<legend>`. Review answers use `<dl>`. Job titles are headings. |
| 1.3.2 | Meaningful Sequence | A | TO TEST | DOM order = visual order (question, hint, input, voice, error, Back/Next). |
| 1.3.3 | Sensory Characteristics | A | TO TEST | No instruction relies on shape, colour, position or sound alone. |
| 1.3.4 | Orientation | AA | TO TEST | Works in portrait and landscape. No orientation lock. |
| 1.3.5 | Identify Input Purpose | AA | TO TEST | `autocomplete="name"`, `tel`, `bday-day` / `bday-month` / `bday-year` _[check]_, `one-time-code` on partner/learner code. |
| 1.4.1 | Use of Color | A | TO TEST | Errors use text and an icon, not red alone. Selected choices have a border and a checked state, not colour alone. |
| 1.4.2 | Audio Control | A | TO TEST | No audio plays automatically _[if a voice-only mode auto-plays, it has a stop/pause control and plays under 3 s or on request]_. |
| 1.4.3 | Contrast (Minimum) | AA | TO TEST | Body text ≥ 4.5:1 and large text ≥ 3:1 in light and dark themes. _[Record the lowest measured ratio.]_ |
| 1.4.4 | Resize Text | AA | TO TEST | 200% browser zoom: no loss of content or function. |
| 1.4.5 | Images of Text | AA | TO TEST | No images of text. Amharic is real text in Noto Sans Ethiopic. |
| 1.4.10 | Reflow | AA | TO TEST | 320 CSS px width (400% zoom): one column, no horizontal scrolling. Date dropdowns wrap. |
| 1.4.11 | Non-text Contrast | AA | TO TEST | Field borders, focus ring and selected-card border ≥ 3:1. |
| 1.4.12 | Text Spacing | AA | TO TEST | Tested with the text-spacing bookmarklet (line height 1.5, letter 0.12em, word 0.16em, paragraph 2em): no clipping, including Ethiopic. |
| 1.4.13 | Content on Hover or Focus | AA | TO TEST | Expected N/A: no tooltips or hover pop-ups. |

### Principle 2: Operable

| SC | Name | Level | Status | Evidence / how Lehulu meets it |
|---|---|---|---|---|
| 2.1.1 | Keyboard | A | TO TEST | Every control is a native `<button>`, `<input>`, `<select>` or `<a>`. Full main task completed by keyboard. |
| 2.1.2 | No Keyboard Trap | A | TO TEST | Focus can always leave the component back to the Savanna page. |
| 2.1.4 | Character Key Shortcuts | A | TO TEST | Expected N/A: no single-key shortcuts. |
| 2.2.1 | Timing Adjustable | A | TO TEST | **No time limits anywhere.** Answers are kept on the phone as they are given, learner sessions do not expire, sign-in codes work for 24 h (partner-registration codes for 7 days), and "continue later" links last until the retention period. Tested by leaving a form idle for _[30]_ min. |
| 2.2.2 | Pause, Stop, Hide | A | TO TEST | No moving, blinking or auto-updating content. The progress bar changes only on user action. |
| 2.3.1 | Three Flashes or Below Threshold | A | TO TEST | Nothing flashes. |
| 2.4.1 | Bypass Blocks | A | TO TEST | Component is a single landmark region with a heading. _[Host page skip link is Savanna’s responsibility.]_ |
| 2.4.2 | Page Titled | A | TO TEST | Standalone pages (`/partner`, `/employer`) have unique titles. When embedded, the host page title applies. |
| 2.4.3 | Focus Order | A | TO TEST | On each new question, focus moves to the question heading. After an error, focus moves to the field. After “Application sent”, focus moves to the confirmation heading. |
| 2.4.4 | Link Purpose (In Context) | A | TO TEST | Job links are the job titles. No “click here”. |
| 2.4.5 | Multiple Ways | AA | TO TEST | Expected N/A for a step-by-step process (WCAG exception for steps in a process). The job list offers filter and list. |
| 2.4.6 | Headings and Labels | AA | TO TEST | Each screen has one heading naming the question. Labels describe the field. |
| 2.4.7 | Focus Visible | AA | TO TEST | 3 px focus outline on every focusable element, in both themes and all modes. |
| 2.4.11 | Focus Not Obscured (Minimum) | AA | TO TEST | Savanna’s fixed curriculum bar: we set `scroll-padding-top` so focused items are never hidden behind it. _[Test inside the starter page.]_ |
| 2.5.1 | Pointer Gestures | A | TO TEST | No multipoint or path gestures. |
| 2.5.2 | Pointer Cancellation | A | TO TEST | Actions fire on click (up event) with native buttons. |
| 2.5.3 | Label in Name | A | TO TEST | Visible text is included in each accessible name (for example the button “Answer by voice” has that exact name). |
| 2.5.4 | Motion Actuation | A | TO TEST | No shake or tilt features. |
| 2.5.7 | Dragging Movements | AA | TO TEST | No drag interactions. The date uses dropdowns, not a slider or picker wheel. |
| 2.5.8 | Target Size (Minimum) | AA | TO TEST | All targets ≥ 44×44 CSS px (above the 24×24 requirement). Big-and-simple mode ≥ 60 px. |

### Principle 3: Understandable

| SC | Name | Level | Status | Evidence / how Lehulu meets it |
|---|---|---|---|---|
| 3.1.1 | Language of Page | A | TO TEST | Standalone pages set `<html lang>`. The component sets `lang` on its root to the learner’s language. |
| 3.1.2 | Language of Parts | AA | TO TEST | Amharic text carries `lang="am"` inside the English Savanna page (`lang="en"`), so NVDA/TalkBack switch voice where an Amharic voice is installed. |
| 3.2.1 | On Focus | A | TO TEST | Focus never triggers navigation or submission. |
| 3.2.2 | On Input | A | TO TEST | Choosing a language re-renders the screen in that language. _[Confirm testers find this expected; the hint says so before the choice.]_ Nothing else changes context on input. |
| 3.2.3 | Consistent Navigation | AA | TO TEST | Back, Next and Continue later are always in the same place. |
| 3.2.4 | Consistent Identification | AA | TO TEST | Same names everywhere (“Next”, “Answer by voice”, “Continue later”). |
| 3.2.6 | Consistent Help | A | TO TEST | “Need help?” _[partner contact / phone number]_ appears in the same place on every screen. _[Add this if not built.]_ |
| 3.3.1 | Error Identification | A | TO TEST | Errors are text, linked with `aria-describedby`, announced via `role="alert"`, and the field gets `aria-invalid`. |
| 3.3.2 | Labels or Instructions | A | TO TEST | Every field has a label and a hint with an example (for example “0911 234 567”). Optional fields say “optional”. |
| 3.3.3 | Error Suggestion | AA | TO TEST | Errors say how to fix (“Enter 10 digits that start with 09 or 07, for example 0911 234 567”). |
| 3.3.4 | Error Prevention (Legal, Financial, Data) | AA | TO TEST | A review screen with Change buttons comes before the account is created and before an application is sent. Learners can edit their profile and delete their account. |
| 3.3.7 | Redundant Entry | A | TO TEST | Name and phone from sign-up are filled into job applications. Support needs pre-fill the job filter. |
| 3.3.8 | Accessible Authentication (Minimum) | AA | TO TEST | No password, CAPTCHA or memory test. Learners sign in with their phone number and a texted code (`autocomplete="one-time-code"`, so Android can fill it; paste allowed; 24 h to use it). Staff client secrets accept paste and password managers (`autocomplete="current-password"`). |

### Principle 4: Robust

| SC | Name | Level | Status | Evidence / how Lehulu meets it |
|---|---|---|---|---|
| 4.1.2 | Name, Role, Value | A | TO TEST | Native HTML controls. Checked the Chrome accessibility tree: every control has a name, role and state. |
| 4.1.3 | Status Messages | AA | TO TEST | “Saved”, “We heard…”, job result counts and “Application sent” use `role="status"` and are announced without moving focus. |

(4.1.1 Parsing is obsolete in WCAG 2.2 and is not listed.)

## 6. Beyond AA (what the hackathon also asks for)

| Item | Status | Notes |
|---|---|---|
| Ethiopian Sign Language (WCAG AAA 1.2.6 in spirit) | _[PS]_ | _[n]_ sign clips recorded by _[interpreter]_ for the sign-up questions |
| Low-literacy path | _[S/PS]_ | Pictures-and-audio mode with recorded Amharic prompts |
| Voice input on every field | _[S]_ | Recording saved as the answer. Speech-to-text optional and editable. |
| Works with sound off | _[S]_ | All audio has on-screen text |

## 7. Known issues and fixes

| # | Issue | SC | Found by | Status |
|---|---|---|---|---|
| 1 | _[e.g. TalkBack read the date dropdown as “unlabelled”]_ | 4.1.2 | Co-designer, 14 Nov | _[Fixed in commit abc123]_ |
| 2 | | | | |

## 8. Co-designer test record

| Task | AT / mode | Completed unaided? | Time | Comments (their words) |
|---|---|---|---|---|
| Sign up with no kebele ID | TalkBack | _[Yes/No]_ | | |
| Apply to a job by voice | TalkBack | | | |
| Sign up | Keyboard only | | | |
| Sign up | 200% zoom | | | |
| Sign up | Sound off | | | |
| Sign up | NVDA | | | |
