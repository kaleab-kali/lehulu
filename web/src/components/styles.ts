import { css } from 'lit';

// Hosts can theme the component with --lehulu-* custom properties, and force a theme with
// theme="light" | theme="dark" (default: follow the device). Contrast ≥ 4.5:1 for text and ≥ 3:1 for
// field borders and focus rings, in both themes (checked when the palette was chosen).
export const base = css`
  :host {
    --accent: var(--lehulu-accent, #6a4bf0);
    --accent-fg: var(--lehulu-accent-fg, #ffffff);
    --accent-2: var(--lehulu-accent-2, #9b84ff); /* decorative only (progress bar end) */
    --bg: var(--lehulu-bg, #ffffff);
    --raise: var(--lehulu-raise, #f6f6fa);
    --fg: var(--lehulu-fg, #16151d);
    --muted: var(--lehulu-muted, #5a5b6b);
    --line: var(--lehulu-line, #8b8d9c); /* field borders: 3.3:1 on white */
    --hair: var(--lehulu-hair, #e6e6ee); /* card edges: decorative */
    --soft: var(--lehulu-soft, #efeaff);
    --ok: var(--lehulu-ok, #146c43);
    --ok-soft: var(--lehulu-ok-soft, #e3f5ea);
    --bad: var(--lehulu-bad, #b42318);
    --bad-soft: var(--lehulu-bad-soft, #fdecea);
    --focus: var(--lehulu-focus, #c2410c);
    --shadow: 0 1px 2px rgba(22, 21, 29, 0.04), 0 10px 30px rgba(22, 21, 29, 0.06);
    --radius: var(--lehulu-radius, 24px);
    display: block;
    color: var(--fg);
    font: 1rem/1.55 var(--lehulu-font, 'Noto Sans Ethiopic', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif);
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :host(:not([theme='light'])) {
      --accent: var(--lehulu-accent, #b9a6ff);
      --accent-fg: var(--lehulu-accent-fg, #17132b);
      --accent-2: var(--lehulu-accent-2, #7b61f5);
      --bg: var(--lehulu-bg, #1c1b24);
      --raise: var(--lehulu-raise, #24232e);
      --fg: var(--lehulu-fg, #ecebf3);
      --muted: var(--lehulu-muted, #b3b2c4);
      --line: var(--lehulu-line, #787a8c);
      --hair: var(--lehulu-hair, #2e2d3a);
      --soft: var(--lehulu-soft, #2a2440);
      --ok: var(--lehulu-ok, #7fd8a6);
      --ok-soft: var(--lehulu-ok-soft, #18301f);
      --bad: var(--lehulu-bad, #ff9b8f);
      --bad-soft: var(--lehulu-bad-soft, #3a1d1b);
      --focus: var(--lehulu-focus, #ffb547);
      --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 30px rgba(0, 0, 0, 0.25);
      color-scheme: dark;
    }
  }
  :host([theme='dark']) {
    --accent: var(--lehulu-accent, #b9a6ff);
    --accent-fg: var(--lehulu-accent-fg, #17132b);
    --accent-2: var(--lehulu-accent-2, #7b61f5);
    --bg: var(--lehulu-bg, #1c1b24);
    --raise: var(--lehulu-raise, #24232e);
    --fg: var(--lehulu-fg, #ecebf3);
    --muted: var(--lehulu-muted, #b3b2c4);
    --line: var(--lehulu-line, #787a8c);
    --hair: var(--lehulu-hair, #2e2d3a);
    --soft: var(--lehulu-soft, #2a2440);
    --ok: var(--lehulu-ok, #7fd8a6);
    --ok-soft: var(--lehulu-ok-soft, #18301f);
    --bad: var(--lehulu-bad, #ff9b8f);
    --bad-soft: var(--lehulu-bad-soft, #3a1d1b);
    --focus: var(--lehulu-focus, #ffb547);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 10px 30px rgba(0, 0, 0, 0.25);
    color-scheme: dark;
  }
  * { box-sizing: border-box; }

  /* ---- surfaces ---- */
  .card {
    background: var(--bg); border: 1px solid var(--hair); border-radius: var(--radius);
    box-shadow: var(--shadow); padding: clamp(1rem, 4vw, 1.75rem); display: grid; gap: 1rem;
  }
  /* a card inside a card (job, request, application) is a flat tile */
  .card .card { background: var(--raise); box-shadow: none; border-radius: 18px; padding: 1rem 1.1rem; }
  h2, h3 { margin: 0; line-height: 1.2; letter-spacing: -0.01em; }
  h2 { font-size: clamp(1.35rem, 1.1rem + 1.2vw, 1.75rem); font-weight: 600; }
  h3 { font-size: 1.1rem; font-weight: 600; }
  p { margin: 0; }
  a { color: var(--accent); text-underline-offset: 0.18em; }
  .card .card h3 a { color: var(--fg); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  /* ---- focus (always visible) ---- */
  :focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }
  [tabindex='-1']:focus { outline: none; }
  /* WCAG 2.4.11: keep focused items clear of a host's fixed header */
  :is(h2, input, select, button, a) { scroll-margin-top: var(--lehulu-scroll-offset, 5rem); }

  /* ---- text ---- */
  .meta { color: var(--muted); font-size: 0.9rem; }
  .step {
    justify-self: start; font-size: 0.85rem; font-weight: 600; color: var(--accent);
    background: var(--soft); border-radius: 999px; padding: 0.2rem 0.75rem;
  }
  .hint { color: var(--muted); }
  .status { color: var(--muted); font-size: 0.95rem; min-height: 1.2em; }
  .ok { background: var(--ok-soft); color: var(--ok); border-radius: 14px; padding: 0.75rem 1rem; font-weight: 600; }
  .error { color: var(--bad); background: var(--bad-soft); border-radius: 14px; padding: 0.7rem 1rem; font-weight: 600; }
  .demo { font-size: 0.85rem; background: var(--raise); border-radius: 12px; padding: 0.45rem 0.8rem; color: var(--muted); }

  /* ---- progress ---- */
  .bar { height: 8px; background: var(--soft); border-radius: 99px; overflow: hidden; }
  .bar > span { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent-2), var(--accent)); }

  /* ---- fields ---- */
  label.field-label { font-weight: 600; }
  input[type='text'], input[type='tel'], select, textarea {
    font: inherit; font-size: 1.05rem; color: var(--fg); background: var(--bg);
    border: 1.5px solid var(--line); border-radius: 14px; padding: 0.7rem 0.9rem; min-height: 52px; width: 100%;
  }
  [aria-invalid='true'] { border-color: var(--bad) !important; border-width: 2px !important; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  legend { padding: 0; margin-bottom: 0.75rem; }
  .choices { display: grid; gap: 0.6rem; }
  .choice {
    display: flex; gap: 0.8rem; align-items: center; padding: 0.75rem 0.9rem; min-height: 56px;
    border: 1.5px solid var(--line); border-radius: 16px; background: var(--bg); cursor: pointer;
  }
  .choice:has(input:checked) { border: 2px solid var(--accent); background: var(--soft); padding: calc(0.75rem - 0.5px) calc(0.9rem - 0.5px); }
  .choice input { width: 22px; height: 22px; accent-color: var(--accent); flex: none; margin: 0; }
  .choice small { display: block; color: var(--muted); }
  .ico {
    font-size: 1.25rem; width: 2.2rem; height: 2.2rem; flex: none; display: grid; place-items: center;
    background: var(--raise); border-radius: 12px;
  }
  .date { display: grid; grid-template-columns: 1fr 1.6fr 1.3fr; gap: 0.6rem; }
  .date label { font-size: 0.9rem; font-weight: 600; display: grid; gap: 0.3rem; }

  /* ---- buttons ---- */
  .row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
  button, .btn {
    font: inherit; font-weight: 600; min-height: 48px; padding: 0.6rem 1.15rem; border-radius: 14px;
    border: 1.5px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; text-decoration: none;
    display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem;
  }
  button:hover, .btn:hover { background: var(--raise); }
  .primary, .primary:hover { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .primary:hover { filter: brightness(1.06); }
  .grow { flex: 1; }
  .small { min-height: 44px; padding: 0.35rem 0.9rem; font-size: 0.95rem; border-radius: 12px; background: var(--raise); }

  /* ---- review list ---- */
  dl { margin: 0; display: grid; gap: 0; }
  dl > div { display: grid; gap: 0.15rem; border-bottom: 1px solid var(--hair); padding: 0.7rem 0; }
  dl > div:last-child { border-bottom: 0; }
  dt { font-weight: 600; font-size: 0.9rem; color: var(--muted); }
  dd { margin: 0; min-width: 0; overflow-wrap: anywhere; display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; }

  /* ---- tags (support offered / requested) ---- */
  .tags { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .tag { font-size: 0.85rem; font-weight: 600; border-radius: 999px; padding: 0.2rem 0.7rem; background: var(--soft); color: var(--accent); }
  .tag.ok { background: var(--ok-soft); color: var(--ok); padding: 0.2rem 0.7rem; border-radius: 999px; }

  video { width: 100%; max-height: 220px; border-radius: 16px; background: #000; }

  /* ---- modes ---- */
  .big { font-size: 1.2rem; }
  .big h2 { font-size: 1.75rem; }
  .big button, .big .btn, .big .choice, .big input, .big select { min-height: 60px; }
  .tiles .choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tiles .choice { flex-direction: column; justify-content: center; text-align: center; min-height: 128px; }
  .tiles .choice .ico { font-size: 2.4rem; width: 4rem; height: 4rem; border-radius: 18px; }
  .tiles .choice small { display: none; }
  .bigicon { font-size: 3rem; text-align: center; line-height: 1; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
