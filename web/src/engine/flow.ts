// Flow logic, independent of the UI so it can be unit-tested.
import needsFile from '@flows/needs.json';
import { passes } from './validators';
import { text } from './i18n';
import type { Answers, Flow, Lang, NeedsFile, Option, Step } from './types';

export const NEEDS = needsFile as NeedsFile;

export function visibleSteps(flow: Flow, answers: Answers): Step[] {
  return flow.steps.filter((s) => !s.when || s.when.in.includes(String(answers[s.when.field] ?? '')));
}

export function optionsFor(step: Step): Option[] {
  if (step.optionsFrom === 'needs') return NEEDS.needs.map((n) => ({ value: n.id, icon: n.icon, label: n.label }));
  return step.options ?? [];
}

/** First message of the first failing rule, or null when the answer is fine. */
export function validateStep(step: Step, answers: Answers, lang: Lang): string | null {
  const value = answers[step.id];
  const hasAudio = Boolean(answers[`${step.id}__audio`]);
  const empty = value == null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
  if (step.optional && empty && !hasAudio) return null;
  for (const r of step.validate ?? []) {
    if (!passes(r.rule, value, hasAudio && r.rule === 'required')) return text(r.message, lang);
  }
  return null;
}

/** Support needs pre-ticked from "How do you use your phone?" */
export function needsFromWays(ways: string[]): string[] {
  const set = new Set<string>();
  for (const w of ways) for (const n of NEEDS.fromWays[w] ?? []) set.add(n);
  return [...set];
}

export function needLabel(id: string, lang: Lang): string {
  const n = NEEDS.needs.find((x) => x.id === id);
  return n ? text(n.label, lang) : id;
}
