// The main task, done with the keyboard only, with an axe scan on every screen.
// Fails on any serious or critical issue (the hackathon's pass/fail rule).

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function noSeriousIssues(page: Page, where: string) {
  // The cast bridges @axe-core/playwright's own Playwright types and @playwright/test.
  const r = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help}`), `axe on ${where}`).toEqual([]);
}

const flow = (page: Page) => page.locator('lehulu-signup');
const next = (page: Page) => flow(page).getByRole('button', { name: /^(Next|Create my account|Save)/ }).click();

/** Sign in with an organisation ID and the test password (`<id>-demo`), as a real partner or employer would. */
async function staffSignIn(page: Page, id: string, password = `${id}-demo`) {
  const form = page.locator('lehulu-staff-sign-in');
  if (!(await form.getByLabel('Organisation ID').isVisible())) await form.getByText('Sign in with an organisation ID instead').click();
  await form.getByLabel('Organisation ID').fill(id);
  await form.getByLabel('Password').fill(password);
  await form.getByLabel('Password').press('Enter');
}
/** The one-tap test account a visitor sees first. */
const partnerSignIn = (page: Page) => page.locator('lehulu-staff-sign-in').getByRole('button', { name: 'Continue as AAAPD' }).click();

// Seeded jobs and the employer that posted each (server/seed/jobs.json).
const EMPLOYER_OF: Record<string, string> = {
  'Customer support agent (Amharic)': 'afro-connect',
  'Junior web developer': 'lideta-tech',
  'Warehouse records assistant': 'merkato-supply',
  'Social media assistant': 'bole-media',
};

test.beforeEach(async ({ page }) => {
  await page.goto('signup/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('@a11y sign up with no kebele ID, partner vouches, apply to a job', async ({ page }) => {
  const f = flow(page);

  // 1. Language
  await expect(f.getByRole('heading', { name: 'Which language?' })).toBeVisible();
  await noSeriousIssues(page, 'language');
  await f.getByRole('radio', { name: 'English' }).check();
  await next(page);

  // 2. How do you use your phone? (focus moves to the new heading)
  await expect(f.getByRole('heading', { name: 'How do you use your phone?' })).toBeFocused();
  await f.getByRole('checkbox', { name: /I listen/ }).check();
  await noSeriousIssues(page, 'ways');
  await next(page);

  // 3. Name
  // Unique per run: against a shared server (BASE_URL), other runs' learners are in the same lists.
  const learnerName = `Hanna Tesfaye ${test.info().project.name} ${Date.now() % 1_000_000}`;
  await f.getByRole('textbox', { name: 'What is your name?' }).fill(learnerName);
  await next(page);

  // 4. Phone: a plain, announced error first
  await f.getByRole('textbox', { name: 'What is your phone number?' }).fill('123');
  await next(page);
  await expect(f.getByRole('alert')).toContainText('0911 234 567');
  await expect(f.getByRole('textbox', { name: 'What is your phone number?' })).toBeFocused();
  await noSeriousIssues(page, 'phone error');
  await f.getByRole('textbox', { name: 'What is your phone number?' }).fill('0911 234 567');
  await next(page);

  // 5. Ethiopian calendar date
  await f.getByLabel('Day').selectOption('5');
  await f.getByLabel('Month').selectOption({ label: 'Hidar' });
  await f.getByLabel(/^Year/).selectOption('2000');
  await expect(f.getByText('Gregorian calendar')).toBeVisible();
  await next(page);

  // 6. ID: not required
  await f.getByRole('radio', { name: /No document/ }).check();
  await next(page);
  await f.getByRole('radio', { name: 'AAAPD' }).check();
  await next(page);

  // 7. Support: pre-ticked from "I listen"; "Prefer not to say" is an ordinary choice
  await expect(f.getByRole('checkbox', { name: /Screen-reader-friendly/ })).toBeChecked();
  await expect(f.getByRole('checkbox', { name: 'Prefer not to say' })).toBeVisible();
  await noSeriousIssues(page, 'support');
  await next(page);

  // 8. Consent: may the host site adapt?
  await expect(f.getByRole('heading', { name: 'Can the learning site adapt to you?' })).toBeFocused();
  await f.getByRole('radio', { name: 'Yes, adapt the site for me' }).check();
  await next(page);

  // 9. Review and create
  await noSeriousIssues(page, 'review');
  await next(page);
  await expect(f.getByRole('heading', { name: 'Your account is ready' })).toBeFocused();
  await expect(f.getByText(/waiting for your partner/)).toBeVisible();
  // The host page adapted, because the learner said yes.
  await expect(page.getByRole('heading', { name: 'This site adapted to how you use your phone' })).toBeVisible();
  await noSeriousIssues(page, 'host adapted');

  // Partner signs in and confirms
  await page.goto('partner/');
  await partnerSignIn(page);
  await noSeriousIssues(page, 'partner');
  await page.locator('lehulu-partner').getByRole('listitem').filter({ hasText: learnerName }).getByRole('button', { name: /confirm/ }).click();
  await expect(page.locator('lehulu-partner').getByRole('status').first()).toContainText('confirmed');

  // Jobs: filter pre-set from sign-up, count announced, titles are headings
  await page.goto('jobs/');
  const jobs = page.locator('lehulu-jobs');
  await expect(jobs.getByRole('status').first()).toContainText('support you need');
  await noSeriousIssues(page, 'jobs');
  await jobs.getByRole('heading', { level: 3 }).first().getByRole('link').click();

  // Apply: reuses name and phone, voice or text, share yes/no
  const apply = jobs.locator('lehulu-signup');
  await apply.getByRole('textbox', { name: 'Why do you want this job?' }).fill('I like helping customers.');
  await apply.getByRole('button', { name: /^Next/ }).click();
  await apply.getByRole('radio', { name: 'Yes, this employer only' }).check();
  await apply.getByRole('button', { name: /^Next/ }).click();
  await apply.getByRole('button', { name: 'Send application' }).click();
  await expect(apply.getByRole('heading', { name: 'Application sent' })).toBeVisible();
});

test('@a11y employer signs in and posts a job with the support it offers', async ({ page }) => {
  await page.goto('employer/');
  await noSeriousIssues(page, 'employer sign-in');
  // A wrong password: a plain error, announced, focus on the field.
  const form = page.locator('lehulu-staff-sign-in');
  await staffSignIn(page, 'afro-connect', 'wrong');
  await expect(form.getByRole('alert')).toContainText('do not match');
  await expect(form.getByLabel('Password')).toBeFocused();
  await staffSignIn(page, 'afro-connect');
  await expect(page.locator('lehulu-employer').getByRole('heading', { name: 'Signed in as Afro Connect.' })).toBeFocused();
  const f = flow(page);
  await noSeriousIssues(page, 'employer');
  await f.getByRole('textbox', { name: 'What is the job title?' }).fill('Data entry clerk');
  await next(page);
  await f.getByRole('textbox', { name: 'Which organisation is hiring?' }).fill('Addis Data');
  await next(page);
  await next(page); // city is optional
  await f.getByRole('checkbox', { name: /Screen-reader-friendly/ }).check();
  await next(page);
  await f.getByRole('button', { name: 'Post job' }).click();
  await expect(f.getByRole('heading', { name: 'Job posted' })).toBeVisible();
  // Only this employer's own jobs are listed for applications.
  const received = page.locator('lehulu-applications');
  await expect(received.getByLabel('Job', { exact: true })).toContainText('Data entry clerk');
  await expect(received.getByLabel('Job', { exact: true })).not.toContainText('Junior web developer');
});

/** Press Tab until `target` has focus (keyboard only, no clicks). */
async function tabTo(page: Page, target: ReturnType<Page['locator']>, max = 8) {
  const focused = () => target.evaluate((el) => el.matches(':focus')).catch(() => false);
  // A keyboard user goes forward with Tab or back with Shift+Tab, whichever is shorter.
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let k = 0; k < max; k++) {
      if (await focused()) return;
      await page.keyboard.press(key);
    }
    if (await focused()) return;
    for (let k = 0; k < max; k++) await page.keyboard.press(key === 'Tab' ? 'Shift+Tab' : 'Tab');
  }
  await expect(target).toBeFocused();
}

test('@a11y voice answers: record, play back, delete, record again; the employer hears it', async ({ page }) => {
  const f = flow(page);
  await f.getByRole('radio', { name: 'English' }).check();
  await next(page);
  await f.getByRole('checkbox', { name: /I speak my answers/ }).check();
  await next(page);

  // Name by voice only, with the keyboard: Enter starts, Enter again stops.
  await expect(f.getByRole('heading', { name: 'What is your name?' })).toBeFocused();
  const voice = f.getByRole('button', { name: 'Answer by voice' });
  await tabTo(page, voice);
  await page.keyboard.press('Enter');
  const stop = f.getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeFocused();
  await expect(f.getByRole('status')).toContainText('Recording');
  await page.waitForTimeout(1200);
  await page.keyboard.press('Enter');
  await expect(f.getByRole('status')).toContainText('Recording saved');
  await expect(f.getByRole('button', { name: 'Play my recording' })).toBeVisible();
  await expect(f.getByRole('button', { name: 'Record again' })).toBeVisible();
  await expect(f.getByRole('button', { name: 'Delete recording' })).toBeVisible();
  await noSeriousIssues(page, 'name answered by voice');
  await tabTo(page, f.getByRole('button', { name: 'Play my recording' }));
  await page.keyboard.press('Enter');
  await next(page); // a recording counts as the answer: no typing needed

  await f.getByRole('textbox', { name: 'What is your phone number?' }).fill('0911 234 567');
  await next(page);
  await f.getByLabel('Day').selectOption('5');
  await f.getByLabel('Month').selectOption({ label: 'Hidar' });
  await f.getByLabel(/^Year/).selectOption('2000');
  await next(page);
  await f.getByRole('radio', { name: /Skip for now/ }).check();
  await next(page);
  await next(page); // support needs, pre-ticked
  await f.getByRole('radio', { name: 'No, thank you' }).check();
  await next(page);

  // Review: the voice answer can be played back and changed.
  await expect(f.getByRole('heading', { name: 'Check your answers' })).toBeFocused();
  await expect(f.getByText('Answered by voice')).toBeVisible();
  await expect(f.getByRole('button', { name: 'Play recording: Name' })).toBeVisible();
  await noSeriousIssues(page, 'review with a voice answer');
  await next(page);
  await expect(f.getByRole('heading', { name: 'Your account is ready' })).toBeFocused();

  // Apply by voice: delete the recording, see the plain error, record again.
  await page.goto('jobs/');
  const jobs = page.locator('lehulu-jobs');
  const firstJob = jobs.getByRole('heading', { level: 3 }).first().getByRole('link');
  const title = (await firstJob.textContent())!.trim();
  await firstJob.click();
  const apply = jobs.locator('lehulu-signup');
  await expect(apply.getByRole('heading', { name: 'Why do you want this job?' })).toBeFocused();
  await tabTo(page, apply.getByRole('button', { name: 'Answer by voice' }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await expect(apply.getByRole('status')).toContainText('Recording saved');
  await tabTo(page, apply.getByRole('button', { name: 'Delete recording' }));
  await page.keyboard.press('Enter');
  await expect(apply.getByRole('status')).toContainText('Recording deleted');
  await apply.getByRole('button', { name: /^Next/ }).click();
  await expect(apply.getByRole('alert')).toBeVisible();
  await tabTo(page, apply.getByRole('button', { name: 'Answer by voice' }));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await expect(apply.getByRole('status')).toContainText('Recording saved');
  await apply.getByRole('button', { name: /^Next/ }).click();
  await apply.getByRole('radio', { name: 'No, keep them private' }).check();
  await apply.getByRole('button', { name: /^Next/ }).click();
  await expect(apply.getByRole('button', { name: /^Play recording/ })).toBeVisible();
  await apply.getByRole('button', { name: 'Send application' }).click();
  await expect(apply.getByRole('heading', { name: 'Application sent' })).toBeVisible();

  // The employer that posted the job can play the spoken answer and the spoken name.
  await page.goto('employer/');
  expect(EMPLOYER_OF[title], `who posted “${title}”`).toBeTruthy();
  await staffSignIn(page, EMPLOYER_OF[title]);
  const received = page.locator('lehulu-applications');
  await received.getByLabel('Job', { exact: true }).selectOption({ label: title });
  // .first(): against a shared server, other runs may have applied to the same job by voice too.
  await expect(received.getByLabel('Voice answer: why they want this job').first()).toBeVisible();
  await expect(received.getByLabel('Name, spoken by the learner').first()).toBeVisible();
  await noSeriousIssues(page, 'employer with voice answers');
});

// Level 1 inside the real ALX Savanna starter pages (added by scripts/import-savanna-starter.sh).
// Skipped when the starter has not been imported. axe is scoped to Lehulu: Savanna's own markup is not ours.
test('@a11y inside a real Savanna page: keyboard only, not hidden under the fixed bars', async ({ page }) => {
  const res = await page.goto('savanna/pages/homepage-v1-paced.html');
  test.skip(!res || res.status() !== 200, 'Savanna starter not imported (run scripts/import-savanna-starter.sh)');
  const f = flow(page);
  await expect(f.getByRole('heading', { name: 'Which language?' })).toBeVisible();
  const axe = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0])
    .include('lehulu-signup')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // Keyboard only: focus the first radio, choose English with the arrow keys, Tab to Next, press Enter.
  await f.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(f.getByRole('radio', { name: 'English' })).toBeChecked();
  const nextBtn = f.getByRole('button', { name: /^Next/ });
  for (let k = 0; k < 6 && !(await nextBtn.evaluate((b) => b.matches(':focus'))); k++) await page.keyboard.press('Tab');
  await expect(nextBtn).toBeFocused();
  await page.keyboard.press('Enter');

  // WCAG 2.4.11: the newly focused heading sits below Savanna's fixed header and course bar.
  const heading = f.getByRole('heading', { name: 'How do you use your phone?' });
  await expect(heading).toBeFocused();
  const covered = await heading.evaluate((h) => {
    const top = h.getBoundingClientRect().top;
    const bars = [...document.querySelectorAll<HTMLElement>('.header.position-fixed, #student-current-curriculum')];
    return bars.some((b) => getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().bottom > top + 4);
  });
  expect(covered).toBe(false);

  // Savanna's side: when a learner agrees, Savanna adapts (bigger text, a note, Jobs in its own menu).
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('lehulu:preferences', { detail: { language: 'en', accessPreferences: ['big', 'listen'] } })));
  await expect(page.getByRole('heading', { name: 'This site adapted to how you use your phone' })).toBeVisible();
  // (On phones Savanna's sidebar is collapsed, so check the element rather than its visibility.)
  await expect(page.locator('#sidebar [data-lehulu-jobs] a', { hasText: 'Jobs' })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.classList.contains('lehulu-big'))).toBe(true);
});

test('works at 400% zoom width (320 CSS px) without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
