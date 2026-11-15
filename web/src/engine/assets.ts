// Where recorded audio prompts (audio/<lang>/<step>.opus) and sign clips (sign/<step>.webm) live.
// Pages build: the site base. Library build on another site: next to lehulu.js on the Lehulu server.
export function assetsBase(): string {
  return import.meta.env.VITE_LIB ? new URL(/* @vite-ignore */ '.', import.meta.url).href : import.meta.env.BASE_URL;
}

/** public/media.json: which prompts and clips have been recorded. Add a step id after recording it. */
export interface MediaManifest {
  audio: { en: string[]; am: string[] };
  sign: string[];
}
export const EMPTY_MANIFEST: MediaManifest = { audio: { en: [], am: [] }, sign: [] };

let manifest: Promise<MediaManifest> | null = null;
export function mediaManifest(): Promise<MediaManifest> {
  manifest ??= fetch(`${assetsBase()}media.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Partial<MediaManifest>>) : ({} as Partial<MediaManifest>)))
    .then((m) => ({ audio: { en: m.audio?.en ?? [], am: m.audio?.am ?? [] }, sign: m.sign ?? [] }))
    .catch(() => EMPTY_MANIFEST);
  return manifest;
}

// Read-aloud fallback: the phone's own voice, used only when no human recording exists for a question.
// Amharic voices are rare on phones, so for Amharic this is often unavailable and the button stays hidden.
function voiceFor(lang: 'am' | 'en'): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  return speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
}

export function canSpeak(lang: 'am' | 'en'): boolean {
  return voiceFor(lang) !== null;
}

export function speak(words: string, lang: 'am' | 'en'): boolean {
  const voice = voiceFor(lang);
  if (!voice) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(words);
  u.voice = voice;
  u.lang = voice.lang;
  u.rate = 0.9;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
