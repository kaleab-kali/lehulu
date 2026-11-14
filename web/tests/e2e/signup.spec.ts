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

test.beforeEach(async ({ page }) => {
  await page.goto('./');
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
  await f.getByRole('textbox', { name: 'What is your name?' }).fill('Hanna Tesfaye');
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

  // 7. Support: pre-ticked from "I listen"
  await expect(f.getByRole('checkbox', { name: /Screen-reader-friendly/ })).toBeChecked();
  await noSeriousIssues(page, 'support');
  await next(page);

  // 8. Review and create
  await noSeriousIssues(page, 'review');
  await next(page);
  await expect(f.getByRole('heading', { name: 'Your account is ready' })).toBeFocused();
  await expect(f.getByText(/waiting for your partner/)).toBeVisible();

  // Partner confirms
  await page.goto('partner/');
  await noSeriousIssues(page, 'partner');
  await page.locator('lehulu-partner').getByRole('button', { name: /confirm/ }).click();
  await expect(page.locator('lehulu-partner').getByRole('status')).toContainText('confirmed');

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

test('@a11y employer posts a job with the support it offers', async ({ page }) => {
  await page.goto('employer/');
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
});

test('works at 400% zoom width (320 CSS px) without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('./');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
