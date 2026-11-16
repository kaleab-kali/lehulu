"""Read-aloud audio for every question, in Amharic and English.

Reads flows/*.json and writes web/public/audio/<lang>/<flow>/<step>.mp3 (question, hint and choices), then lists
them in web/public/media.json so the "Play question" button uses them. Uses Microsoft's neural voices through
edge-tts (pip install edge-tts; needs internet while it runs). Replace any file with a human recording of the same
name at any time. Run again after changing a question:  python scripts/make-audio.py
"""
import asyncio, json, pathlib

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
VOICES = {"am": "am-ET-MekdesNeural", "en": "en-US-JennyNeural"}
NEEDS = json.loads((ROOT / "flows/needs.json").read_text(encoding="utf-8"))


def text(v, lang):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    return v.get(lang) or v.get("en") or ""


def script(step, lang):
    parts = [text(step.get("title"), lang), text(step.get("hint"), lang)]
    options = step.get("options") or []
    if step.get("optionsFrom") == "needs":
        options = [{"label": n["label"]} for n in NEEDS["needs"]]
    labels = [text(o.get("label"), lang) for o in options]
    if labels:
        parts.append((" … ".join(labels)))
    return ". ".join(p.strip().rstrip("።.") for p in parts if p.strip()) + ("።" if lang == "am" else ".")


async def main():
    manifest = json.loads((ROOT / "web/public/media.json").read_text(encoding="utf-8"))
    manifest["audio"] = {"en": [], "am": []}
    for flow in ["signup", "apply", "employer"]:
        data = json.loads((ROOT / f"flows/{flow}.json").read_text(encoding="utf-8"))
        for step in data["steps"]:
            for lang, voice in VOICES.items():
                out = ROOT / f"web/public/audio/{lang}/{flow}/{step['id']}.mp3"
                out.parent.mkdir(parents=True, exist_ok=True)
                await edge_tts.Communicate(script(step, lang), voice, rate="-10%").save(str(out))
                manifest["audio"][lang].append(f"{flow}/{step['id']}")
                print(out.relative_to(ROOT), out.stat().st_size // 1024, "KB")
    manifest["about"] = ("Question audio and sign clips that exist. Audio: web/public/audio/<lang>/<flow>/<step>.mp3, made by "
                         "scripts/make-audio.py or recorded by a person. Sign clips: web/public/sign/<step>.webm.")
    (ROOT / "web/public/media.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


asyncio.run(main())
