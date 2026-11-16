// Accounts across devices and people: SMS sign-in (shared phones), changing answers, export, delete,
// a partner registering a learner with consent, "continue later" links, and the blank-page install.
// Keyboard and screen-reader semantics only; axe on every new screen. Works in demo mode and against a
// server started with DEMO_MODE=true (codes are shown on screen instead of sent by SMS).

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** `within`: only that part of the page (inside Savanna, Savanna's own header and sidebar are not ours). */
async function noSeriousIssues(page: Page, where: string, within?: string) {
  let axe = new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]);
  if (within) axe = axe.include(within);
  const r = await axe.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.help}`), `axe on ${where}`).toEqual([]);
}

/** A fresh Ethiopian mobile number per test, so runs against a shared server do not collide. */
const newPhone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function signUp(page: Page, name: string, phone: string) {
  await page.goto('signup/');
  const f = page.locator('lehulu-signup');
  const next = () => f.getByRole('button', { name: /^(Next|Create my account)/ }).click();
  await f.getByRole('radio', { name: 'English' }).check();
  await next();
  await f.getByRole('checkbox', { name: /I listen/ }).check();
  await next();
  await f.getByRole('textbox', { name: 'What is your name?' }).fill(name);
  await next();
  await f.getByRole('textbox', { name: 'What is your phone number?' }).fill(phone);
  await next();
  await f.getByLabel('Day').selectOption('5');
  await f.getByLabel('Month').selectOption({ label: 'Hidar' });
  await f.getByLabel(/^Year/).selectOption('2000');
  await next();
  await f.getByRole('radio', { name: /Skip for now/ }).check();
  await next();
  await next(); // support, pre-ticked
  await f.getByRole('radio', { name: 'No, thank you' }).check();
  await next();
  await next(); // review → create
  await expect(f.getByRole('heading', { name: 'Your account is ready' })).toBeFocused();
}

/** Phone + code on the profile's sign-in screen. Returns the profile element. */
async function askForCode(page: Page, phone: string) {
  await page.goto('jobs/#profile');
  const p = page.locator('lehulu-profile');
  await expect(p.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await p.getByRole('textbox', { name: 'Phone number' }).fill(phone);
  await p.getByRole('textbox', { name: 'Phone number' }).press('Enter');
  await expect(p.getByRole('textbox', { name: 'Code from the SMS' })).toBeFocused();
  const status = (await p.getByRole('status').textContent()) ?? '';
  const code = status.match(/code is (\d{6})/)?.[1];
  expect(code, status).toBeTruthy();
  return { p, code: code! };
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
});

test('@a11y another device: sign in by SMS code, choose the account on a shared phone, change, export, delete', async ({ page }) => {
  const phone = newPhone();
  const run = Date.now() % 1_000_000;
  await signUp(page, `Abebe ${run}`, phone);
  await signUp(page, `Sara ${run}`, phone); // a second person on the same phone

  // "Another device": nobody is signed in here, but the accounts still exist.
  await page.evaluate(() => localStorage.removeItem('lehulu:session'));
  const { p, code } = await askForCode(page, phone);
  await noSeriousIssues(page, 'sign-in code');

  // A wrong code: plain words, announced, focus back on the field.
  await p.getByRole('textbox', { name: 'Code from the SMS' }).fill(code === '111111' ? '222222' : '111111');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p.getByRole('alert')).toContainText('6 numbers');
  await expect(p.getByRole('textbox', { name: 'Code from the SMS' })).toBeFocused();

  await p.getByRole('textbox', { name: 'Code from the SMS' }).fill(code);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p.locator('legend', { hasText: 'Several accounts use this phone. Which one is yours?' })).toBeFocused();
  await noSeriousIssues(page, 'account chooser');
  await p.getByRole('radio', { name: `Abebe ${run}` }).check();
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p.getByRole('heading', { name: 'My profile' })).toBeFocused();
  await expect(p.getByText(`Abebe ${run}`)).toBeVisible();

  // Change one answer; focus returns to its Change button.
  await p.getByRole('button', { name: 'Change: Name' }).click();
  await expect(p.getByRole('textbox', { name: 'Name' })).toBeFocused();
  await p.getByRole('textbox', { name: 'Name' }).fill(`Abebe Kebede ${run}`);
  await p.getByRole('button', { name: 'Save' }).click();
  await expect(p.getByRole('status')).toContainText('Saved');
  await expect(p.getByRole('button', { name: 'Change: Name' })).toBeFocused();
  await expect(p.getByText(`Abebe Kebede ${run}`)).toBeVisible();

  // Change support: "Prefer not to say" is not offered here (no answer = none), and nothing breaks.
  await p.getByRole('button', { name: 'Change: Support' }).click();
  await p.getByRole('checkbox', { name: /Extra time for tests/ }).uncheck();
  await p.getByRole('button', { name: 'Save' }).click();
  await expect(p.getByRole('status')).toContainText('Saved');
  await noSeriousIssues(page, 'profile');

  // Right of access: everything held, as a file.
  const [download] = await Promise.all([page.waitForEvent('download'), p.getByRole('button', { name: 'Download my data' }).click()]);
  expect(download.suggestedFilename()).toBe('lehulu-my-data.json');

  // Right to erasure, with a confirmation step that keeps focus in place.
  await p.getByRole('button', { name: 'Delete my account' }).click();
  await expect(p.getByRole('button', { name: 'Yes, delete everything' })).toBeFocused();
  await p.getByRole('button', { name: 'Yes, delete everything' }).click();
  await expect(p.getByRole('status')).toContainText('deleted');
  await expect(p.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('@a11y a partner registers a learner who is with them; the learner agrees with the SMS code', async ({ page }) => {
  const phone = newPhone();
  await page.goto('partner/');
  await noSeriousIssues(page, 'partner sign-in with test accounts');
  await page.locator('lehulu-staff-sign-in').getByRole('button', { name: 'Continue as AAAPD' }).click();
  const partner = page.locator('lehulu-partner');
  await expect(partner.getByRole('heading', { name: 'Requests to confirm a learner' })).toBeFocused();

  const reg = partner.getByRole('region', { name: 'Register a learner who is with you' });
  await reg.getByRole('button', { name: 'Send the SMS code' }).click();
  await expect(reg.getByRole('alert')).toContainText('name');
  await expect(reg.getByRole('textbox', { name: 'Learner’s name' })).toBeFocused();
  await reg.getByRole('textbox', { name: 'Learner’s name' }).fill('Meron Alemu');
  await reg.getByRole('textbox', { name: 'Learner’s phone number' }).fill(phone);
  await reg.getByRole('radio', { name: 'English' }).check();
  await reg.getByText(/^Optional: how they use their phone/).click();
  await reg.getByRole('checkbox', { name: /Sign language interpreter/ }).check();
  await reg.getByRole('button', { name: 'Send the SMS code' }).click();
  await expect(reg.getByRole('status')).toContainText('only when the learner agrees');
  await noSeriousIssues(page, 'partner registration');
  const code = ((await reg.getByRole('status').textContent()) ?? '').match(/code is (\d{6})/)?.[1];
  expect(code).toBeTruthy();

  // The learner, on their own phone, agrees by signing in with the code.
  const p = page.locator('lehulu-profile');
  await page.goto('jobs/#profile');
  await p.getByRole('textbox', { name: 'Phone number' }).fill(phone);
  await p.getByRole('button', { name: 'Send me a code' }).click();
  await p.getByRole('textbox', { name: 'Code from the SMS' }).fill(code!);
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p.getByRole('heading', { name: 'My profile' })).toBeFocused();
  await expect(p.getByRole('status')).toContainText('partner has confirmed you');
  await expect(p.getByText('Meron Alemu')).toBeVisible();
  await expect(p.getByText('ID: confirmed by your partner.')).toBeVisible();
});

test('@a11y "continue later": the code reopens the answers, and a reload keeps them', async ({ page }) => {
  const f = page.locator('lehulu-signup');
  const next = () => f.getByRole('button', { name: /^Next/ }).click();
  await page.goto('signup/');
  await f.getByRole('radio', { name: 'English' }).check();
  await next();
  await f.getByRole('checkbox', { name: /Big and simple/ }).check();
  await next();
  await f.getByRole('textbox', { name: 'What is your name?' }).fill('Tigist Haile');

  // A reload (or a dropped connection) loses nothing: the answer was kept on the phone as it was typed.
  await page.reload();
  await expect(f.getByRole('textbox', { name: 'What is your name?' })).toHaveValue('Tigist Haile');

  await f.getByRole('button', { name: 'Continue later' }).click();
  await expect(f.getByRole('status')).toContainText('To continue later');
  const status = (await f.getByRole('status').textContent()) ?? '';
  const code = status.match(/code ([2-9A-Z]{8})/)?.[1];
  expect(code, status).toBeTruthy();

  // Later, on a phone with nothing saved: the link from the SMS.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.startsWith('lehulu:draft')) localStorage.removeItem(k);
  });
  await page.goto(`signup/?resume=${code}`);
  await expect(f.getByRole('status')).toContainText('restored');
  await expect(f.getByRole('textbox', { name: 'What is your name?' })).toHaveValue('Tigist Haile');
  await noSeriousIssues(page, 'restored from a link');
});

test('@a11y the front page explains the product, lists the test accounts and shows how to install it', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign-up that works for everyone' })).toBeVisible();
  for (const name of ['Inside ALX Savanna', 'How it works', 'Test accounts', 'Add it to your platform']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
  }
  const accounts = page.getByRole('table');
  for (const row of ['0911 000 001', '0911 000 002', 'aaapd-demo', 'lideta-tech-demo']) await expect(accounts).toContainText(row);
  for (const name of ['Sign up', 'Jobs', 'My profile', 'Partner', 'Employer']) {
    await expect(page.getByRole('navigation', { name: 'Screens' }).getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText('<lehulu-signup lang="am"', { exact: false })).toBeVisible();
  await noSeriousIssues(page, 'front page');
  await page.getByRole('main').getByRole('link', { name: 'Open sign-up' }).click();
  await expect(page.locator('#sidebar a[aria-current="page"]')).toHaveText('Sign up'); // Savanna's sidebar (collapsed on phones)
  await expect(page.locator('lehulu-signup').getByRole('heading', { name: 'Which language?' })).toBeVisible();
});

test('@a11y the test accounts work inside Savanna: Hanna signs in, AAAPD sees her, Lideta Tech reads Dawit’s application', async ({ page }) => {
  await page.goto('savanna/pages/lehulu-profile.html');
  const p = page.locator('lehulu-profile');
  await p.getByRole('textbox', { name: 'Phone number' }).fill('0911 000 001');
  await p.getByRole('button', { name: 'Send me a code' }).click();
  await expect(p.getByRole('status')).toContainText('123456');
  await p.getByRole('textbox', { name: 'Code from the SMS' }).fill('123456');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await expect(p.getByRole('heading', { name: 'My profile' })).toBeFocused();
  await expect(p.getByText('Hanna Tesfaye')).toBeVisible();
  await noSeriousIssues(page, 'profile inside Savanna', '#content');

  await page.goto('savanna/pages/lehulu-partner.html');
  await page.locator('lehulu-staff-sign-in').getByRole('button', { name: 'Continue as AAAPD' }).click();
  await expect(page.locator('lehulu-partner')).toContainText('Hanna Tesfaye');
  await noSeriousIssues(page, 'partner inside Savanna', '#content');

  await page.goto('savanna/pages/lehulu-employer.html');
  await page.locator('lehulu-staff-sign-in').getByRole('button', { name: 'Continue as Lideta Tech' }).click();
  await expect(page.locator('lehulu-applications')).toContainText('Dawit Bekele');
  await expect(page.locator('lehulu-applications')).toContainText('Please use large print.');
  await noSeriousIssues(page, 'employer inside Savanna', '#content');

  // On a phone, Savanna's menu opens the sidebar with the Lehulu screens.
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible() && !(await page.getByRole('link', { name: 'Partner (AAAPD)' }).isVisible())) {
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
  }
  await page.getByRole('link', { name: 'Partner (AAAPD)' }).click();
  await expect(page).toHaveURL(/lehulu-partner\.html$/);
});

test('choosing Amharic switches the page around the sign-up too', async ({ page }) => {
  await page.goto('signup/');
  await page.locator('lehulu-signup').getByRole('radio', { name: 'አማርኛ' }).check();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ሳቫናን ይቀላቀሉ');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('am');
  await page.locator('lehulu-signup').getByRole('radio', { name: 'English' }).check();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Join Savanna');
});

test('@a11y works on a blank page with no host styles (the judge’s install test)', async ({ page }) => {
  await page.goto('blank.html');
  const f = page.locator('lehulu-signup');
  await expect(f.getByRole('heading', { name: 'Which language?' })).toBeVisible();
  await noSeriousIssues(page, 'blank page');
  await f.getByRole('radio', { name: 'አማርኛ' }).check();
  await f.getByRole('button').filter({ hasText: '→' }).click();
  await expect(f.getByRole('heading', { level: 2 })).toBeFocused();
  await expect(f.locator('section[lang="am"]')).toBeVisible();
});
