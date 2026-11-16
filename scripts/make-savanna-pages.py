"""Lehulu's screens inside Savanna's own layout (header and sidebar), for testing the way a learner would see them.

Takes the header and sidebar from web/public/savanna/pages/homepage-v1-paced.html (run import-savanna-starter.sh
first), writes web/public/savanna/pages/lehulu-*.html, and adds a Lehulu group to the sidebar of every Savanna page.
Run again after re-importing the starter:  python scripts/make-savanna-pages.py
"""
import pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGES = ROOT / "web/public/savanna/pages"
UP = "../../"  # from savanna/pages/ to the site root, where lehulu.js is
# Savanna's red, darkened to pass 4.5:1 with white text. The offset clears Savanna's fixed header.
THEME = "--lehulu-accent:#b3261e;--lehulu-accent-2:#e57373;--lehulu-soft:#fbe9e8;--lehulu-scroll-offset:6rem"

SCREENS = [
    # file, sidebar label, icon, page title, intro, test account note, component
    ("lehulu-signup.html", "Sign up", "fa-user-plus", "Join Savanna",
     "One question at a time. There is no time limit, and you can stop and continue later.",
     "New learner: no account needed. Use any Ethiopian phone number, for example 0911 234 567. "
     "On this test system the SMS code is shown on screen.",
     f'<lehulu-signup lang="en" jobs-url="lehulu-jobs.html" profile-url="lehulu-profile.html" style="{THEME}"></lehulu-signup>'),
    ("lehulu-jobs.html", "Jobs", "fa-briefcase", "Jobs",
     "Jobs that offer the support you need come first. You choose, job by job, what the employer sees.",
     "Sign in as Dawit Bekele: phone 0911 000 002, code 123456. He has applied for Junior web developer.",
     f'<lehulu-jobs signup-url="lehulu-signup.html" profile-url="lehulu-profile.html" style="{THEME}"></lehulu-jobs>'),
    ("lehulu-profile.html", "My profile", "fa-id-card", "My profile",
     "Change your answers, download your data, or delete your account.",
     "Returning learner Hanna Tesfaye: phone 0911 000 001, code 123456. She has no ID document and is waiting for AAAPD.",
     f'<lehulu-profile signup-url="lehulu-signup.html" style="{THEME}"></lehulu-profile>'),
    ("lehulu-partner.html", "Partner (AAAPD)", "fa-handshake", "Partner",
     "For organisations such as AAAPD: confirm a learner who has no ID document, or register a learner who is with you.",
     "AAAPD: ID aaapd, password aaapd-demo (or tap Continue as AAAPD). Hanna Tesfaye is waiting for you to confirm her.",
     f'<lehulu-partner lang="en" style="{THEME}"></lehulu-partner>'),
    ("lehulu-employer.html", "Employer", "fa-building", "Employer",
     "Post a job with the support it offers, then read the applications for your jobs.",
     "Lideta Tech: ID lideta-tech, password lideta-tech-demo (or tap Continue as Lideta Tech). "
     "Dawit Bekele has applied for Junior web developer.",
     f'<lehulu-employer lang="en" style="{THEME}"></lehulu-employer>'),
]

MARK = 'title="Lehulu"'


def sidebar_group(current: str | None) -> str:
    items = []
    for file, label, icon, *_ in SCREENS:
        active = " active" if file == current else ""
        here = ' aria-current="page"' if file == current else ""
        items.append(
            f'<li><a href="{file}"{here}><div class="icon{active}"><i aria-hidden="true" class="fa-solid {icon}"></i></div>'
            f'<div class="ps-3 overflow-hidden text-nowrap" style="display: block">{label}</div></a></li>'
        )
    return f'<hr {MARK} />\n          ' + "\n          ".join(items) + "\n          "


