# Recording Amharic audio prompts and sign language clips

The app plays a recorded prompt and a sign clip for each question **that is listed in `web/public/media.json`**.
Without a recording, **Play question** uses the phone's own voice if it has one for that language (most phones
have English; few have Amharic), and is hidden otherwise. A question without a sign clip shows no sign area.
Text is always on screen. Record Amharic prompts first: that is where phones have no voice of their own.

After adding files, list the question ids:

```json
{ "audio": { "en": ["language", "ways"], "am": ["language", "ways", "name"] }, "sign": ["language", "ways"] }
```

## File names (one per question id)

| Flow | Question ids |
|---|---|
| Sign-up | `language`, `ways`, `name`, `phone`, `dob`, `idType`, `idNumber`, `partner`, `supportNeeds`, `shareWithHost`, `review` |
| Apply | `why`, `shareSupport`, `review` |
| Employer | `title`, `org`, `city`, `supportOffered`, `review` |

- Audio: `web/public/audio/am/<id>.opus` and `web/public/audio/en/<id>.opus`
- Sign: `web/public/sign/<id>.webm` (the same clip is used for both languages)

## Audio prompts (native Amharic speaker)
1. Read the question title and hint from `flows/*.json` exactly as written. Calm, clear, normal speed.
2. Record on a phone in a quiet room (voice memo app).
3. Convert to small Opus files (about 10–20 KB each):
   ```bash
   ffmpeg -i name.m4a -ac 1 -c:a libopus -b:a 24k web/public/audio/am/name.opus
   ```

## Sign language clips (interpreter)
1. Plain wall behind, good light on face and hands, interpreter's upper body in frame. Landscape.
2. One clip per question, 5–10 seconds. Sign the meaning, not word for word.
3. Convert to small WebM files (about 100–200 KB each), no audio:
   ```bash
   ffmpeg -i name.mp4 -vf scale=-2:240 -c:v libvpx-vp9 -b:v 200k -an web/public/sign/name.webm
   ```
4. Credit the interpreter in the README (with their consent).

Do **not** generate sign language with an avatar or AI: Deaf co-designers on the panel will judge the quality.
