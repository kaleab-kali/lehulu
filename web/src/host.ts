// What a host platform (like Savanna) can do with the `lehulu:preferences` event. Lehulu only sends this
// event when the learner agreed ("Can the learning site adapt to you?"). It never contains support needs.
//
//   import { adaptPage } from 'https://YOUR-LEHULU-HOST/lehulu.js';
//   document.addEventListener('lehulu:preferences', (e) => adaptPage(e.detail, { jobsUrl: '/jobs/' }));

export interface Preferences {
  language: 'am' | 'en';
  accessPreferences: string[];
}

export interface AdaptOptions {
  /** Where the host's jobs page is. Adds a "Jobs" link to the host's menu. */
  jobsUrl?: string;
  /** The host's menu list (default: Savanna's sidebar, `#sidebar ul`). */
  menu?: string;
  /** Where the "this page adapted" note goes (default: the top of <main>, or <body>). */
  noteIn?: string;
}

const NOTE_ID = 'lehulu-adapted';

const TEXT = {
  en: {
    title: 'This site adapted to how you use your phone',
    big: 'Larger text on every page.',
    listen: 'Quizzes give you extra time. Screen reader mode is on.',
    speak: 'You can answer quizzes by voice.',
    pictures: 'Lessons show pictures and audio first.',
    sign: 'Lessons show sign language videos where they exist.',
    data: 'Videos load only when you tap them.',
    jobs: 'Jobs',
    change: 'You can change this in your profile.',
  },
  // TODO(am-review)
  am: {
    title: 'ይህ ድረ-ገጽ ስልክዎን ከሚጠቀሙበት መንገድ ጋር ተስማምቷል',
    big: 'በሁሉም ገጽ ትልቅ ጽሑፍ።',
    listen: 'ፈተናዎች ተጨማሪ ጊዜ ይሰጡዎታል። የስክሪን አንባቢ ዘዴ በርቷል።',
    speak: 'ፈተናዎችን በድምፅ መመለስ ይችላሉ።',
    pictures: 'ትምህርቶች መጀመሪያ ሥዕሎችን እና ድምፅን ያሳያሉ።',
    sign: 'ትምህርቶች ባሉበት የምልክት ቋንቋ ቪዲዮ ያሳያሉ።',
    data: 'ቪዲዮዎች የሚጫኑት ሲነኳቸው ብቻ ነው።',
    jobs: 'ሥራዎች',
    change: 'ይህን በመገለጫዎ ውስጥ መቀየር ይችላሉ።',
  },
};

/** Adapt the host page to the learner's preferences. Safe to call again when they change. */
export function adaptPage(p: Preferences, o: AdaptOptions = {}) {
  const t = TEXT[p.language === 'am' ? 'am' : 'en'];
  const ways = new Set(p.accessPreferences);
  const root = document.documentElement;
  root.classList.toggle('lehulu-big', ways.has('big'));
  for (const w of ['listen', 'speak', 'pictures', 'sign', 'data']) root.classList.toggle(`lehulu-${w}`, ways.has(w));
  root.style.fontSize = ways.has('big') ? '125%' : '';
  if (ways.has('listen')) root.dataset.lehuluExtraTime = '1.5';
  else delete root.dataset.lehuluExtraTime;

  const menu = document.querySelector(o.menu ?? '#sidebar ul');
  if (o.jobsUrl && menu && !menu.querySelector('[data-lehulu-jobs]')) {
    const li = document.createElement('li');
    li.dataset.lehuluJobs = '';
    const a = document.createElement('a');
    a.href = o.jobsUrl;
    a.textContent = t.jobs;
    a.style.cssText = 'display:flex;align-items:center;min-height:44px;padding:0 .75rem;font-weight:600';
    li.append(a);
    menu.append(li);
  }

  document.getElementById(NOTE_ID)?.remove();
  const lines = (['big', 'listen', 'speak', 'pictures', 'sign', 'data'] as const).filter((w) => ways.has(w)).map((w) => t[w]);
  if (!lines.length) return;
  const note = document.createElement('section');
  note.id = NOTE_ID;
  note.setAttribute('aria-labelledby', `${NOTE_ID}-h`);
  note.lang = p.language;
  note.style.cssText =
    'margin:1rem auto;max-width:36rem;padding:1rem 1.25rem;border-radius:16px;border:2px solid #146c43;background:#e3f5ea;color:#0b3d24;font:1rem/1.5 system-ui,sans-serif';
  const h = document.createElement('h2');
  h.id = `${NOTE_ID}-h`;
  h.textContent = t.title;
  h.style.cssText = 'margin:0 0 .4rem;font-size:1.1rem';
  const ul = document.createElement('ul');
  ul.style.cssText = 'margin:0;padding-left:1.2rem';
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    ul.append(li);
  }
  const small = document.createElement('p');
  small.textContent = t.change;
  small.style.cssText = 'margin:.4rem 0 0';
  note.append(h, ul, small);
  const where = document.querySelector(o.noteIn ?? 'main') ?? document.body;
  where.prepend(note);
  note.style.margin = o.noteIn ? '0' : note.style.margin;
}
