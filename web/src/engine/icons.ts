// One set of line icons (24px grid, 2px stroke, in the style of Lucide, ISC licence), so every phone shows the
// same picture. Flow files keep their emoji as keys; anything without an icon is shown as text (e.g. "A", "ፊ").
// Icons are decoration: the text next to them always says the same thing, so they are hidden from screen readers.

import { html, nothing, type TemplateResult } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

const P: Record<string, string> = {
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  signal: '<path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  idcard: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a7 7 0 0 0-5-6.7"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
  no: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  access: '<circle cx="16" cy="4" r="1"/><path d="m18 19 1-7-6 1"/><path d="m5 8 3-3 5.5 3-2.4 3.5"/><path d="M4.2 14.5a5 5 0 0 0 6.9 6"/><path d="M13.8 17.5a5 5 0 0 0-6.9-6"/>',
  home: '<path d="M3 10 12 3l9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  school: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  captions: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6z"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
};

/** Emoji used in flows/*.json and needs.json → icon name. */
const EMOJI: Record<string, string> = {
  '🌐': 'globe', '🔈': 'volume', '🔊': 'volume', '🎤': 'mic', '🖼': 'image', '👆': 'text', '🔠': 'text',
  '🤟': 'hand', '📶': 'signal', '📱': 'phone', '👤': 'user', '📅': 'calendar', '🪪': 'idcard', '📄': 'file',
  '🤝': 'users', '⏳': 'clock', '⏭': 'skip', '✅': 'check', '✋': 'no', '♿': 'access', '🏠': 'home',
  '🏢': 'building', '🏫': 'school', '💡': 'bulb', '💬': 'message', '💼': 'briefcase', '📍': 'pin', '📨': 'mail',
  '🔒': 'lock', '🔢': 'hash', '🔤': 'captions', '🗂': 'folder', '🧭': 'compass', '🪄': 'sparkles',
};

/** An icon by name or by the emoji a flow file uses. Unknown keys are shown as text. */
export function icon(key: string | undefined, cls = 'i'): TemplateResult | typeof nothing {
  if (!key) return nothing;
  const name = P[key] ? key : EMOJI[key.replace(/\uFE0F/g, '')];
  if (!name) return html`<span class="glyph">${key}</span>`;
  return html`<svg class=${cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">${unsafeSVG(P[name])}</svg>`;
}
