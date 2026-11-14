// "How do you use your phone?" → presentation flags. Modes change HOW questions look and sound,
// never WHAT is asked, and never remove text (so sound-off and screen readers always work).

export interface Modes {
  /** Voice button is the big primary control (speak, pictures) */
  voiceFirst: boolean;
  /** Choices as large picture tiles (pictures) */
  tiles: boolean;
  /** Larger text and 60px targets (big) */
  big: boolean;
  /** Play button with recorded audio prompt (pictures, speak) */
  playPrompt: boolean;
  /** Sign language clip for each question (sign) */
  signClips: boolean;
  /** Do not download audio/video until tapped (data) */
  lazyMedia: boolean;
}

export function modesFrom(ways: string[] = []): Modes {
  const has = (w: string) => ways.includes(w);
  return {
    voiceFirst: has('speak') || has('pictures'),
    tiles: has('pictures'),
    big: has('big'),
    playPrompt: has('pictures') || has('speak'),
    signClips: has('sign'),
    lazyMedia: has('data'),
  };
}