def add_lehulu_to_sidebar(html: str, current: str | None) -> str:
    if MARK in html:
        html = re.sub(r'<hr title="Lehulu" />.*?(?=<hr title="My resources" />)', "", html, flags=re.S)
    html = html.replace('<hr title="My resources" />', sidebar_group(current) + '<hr title="My resources" />', 1)
    # Home goes to the Savanna homepage; My Profile at the bottom opens Lehulu's profile.
    html = re.sub(r'<a href="(?:#|homepage-v1-paced\.html)"( rel="noreferrer" target="_self")?\s*><div class="icon( active)?"><i aria-hidden="true" class="fa-solid fa-home">',
                  lambda m: f'<a href="homepage-v1-paced.html"{m.group(1) or ""}><div class="icon{"" if current else (m.group(2) or "")}"><i aria-hidden="true" class="fa-solid fa-home">',
                  html, count=1)
    html = re.sub(r'<a href="(?:#|lehulu-profile\.html)"\n              ><div class="image"><i aria-hidden="true" class="fa-solid fa-user">', lambda m:
                  '<a href="lehulu-profile.html"\n              ><div class="image"><i aria-hidden="true" class="fa-solid fa-user">', html, count=1)
    return html


def page(template: str, screen) -> str:
    file, label, icon, title, intro, note, component = screen
    head = template[: template.index('<main class="content" id="content">')]
    head = re.sub(r"<title>.*?</title>", f"<title>{title} | Savanna</title>", head, count=1, flags=re.S)
    head = head.replace("<!--\n  Learner homepage", "<!--\n  Lehulu inside Savanna. Made by scripts/make-savanna-pages.py from the learner homepage", 1)
    head = add_lehulu_to_sidebar(head, file)
    main = f"""<main class="content" id="content">
      <div style="padding: 88px 16px 48px">
        <div style="max-width: 48rem; margin: 0 auto; display: grid; gap: 1rem">
          <h1 class="fs-2 fw-semibold mb-0">{title}</h1>
          <p class="mb-0 text-body-secondary">{intro}</p>
          <div class="alert alert-light border mb-0" role="note"><strong>Test account.</strong> {note}</div>
          {component}
          <div id="lehulu-note"></div>
        </div>
      </div>
    </main>
    <script type="module" src="{UP}lehulu.js"></script>
    <script type="module">
      import {{ adaptPage }} from "{UP}lehulu.js";
      document.addEventListener("lehulu:preferences", (e) => adaptPage(e.detail, {{ jobsUrl: "lehulu-jobs.html", noteIn: "#lehulu-note" }}));
      document.addEventListener("lehulu:language", (e) => {{ document.documentElement.lang = e.detail.language; }});
    </script>
    <style>
      /* Savanna's app script collapses the sidebar on phones; these frozen pages do it here. */
      .header .hamburger {{ min-width: 44px; min-height: 44px; display: grid; place-items: center; }}
      @media (max-width: 767.98px) {{
        #sidebar:not(.open) {{ display: none !important; }}
        #content {{ margin-left: 0 !important; }}
      }}
    </style>
    <script>
      (() => {{
        const menu = document.querySelector(".header .hamburger"), bar = document.getElementById("sidebar");
        if (!menu || !bar) return;
        menu.tabIndex = 0;
        menu.setAttribute("role", "button");
        menu.setAttribute("aria-label", "Menu");
        menu.setAttribute("aria-controls", "sidebar");
        const set = (open) => {{ bar.classList.toggle("open", open); menu.setAttribute("aria-expanded", String(open)); }};
        set(false);
        menu.addEventListener("click", () => set(!bar.classList.contains("open")));
        menu.addEventListener("keydown", (e) => {{ if (e.key === "Enter" || e.key === " ") {{ e.preventDefault(); menu.click(); }} }});
      }})();
    </script>
  </body>
</html>
"""
    return head + main


def main():
    template_path = PAGES / "homepage-v1-paced.html"
    template = template_path.read_text(encoding="utf-8")
    for screen in SCREENS:
        (PAGES / screen[0]).write_text(page(template, screen), encoding="utf-8")
        print("wrote", screen[0])
    for p in PAGES.glob("*.html"):
        if p.name.startswith("lehulu-"):
            continue
        html = p.read_text(encoding="utf-8")
        html = add_lehulu_to_sidebar(html, None)
        html = html.replace('jobs-url="../../jobs/"', 'jobs-url="lehulu-jobs.html" profile-url="lehulu-profile.html"')
        html = html.replace('jobsUrl: "../../jobs/"', 'jobsUrl: "lehulu-jobs.html"')
        p.write_text(html, encoding="utf-8")
        print("linked", p.name)


main()
