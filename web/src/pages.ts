// Demo host pages: load the component and show how a host (like Savanna) can react to its events.
import { adaptPage } from './lehulu';

document.addEventListener('lehulu:preferences', (e) => {
  // Only sent when the learner agreed that the site may adapt.
  adaptPage((e as CustomEvent).detail, { jobsUrl: `${import.meta.env.BASE_URL}jobs/` });
});

document.addEventListener('lehulu:start-lesson', () => {
  const status = document.getElementById('host-status');
  if (status) status.textContent = 'Savanna would open lesson 1 here.';
});

// Offline: keep the pages, script and question flows on the phone after the first visit (public/sw.js).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}
