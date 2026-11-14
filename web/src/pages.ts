// Demo host pages: load the component and show how a host (like Savanna) can react to its events.
import './lehulu';

document.addEventListener('lehulu:preferences', (e) => {
  const { accessPreferences } = (e as CustomEvent<{ accessPreferences: string[] }>).detail;
  // Example host behaviour: larger text for learners who chose "Big and simple".
  document.documentElement.classList.toggle('lehulu-big', accessPreferences.includes('big'));
});

document.addEventListener('lehulu:start-lesson', () => {
  const status = document.getElementById('host-status');
  if (status) status.textContent = 'Savanna would open lesson 1 here.';
});
