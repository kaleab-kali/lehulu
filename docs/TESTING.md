# Testing Lehulu

How to check Lehulu yourself, for each kind of disability, on the test system that `docker compose up` starts.
Every picture below was taken from that system.

## Before you start

- Open http://localhost:8080 and choose **Sign up**. Use any name and a number such as `0911 234 567`.
- The second question, **How do you use your phone?**, changes every screen after it. Pick what matches the person
  testing, or one at a time to see each.
- The test system shows sign-in codes on screen instead of sending an SMS, and offers one-tap test accounts on the
  partner and employer screens. Everything else behaves as it would for real.
- Not included yet: recorded Amharic question audio, Ethiopian Sign Language videos, and a real SMS company. See
  [What is not finished](#what-is-not-finished).

## By disability

### Blind learners

Choose **I listen (screen reader)**.

| | |
|---|---|
| ![A plain error, read out, with the cursor back on the phone field](screenshots/01-blind-error-read-out.jpg) | **What should happen:** each new question is announced as "Question 4 of 9" followed by the question. A wrong answer is announced in words with an example, and the cursor returns to the field. Extra time for tests is ticked for you on the support question. Nothing depends on colour or on seeing a picture. |

**Test with:** TalkBack (Android: Settings, Accessibility, TalkBack), VoiceOver (iPhone), NVDA (free, Windows) or
Narrator (Windows: Ctrl + Windows + Enter). Swipe right or press Tab to move, double-tap or Enter to choose.

### Low vision

Choose **Big and simple**. Also try the phone's largest text size, browser zoom at 200%, and dark mode.

| | | |
|---|---|---|
| ![Larger text and buttons](screenshots/02-low-vision-big.jpg) | ![Dark mode](screenshots/15-dark-mode.jpg) | ![At 320 pixels wide, as at 400% zoom](screenshots/16-zoom-320px.jpg) |

**What should happen:** larger text and buttons at least 60 pixels tall. At 200% zoom or 320 pixels wide nothing
is cut off and there is no sideways scrolling. Text contrast is at least 4.5:1 in light and dark.

### Learners who cannot type easily, or have a motor disability

Choose **I speak my answers**.

| | |
|---|---|
| ![Answer by voice comes first](screenshots/03-voice-first.jpg) | ![After recording: play, record again, delete](screenshots/04-voice-recorded.jpg) |

**What should happen:** a large **Answer by voice** button comes first. The recording is the answer; nothing must
be typed. The learner can play it back, record again or delete it. There are no time limits and nothing needs
dragging. Every control is at least 44 pixels.

**Test with:** the keyboard only (Tab, Shift+Tab, Enter, Space, arrow keys), or Android Switch Access.

![Keyboard focus is always visible](screenshots/14-keyboard-focus.jpg)

### Learners who read little or not at all

Choose **Pictures and audio, few words**.

![Choices as large picture tiles](screenshots/05-low-literacy-pictures.jpg)

**What should happen:** choices become large picture tiles with a few words each, and **Play question** reads the
question aloud. The name can be given by voice.

**Today:** until the Amharic prompts are recorded, Play question uses the phone's own voice. Most Android phones
have an English voice and few have an Amharic one, so in Amharic the button may not appear.

### Deaf learners

Choose **Sign language**.

![Every question is written text; nothing needs sound](screenshots/06-deaf-text-first.jpg)

**What should happen:** every question, answer and message is written; nothing needs sound. Interpreter and
captions are offered on the support question and shown to employers when the learner shares them.

**Today:** the sign language videos for each question are not recorded yet, so this screen looks the same as the
default. They must be recorded by an Ethiopian Sign Language interpreter (see `RECORDING.md`); they appear by
themselves once listed in `web/public/media.json`.

### Little mobile data, or a weak signal

Choose **Save my data**.

**What should happen:** videos load only when tapped. A first visit is about 110 KB. Every answer is kept on the
phone as it is given, so closing the page or losing signal loses nothing. After the first visit the pages also open
offline.

**Test with:** load the sign-up page, then turn on airplane mode and reload.

### Amharic

Choose **አማርኛ** on the first question.

![The sign-up in Amharic with pictures and voice](screenshots/07-amharic.jpg)

**What should happen:** every screen is in Amharic, including errors, the profile, and the partner and employer
screens. The Ethiopian calendar is used for the date of birth.

## By situation

| Situation | What to do | Picture |
|---|---|---|
| No ID document | Choose **No document. A partner can vouch for me**, then AAAPD. Sign-up still finishes. | ![The ID question with No document chosen](screenshots/08-no-id-document.jpg) |
| Support, or none | Supports are ticked from the first answer. **Prefer not to say** is as easy as any other choice. | ![Support question with Prefer not to say](screenshots/09-support-prefer-not-to-say.jpg) |
| Checking answers | Every answer has **Change**. | ![Review screen with a Change button on each answer](screenshots/10-review-change-anything.jpg) |
| Account ready | The ID status is shown, and that the site now adapts (if the learner said yes). | ![Account ready, ID waiting for the partner, site adapts](screenshots/11-done-site-adapts.jpg) |
| Jobs | Jobs offering the support you need come first. The filter stays on the phone. | ![Jobs sorted by the support the learner needs](screenshots/12-jobs-sorted-by-support.jpg) |
| Another or shared phone | **My profile**, enter the phone number, then the code. A shared phone lists its accounts. | ![Sign-in with phone number and code](screenshots/13-sign-in-with-code.jpg) |
| Partner | **Continue as AAAPD**, then confirm a learner, or register one who is with you. | ![Partner screen with requests and the registration form](screenshots/18-partner-confirms.jpg) |
| Employer | **Continue as Afro Connect**, post a job, read applications. | ![Employer screen with job form and applications](screenshots/19-employer.jpg) |
| Another website | `blank.html` has the module alone, with no host styles. | ![Lehulu alone on an empty page](screenshots/20-blank-page.jpg) |
| Inside Savanna | After `bash scripts/import-savanna-starter.sh`: the real Savanna page. | ![Lehulu inside the Savanna dashboard](screenshots/21-inside-savanna.jpg) |

## Testing inside Savanna

1. `bash scripts/import-savanna-starter.sh` copies the ALX starter pages and adds Lehulu with one script tag.
2. `docker compose up --build`, then open http://localhost:8080/savanna/pages/homepage-v1-paced.html.
3. Sign up and say yes to **Can the learning site adapt to you?** Savanna then enlarges its text, says what
   changed, and adds Jobs to its sidebar.

If something looks wrong only inside Savanna, check it on `blank.html` too. If it works there, the cause is the
host page's own styles or scripts.

## Testing with the co-designer

The hackathon's pass/fail check is that the co-designer finishes the main task alone, on their own phone, with
their own settings. Use whatever they use every day:

| The co-designer… | They test with | Watch for |
|---|---|---|
| uses a screen reader | TalkBack, VoiceOver, or NVDA | Every question announced; errors heard; nothing skipped |
| is blind and uses no screen reader | Not realistic alone: offer TalkBack, or have them use **I speak my answers** with someone reading the screen, and note it | Whether voice answers alone get them through |
| has low vision | Their own zoom and text size, **Big and simple** | Nothing cut off; can find the Next button |
| is Deaf | Sound off, **Sign language** | Every step understood from text; whether written Amharic is enough without videos |
| has a motor disability | Their switch, keyboard, or voice; **I speak my answers** | Every control reachable; no precise tapping needed |
| reads little | **Pictures and audio, few words**, sound on | Whether the pictures and read-aloud are enough |

Write down, in their words, anything they could not do. That goes into `CONFORMANCE.md`.

## Automated tests

`cd web && pnpm exec playwright test` runs every journey above with the keyboard only and checks every screen with
axe (fails on any serious or critical issue), on a desktop and a phone screen. `cd server && cargo test` checks
the API, including who may see what.

## What is not finished

- Recorded Amharic question audio, and Ethiopian Sign Language videos (people must record them).
- A connection to a real SMS company (the test system shows codes on screen).
- Review of the Amharic text by a native speaker.
- Speech-to-text: spoken answers are kept as recordings rather than turned into text.
