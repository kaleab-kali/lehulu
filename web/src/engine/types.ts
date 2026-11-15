// Types for the JSON flow files in /flows. One renderer draws every flow (sign-up, apply, employer).

export type Lang = 'am' | 'en';
export type L10n = string | { en: string; am?: string };

export interface Option {
  value: string;
  icon?: string;
  label: L10n;
  sub?: L10n;
  /** Language of the label itself, e.g. "አማርኛ" is always Amharic */
  lang?: Lang;
}

export interface Rule {
  rule: 'required' | 'et_phone' | 'et_date';
  message: L10n;
}

export type StepType = 'text' | 'tel' | 'choice' | 'checks' | 'et-date' | 'review' | 'info';

export interface Step {
  id: string;
  type: StepType;
  title: L10n;
  short?: L10n;
  hint?: L10n;
  icon?: string;
  autocomplete?: string;
  optional?: boolean;
  options?: Option[];
  /** Take options from flows/needs.json instead of `options` */
  optionsFrom?: 'needs';
  /** Add "Prefer not to say" (needs.json) as the last choice; it clears the others */
  preferNotToSay?: boolean;
  /** Pre-tick from the learner's first answer (ways → needs) */
  prefill?: 'needsFromWays';
  /** Show this step only when another answer matches */
  when?: { field: string; in: string[] };
  validate?: Rule[];
  /** Always show the audio prompt and sign clip on this step, whatever the mode */
  alwaysShowMedia?: boolean;
}

export interface Flow {
  id: string;
  version: number;
  finish?: L10n;
  steps: Step[];
}

export interface Need {
  id: string;
  icon: string;
  label: L10n;
  request: L10n;
}

export interface NeedsFile {
  needs: Need[];
  fromWays: Record<string, string[]>;
  preferNotToSay: Option;
}

export interface EthDate {
  d?: number;
  m?: number;
  y?: number;
}

export type AnswerValue = string | string[] | EthDate | undefined;
export type Answers = Record<string, AnswerValue>;
