import { describe, expect, it } from 'vitest';
import signup from '@flows/signup.json';
import { NONE, needsFromWays, optionsFor, toggleCheck, validateStep, visibleSteps } from '../../src/engine/flow';
import { normalisePhone } from '../../src/engine/validators';
import type { Flow } from '../../src/engine/types';

const flow = signup as Flow;

describe('flow engine', () => {
  it('never requires a kebele ID: partner route shows the partner question, not the ID number', () => {
    const ids = visibleSteps(flow, { idType: 'partner' }).map((s) => s.id);
    expect(ids).toContain('partner');
    expect(ids).not.toContain('idNumber');
    expect(visibleSteps(flow, { idType: 'later' }).map((s) => s.id)).not.toContain('partner');
  });

  it('gives a plain error with an example', () => {
    const phone = flow.steps.find((s) => s.id === 'phone')!;
    expect(validateStep(phone, { phone: '123' }, 'en')).toMatch(/0911 234 567/);
    expect(validateStep(phone, { phone: '0911 234 567' }, 'en')).toBeNull();
  });

  it('accepts a voice recording as the answer to a required text question', () => {
    const name = flow.steps.find((s) => s.id === 'name')!;
    expect(validateStep(name, {}, 'en')).not.toBeNull();
    expect(validateStep(name, { name__audio: 'recorded' }, 'en')).toBeNull();
  });

  it('pre-ticks support from how the learner uses their phone', () => {
    expect(needsFromWays(['listen', 'sign']).sort()).toEqual(['captions', 'sign', 'sr', 'text', 'time']);
  });

  it('offers "Prefer not to say" as an ordinary choice on the support question, and it clears the others', () => {
    const support = flow.steps.find((s) => s.id === 'supportNeeds')!;
    expect(optionsFor(support).at(-1)?.value).toBe(NONE);
    expect(toggleCheck(['sr', 'time'], NONE, true)).toEqual([NONE]);
    expect(toggleCheck([NONE], 'sr', true)).toEqual(['sr']);
  });

  it('normalises Ethiopian phone numbers', () => {
    expect(normalisePhone('+251 911-234-567')).toBe('0911234567');
    expect(normalisePhone('0811234567')).toBeNull();
  });
});
