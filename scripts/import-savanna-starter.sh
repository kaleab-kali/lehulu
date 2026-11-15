#!/usr/bin/env bash
# Copies the ALX Savanna starter pages into web/public/savanna/ and adds Lehulu with one script tag,
# so you can show Lehulu running inside real Savanna pages (Level 1), and Savanna adapting to the learner.
# Then: cd web && pnpm run build, and open /savanna/ (Docker: http://localhost:8080/savanna/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/web/public/savanna"
TMP="$(mktemp -d)"
git clone --depth 1 https://github.com/alx-africa/Savanna-static-pages "$TMP/starter"
rm -rf "$DEST" && mkdir -p "$DEST"
cp -R "$TMP/starter/." "$DEST/"
rm -rf "$DEST/.git"

# theme="light" matches Savanna (light only). #b3261e is Savanna's red darkened to pass 4.5:1 with white text
# (Savanna's own #db3e3e is 4.4:1). The scroll offset clears Savanna's fixed header (72px) plus its
# course bar (63-118px), so a focused heading is never hidden under them (WCAG 2.4.11).
SNIPPET='<section aria-label="Sign up for Savanna" style="max-width:36rem;margin:1.5rem auto;padding:0 16px"><lehulu-signup lang="en" theme="light" jobs-url="__BASE__jobs/" style="--lehulu-accent:#b3261e;--lehulu-accent-2:#e57373;--lehulu-soft:#fbe9e8;--lehulu-scroll-offset:12.5rem"></lehulu-signup><div id="lehulu-note" style="margin-top:1rem"></div></section>'
inject() { # $1 = html file, $2 = relative path from that file to the site root
  local f="$1" up="$2"
  local snip="${SNIPPET//__BASE__/$up}"
  python3 - "$f" "$snip" "$up" <<'PY'
import re, sys
path, snip, up = sys.argv[1], sys.argv[2], sys.argv[3]
html = open(path, encoding="utf-8").read()
if "lehulu.js" in html:
    sys.exit(0)
def after_course_bar(h):
    # Savanna pads #layout-bars for its fixed course bar: insert right after that bar, so the
    # component is not hidden under it and DOM order matches what is seen (focus order, 2.4.3).
    start = re.search(r'<div[^>]*id="student-current-curriculum"[^>]*>', h)
    if not start:
        return None
    depth, pos = 1, start.end()
    for tag in re.finditer(r"<(/?)div\b[^>]*>", h[pos:]):
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            return pos + tag.end()
    return None
at = after_course_bar(html)
if at is None:
    m = re.search(r"<main[^>]*>", html) or re.search(r"<body[^>]*>", html)
    at = m.end()
html = html[:at] + snip + html[at:]
# Savanna's side of the deal: when the learner agrees, Savanna adapts (bigger text, a note saying what
# changed, Jobs in the sidebar). Lehulu sends lehulu:preferences only with the learner's consent.
host = (
    f'<script type="module">import {{ adaptPage }} from "{up}lehulu.js";'
    f'document.addEventListener("lehulu:preferences", (e) => adaptPage(e.detail, {{ jobsUrl: "{up}jobs/", noteIn: "#lehulu-note" }}));</script>'
)
html = html.replace("</body>", f'<script type="module" src="{up}lehulu.js"></script>{host}</body>', 1)
open(path, "w", encoding="utf-8").write(html)
PY
}
inject "$DEST/index.html" "../"
for f in "$DEST"/pages/*.html; do inject "$f" "../../"; done
rm -rf "$TMP"
echo "Done. Savanna pages with Lehulu are in web/public/savanna/. Build the web app, then open /savanna/."
