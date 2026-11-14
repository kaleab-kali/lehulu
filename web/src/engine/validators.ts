// Same rules as server/src/domain/validate.rs, so the screen and the API never disagree.
import { isValid } from '../lib/ethiopian-calendar';
import type { AnswerValue, EthDate, Rule } from './types';

export function normalisePhone(input: string): string | null {
  let digits = input.replace(/[\s-]/g, '').replace(/^\+/, '');
  if (digits.startsWith('251')) digits = '0' + digits.slice(3);
  else if (digits.length === 9) digits = '0' + digits;
  return /^0[79]\d{8}$/.test(digits) ? digits : null;
}

/** Returns true when the value passes the rule. `hasAudio` lets a voice recording count as an answer. */
export function passes(rule: Rule['rule'], value: AnswerValue, hasAudio = false): boolean {
  switch (rule) {
    case 'required':
      if (hasAudio) return true;
      if (Array.isArray(value)) return value.length > 0;
      return typeof value === 'string' ? value.trim().length > 0 : value != null;
    case 'et_phone':
      return typeof value === 'string' && normalisePhone(value) !== null;
    case 'et_date': {
      const v = (value ?? {}) as EthDate;
      return isValid(v.y, v.m, v.d);
    }
  }
}
