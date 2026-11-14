// Noto Sans Ethiopic (SIL OFL 1.1), shipped as separate files next to lehulu.js so Amharic renders offline
// and on hosts (like Savanna) that load no Ethiopic font. @font-face must live in the document to reach
// the shadow DOM. Cross-origin hosts need CORS on /fonts (the Rust server sends it).
import { assetsBase } from './assets';

const ETHIOPIC = 'U+1200-1399, U+2D80-2DDF, U+AB01-AB2E, U+1E7E0-1E7FF';
const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD';

export function loadFonts(): void {
  if (typeof document === 'undefined' || document.getElementById('lehulu-fonts')) return;
  const url = (subset: string, weight: number) => `${assetsBase()}fonts/noto-sans-ethiopic-${subset}-${weight}-normal.woff2`;
  const face = (subset: string, weight: number, range: string) =>
    `@font-face{font-family:'Noto Sans Ethiopic';font-style:normal;font-weight:${weight};font-display:swap;src:url(${url(subset, weight)}) format('woff2');unicode-range:${range};}`;
  const style = document.createElement('style');
  style.id = 'lehulu-fonts';
  style.textContent = [face('ethiopic', 400, ETHIOPIC), face('ethiopic', 600, ETHIOPIC), face('latin', 400, LATIN), face('latin', 600, LATIN)].join('\n');
  document.head.append(style);
}
