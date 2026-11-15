// Lehulu's own pages: load the component and act as a host (like Savanna) that reacts to its events.
import { adaptPage } from './lehulu';

const base = import.meta.env.BASE_URL;

document.addEventListener('lehulu:preferences', (e) => {
  // Only sent when the learner agreed that the site may adapt. The note goes right under the form.
  adaptPage((e as CustomEvent).detail, { jobsUrl: `${base}jobs/`, noteIn: document.getElementById('host-note') ? '#host-note' : 'main' });
});

document.addEventListener('lehulu:start-lesson', () => {
  const status = document.getElementById('host-status');
  if (status) status.textContent = 'Savanna would open lesson 1 here.';
});

// The "Inside Savanna" card, only when the Savanna starter pages were imported (scripts/import-savanna-starter.sh).
const savanna = document.querySelector<HTMLElement>('[data-savanna]');
if (savanna) {
  fetch(`${base}savanna/pages/homepage-v1-paced.html`, { method: 'HEAD' })
    .then((r) => { if (r.ok) savanna.hidden = false; })
    .catch(() => undefined);
}
// The test site on GitHub Pages has no server, so no API documentation page.
if (import.meta.env.VITE_DATA_MODE === 'local') {
  document.querySelectorAll<HTMLAnchorElement>('a[href="docs"]').forEach((a) => a.replaceWith(a.textContent ?? ''));
}

// Offline: keep the pages, script and question flows on the phone after the first visit (public/sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${base}sw.js`).catch(() => undefined);
}
