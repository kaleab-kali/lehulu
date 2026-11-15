// "How do you use your phone?" → presentation flags. Modes change HOW questions look and sound,
// never WHAT is asked, and never remove text (so sound-off and screen readers always work).

export interface Modes {
  /** Voice button is the big primary control (speak, pictures) */
  voiceFirst: boolean;
  /** Choices as large picture tiles, and a picture for each question (pictures, sign) */
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
    // Deaf learners get the pictures too: they describe each question until sign videos are recorded.
    tiles: has('pictures') || has('sign'),
    big: has('big'),
    playPrompt: has('pictures') || has('speak'),
    signClips: has('sign'),
    lazyMedia: has('data'),
  };
}
