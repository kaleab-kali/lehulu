// <lehulu-signup flow="signup|apply|employer" lang="am|en" job-id="..." jobs-url="..." profile-url="...">
// One renderer for every flow: one question per screen, autosave, no time limits, voice on text fields,
// plain errors that are announced and focused, and a review screen with Change buttons.

import { LitElement, html, nothing, type TemplateResult } from 'lit';
import signupFlow from '@flows/signup.json';
import applyFlow from '@flows/apply.json';
import employerFlow from '@flows/employer.json';
import { base } from './styles';
import { needsFromWays, optionsFor, validateStep, visibleSteps } from '../engine/flow';
import { modesFrom } from '../engine/modes';
import { text, ui } from '../engine/i18n';
import { normalisePhone } from '../engine/validators';
import { Recorder } from '../engine/recorder';
import { assetsBase } from '../engine/assets';
import { MONTHS, currentEthiopianYear, gregorianText, isValid } from '../lib/ethiopian-calendar';
import { FieldError, session, store, type Learner } from '../data/store';
import type { Answers, EthDate, Flow, Lang, Step } from '../engine/types';

const FLOWS: Record<string, Flow> = {
  signup: signupFlow as Flow,
  apply: applyFlow as Flow,
  employer: employerFlow as Flow,
};

// Server field names → step ids, so an API error lands on the right question.
const FIELD_TO_STEP: Record<string, string> = { dobEthiopian: 'dob', supportOffered: 'supportOffered' };
const VOICE_PLACEHOLDER = 'Voice answer (recording saved)';

let counter = 0;

export class LehuluSignup extends LitElement {
  static styles = base;
  static properties = {
    flow: { type: String },
    jobId: { type: String, attribute: 'job-id' },
    jobsUrl: { type: String, attribute: 'jobs-url' },
    profileUrl: { type: String, attribute: 'profile-url' },
    focusOnLoad: { type: Boolean, attribute: 'focus-on-load' },
    _i: { state: true },
    _answers: { state: true },
    _error: { state: true },
    _status: { state: true },
    _lang: { state: true },
    _done: { state: true },
    _returnToReview: { state: true },
    _recording: { state: true },
    _busy: { state: true },
    _prefs: { state: true },
    _missing: { state: true },
    _signLoaded: { state: true },
  };

  declare flow: string;
  declare jobId: string | null;
  declare jobsUrl: string;
  declare profileUrl: string;
  declare focusOnLoad: boolean;
  declare _i: number;
  declare _answers: Answers;
  declare _error: string | null;
  declare _status: string;
  declare _lang: Lang;
  declare _done: { learner?: Learner; shared?: boolean } | null;
  declare _returnToReview: boolean;
  declare _recording: boolean;
  declare _busy: boolean;
  declare _prefs: string[];
  declare _missing: Set<string>;
  declare _signLoaded: boolean;

  private uid = `lehulu-${++counter}`;
  private focusTarget: 'heading' | 'field' | 'done' | null = null;
  private draftCode: string | null = null;
  private recorder = new Recorder();
  /** Voice recordings by step id. TODO(F8): upload with the answers (multipart). */
  readonly recordings = new Map<string, Blob>();

  constructor() {
    super();
    this.flow = 'signup';
    this.jobId = null;
    this.jobsUrl = 'jobs/';
    this.profileUrl = '#profile';
    this.focusOnLoad = false;
    this._i = 0;
    this._answers = {};
    this._error = null;
    this._status = '';
    this._lang = 'en';
    this._done = null;
    this._returnToReview = false;
    this._recording = false;
    this._busy = false;
    this._prefs = [];
    this._missing = new Set();
    this._signLoaded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this._lang = this.getAttribute('lang') === 'am' ? 'am' : 'en';
    void this.restore();
  }

  firstUpdated() {
    if (this.focusOnLoad) this.focusTarget = 'heading';
    this.applyFocus();
  }

  updated() {
    this.applyFocus();
  }

  // ---------- derived ----------
  private get def(): Flow {
    return FLOWS[this.flow] ?? FLOWS.signup;
  }
  private get steps(): Step[] {
    return visibleSteps(this.def, this._answers);
  }
  private get modes() {
    return modesFrom((this._answers.ways as string[] | undefined) ?? this._prefs);
  }
  private get t() {
    return ui(this._lang);
  }
  private get draftKey() {
    return `lehulu:draft:${this.flow}`;
  }

  // ---------- lifecycle helpers ----------
  private async restore() {
    const learnerId = session.get();
    if (this.flow === 'apply' && learnerId) {
      try {
        const l = await store.getLearner(learnerId);
        this._prefs = l.accessPreferences;
        this._lang = l.language;
      } catch {
        /* signed-out or deleted: handled at finish */
      }
    }
    let code: string | null = null;
    try { code = localStorage.getItem(this.draftKey); } catch { /* storage blocked */ }
    if (!code) return;
    const d = await store.getDraft(code);
    if (d && d.flowId === this.flow) {
      this.draftCode = code;
      this._answers = d.answers as Answers;
      this._i = Math.min(d.stepIndex, this.steps.length - 1);
      if (this._answers.language === 'am' || this._answers.language === 'en') this.setLang(this._answers.language);
      this._status = this.t.restored;
    }
  }

  private applyFocus() {
    if (!this.focusTarget) return;
    const root = this.renderRoot as ShadowRoot;
    const sel =
      this.focusTarget === 'heading' ? `#${this.uid}-h` : this.focusTarget === 'done' ? `#${this.uid}-done` : '[aria-invalid="true"], [data-first]';
    const el = root.querySelector<HTMLElement>(sel);
    this.focusTarget = null;
    el?.focus();
  }

  private emit(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private setLang(lang: Lang) {
    this._lang = lang;
    this.setAttribute('lang', lang);
  }

  private set(id: string, value: Answers[string]) {
    this._answers = { ...this._answers, [id]: value };
    if (this._error) this._error = null;
  }

  // ---------- navigation ----------
  private enterStep() {
    const s = this.steps[this._i];
    if (s?.prefill === 'needsFromWays' && this._answers[s.id] === undefined) {
      this.set(s.id, needsFromWays((this._answers.ways as string[]) ?? []));
    }
    this.focusTarget = 'heading';
    void this.autosave();
  }

  private back = () => {
    if (this._i === 0) return;
    this._i--;
    this._error = null;
    this._status = '';
    this.focusTarget = 'heading';
  };

  private edit(stepId: string) {
    this._i = this.steps.findIndex((x) => x.id === stepId);
    this._returnToReview = true;
    this._error = null;
    this._status = '';
    this.focusTarget = 'heading';
  }

  private next = async () => {
    if (this._busy) return;
    const steps = this.steps;
    const s = steps[this._i];
    const msg = s.type === 'review' || s.type === 'info' ? null : validateStep(s, this._answers, this._lang);
    if (msg) {
      this._error = msg;
      this.focusTarget = 'field';
      return;
    }
    this._error = null;
    this._status = '';
    if (s.type === 'tel') this.set(s.id, normalisePhone(String(this._answers[s.id] ?? '')) ?? '');

    if (this._returnToReview) {
      const after = this.steps;
      const follow = after[this._i + 1];
      // Changing the ID type may reveal a follow-up question (ID number / partner): ask it first.
      if (follow?.when && follow.when.field === s.id) {
        this._i++;
      } else {
        this._i = after.findIndex((x) => x.type === 'review');
        this._returnToReview = false;
      }
      this.enterStep();
      return;
    }
    if (this._i === steps.length - 1) {
      await this.finish();
      return;
    }
    this._i++;
    this.enterStep();
  };

  private async autosave(sendLinkTo?: string) {
    if (this.flow !== 'signup' && !sendLinkTo) return null;
    try {
      this.draftCode = await store.saveDraft(this.draftCode, {
        flowId: this.flow,
        stepIndex: this._i,
        answers: this._answers as Record<string, unknown>,
        sendLinkTo,
      });
      try { localStorage.setItem(this.draftKey, this.draftCode); } catch { /* storage blocked */ }
      return this.draftCode;
    } catch {
      return null; // offline: answers stay in memory; the next save retries
    }
  }

  private later = async () => {
    const phone = normalisePhone(String(this._answers.phone ?? '')) ?? undefined;
    const code = await this.autosave(phone);
    this._status = code ? this.t.saved(code) : this.t.retry;
  };

  // ---------- answers ----------
  private choose(s: Step, value: string, checked: boolean) {
    if (s.type === 'checks') {
      const cur = new Set((this._answers[s.id] as string[]) ?? []);
      if (checked) cur.add(value);
      else cur.delete(value);
      this.set(s.id, [...cur]);
    } else {
      this.set(s.id, value);
      if (s.id === 'language' && (value === 'am' || value === 'en')) this.setLang(value);
    }
  }

  private setDate(s: Step, part: keyof EthDate, raw: string) {
    const cur = { ...((this._answers[s.id] as EthDate) ?? {}) };
    cur[part] = raw ? Number(raw) : undefined;
    this.set(s.id, cur);
  }

  private async toggleVoice(s: Step) {
    if (!Recorder.supported()) {
      this._status = this.t.micBlocked;
      return;
    }
    if (this.recorder.recording) {
      const { blob, seconds } = await this.recorder.stop();
      this.recordings.set(s.id, blob);
      this._recording = false;
      this.set(`${s.id}__audio`, 'recorded');
      this._status = this.t.recorded(seconds);
      return;
    }
    try {
      await this.recorder.start();
      this._recording = true;
      this._status = this.t.recording;
    } catch {
      this._status = this.t.micBlocked;
    }
  }

  private play(s: Step) {
    const audio = new Audio(`${assetsBase()}audio/${this._lang}/${s.id}.opus`);
    audio.play().catch(() => {
      this._status = this.t.audioMissing;
    });
  }

  private answerText(s: Step): string {
    const v = this._answers[s.id];
    if (s.type === 'et-date') {
      const d = (v ?? {}) as EthDate;
      return isValid(d.y, d.m, d.d) ? `${d.d} ${MONTHS[this._lang][d.m! - 1]} ${d.y}` : '—';
    }
    if (s.type === 'checks') {
      const list = (v as string[]) ?? [];
      if (!list.length) return this.t.none;
      return list.map((x) => text(optionsFor(s).find((o) => o.value === x)?.label, this._lang)).join(', ');
    }
    if (s.type === 'choice') return text(optionsFor(s).find((o) => o.value === v)?.label, this._lang) || '—';
    if (!v && this._answers[`${s.id}__audio`]) return '🎤 ' + VOICE_PLACEHOLDER;
    return (v as string) || '—';
  }

  // ---------- finish ----------
  private async finish() {
    const a = this._answers;
    const str = (k: string) => String(a[k] ?? '').trim();
    this._busy = true;
    this._status = this.t.sending;
    try {
      if (this.flow === 'signup') {
        const learner = await store.createLearner({
          name: str('name') || VOICE_PLACEHOLDER,
          phone: normalisePhone(str('phone')) ?? str('phone'),
          language: (a.language as Lang) ?? this._lang,
          dobEthiopian: (a.dob as EthDate) ?? null,
          accessPreferences: (a.ways as string[]) ?? [],
          supportNeeds: (a.supportNeeds as string[]) ?? [],
          idType: a.idType as Learner['idType'],
          idNumber: str('idNumber') || null,
          partner: a.idType === 'partner' ? (a.partner as string) : null,
        });
        session.set(learner.id);
        try { localStorage.removeItem(this.draftKey); } catch { /* ignore */ }
        this._done = { learner };
        this.emit('lehulu:signup-complete', { learnerId: learner.id, idStatus: learner.idStatus });
        this.emit('lehulu:preferences', { language: learner.language, accessPreferences: learner.accessPreferences });
      } else if (this.flow === 'apply') {
        const learnerId = session.get();
        if (!learnerId || !this.jobId) throw new FieldError(this.t.signUpFirst);
        const shared = a.shareSupport === 'yes';
        await store.apply({ jobId: this.jobId, learnerId, why: str('why') || VOICE_PLACEHOLDER, shareSupport: shared });
        this._done = { shared };
        this.emit('lehulu:application-sent', { jobId: this.jobId, supportShared: shared });
      } else {
        const city = str('city');
        const job = await store.postJob({
          title: str('title'),
          org: str('org'),
          city: city || null,
          remote: !city,
          supportOffered: (a.supportOffered as string[]) ?? [],
        });
        this._done = {};
        this.emit('lehulu:job-posted', { job });
      }
      this._status = '';
      this.focusTarget = 'done';
    } catch (e) {
      const err = e instanceof FieldError ? e : new FieldError(this.t.retry);
      const stepId = err.field ? FIELD_TO_STEP[err.field] ?? err.field : null;
      const k = stepId ? this.steps.findIndex((x) => x.id === stepId) : -1;
      if (k >= 0) {
        this._i = k;
        this._returnToReview = true;
      }
      this._status = '';
      this._error = err.message;
      this.focusTarget = 'field';
    } finally {
      this._busy = false;
    }
  }

  private reset = () => {
    this._answers = {};
    this._i = 0;
    this._done = null;
    this.focusTarget = 'heading';
  };

  // ---------- rendering ----------
  render() {
    if (this._done) return this.renderDone();
    const steps = this.steps;
    const i = Math.min(this._i, steps.length - 1);
    const s = steps[i];
    const m = this.modes;
    return html`
      <section class="card ${m.big ? 'big' : ''} ${m.tiles ? 'tiles' : ''}" lang=${this._lang} aria-labelledby="${this.uid}-h">
        ${store.mode === 'local' ? html`<p class="demo">${this.t.demo}</p>` : nothing}
        <p class="step">${this.t.question(i + 1, steps.length)}</p>
        <div class="bar" aria-hidden="true"><span style="width:${Math.round((100 * (i + 1)) / steps.length)}%"></span></div>
        ${m.tiles && s.icon ? html`<div class="bigicon" aria-hidden="true">${s.icon}</div>` : nothing}
        ${this.renderStep(s)}
        ${this._error ? html`<p id="${this.uid}-err" class="error" role="alert">${this._error}</p>` : nothing}
        ${this.renderNav(i, steps.length)}
        <p class="status" role="status">${this._status}</p>
      </section>
    `;
  }

  private describedBy(s: Step) {
    const ids = [s.hint ? `${this.uid}-hint` : null, this._error ? `${this.uid}-err` : null].filter(Boolean);
    return ids.length ? ids.join(' ') : nothing;
  }

  private heading(s: Step, inner?: TemplateResult) {
    return html`<h2 id="${this.uid}-h" tabindex="-1">${inner ?? text(s.title, this._lang)}</h2>`;
  }

  private hint(s: Step) {
    return s.hint ? html`<p id="${this.uid}-hint" class="hint">${text(s.hint, this._lang)}</p>` : nothing;
  }

  private media(s: Step) {
    const m = this.modes;
    const force = Boolean(s.alwaysShowMedia);
    const parts: TemplateResult[] = [];
    if (force || m.playPrompt) {
      parts.push(html`<div class="row"><button type="button" class="small" @click=${() => this.play(s)}><span aria-hidden="true">🔊</span> ${this.t.play}</button></div>`);
    }
    if (force || m.signClips) {
      const key = `sign:${s.id}`;
      if (this._missing.has(key)) {
        parts.push(html`<p class="meta">🤟 ${this.t.signMissing}</p>`);
      } else if (m.lazyMedia && !this._signLoaded) {
        parts.push(html`<div class="row"><button type="button" class="small" @click=${() => (this._signLoaded = true)}><span aria-hidden="true">🤟</span> ${this.t.loadSign}</button></div>`);
      } else {
        parts.push(html`<video
          src="${assetsBase()}sign/${s.id}.webm"
          muted playsinline controls preload="metadata"
          aria-label=${this.t.signLabel}
          @error=${() => (this._missing = new Set([...this._missing, key]))}
        ></video>`);
      }
    }
    return parts;
  }

  private renderStep(s: Step) {
    const m = this.modes;
    const lang = this._lang;
    const title = text(s.title, lang);
    switch (s.type) {
      case 'text':
      case 'tel': {
        const inputId = `${this.uid}-in`;
        const label = html`<label for=${inputId}>${title}${s.optional ? html` <span class="meta">(${this.t.optional})</span>` : nothing}</label>`;
        const voice =
          s.type === 'text'
            ? html`<div class="row"><button type="button" class=${m.voiceFirst ? 'primary grow' : 'small'} aria-pressed=${this._recording ? 'true' : 'false'} @click=${() => this.toggleVoice(s)}><span aria-hidden="true">🎤</span> ${this._recording ? this.t.stop : this.t.voice}</button></div>`
            : nothing;
        return html`
          ${this.heading(s, label)} ${this.media(s)} ${this.hint(s)} ${m.voiceFirst ? voice : nothing}
          <input
            id=${inputId}
            type=${s.type}
            data-first
            .value=${String(this._answers[s.id] ?? '')}
            autocomplete=${s.autocomplete ?? 'off'}
            inputmode=${s.type === 'tel' ? 'tel' : nothing}
            aria-describedby=${this.describedBy(s)}
            aria-invalid=${this._error ? 'true' : nothing}
            @input=${(e: Event) => this.set(s.id, (e.target as HTMLInputElement).value)}
            @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && (e.preventDefault(), this.next())}
          />
          ${m.voiceFirst ? nothing : voice}
        `;
      }
      case 'choice':
      case 'checks': {
        const multi = s.type === 'checks';
        const cur = this._answers[s.id];
        return html`
          <fieldset aria-describedby=${this.describedBy(s)}>
            <legend>${this.heading(s)}</legend>
            ${this.media(s)} ${this.hint(s)}
            <div class="choices">
              ${optionsFor(s).map((o, k) => {
                const id = `${this.uid}-o${k}`;
                const checked = multi ? ((cur as string[]) ?? []).includes(o.value) : cur === o.value;
                return html`<label class="choice" for=${id}>
                  <input
                    id=${id}
                    type=${multi ? 'checkbox' : 'radio'}
                    name="${this.uid}-${s.id}"
                    .value=${o.value}
                    .checked=${checked}
                    ?data-first=${k === 0}
                    @change=${(e: Event) => this.choose(s, o.value, (e.target as HTMLInputElement).checked)}
                  />
                  ${o.icon ? html`<span class="ico" aria-hidden="true">${o.icon}</span>` : nothing}
                  <span lang=${o.lang ?? nothing}>${text(o.label, lang)}${o.sub ? html`<small>${text(o.sub, lang)}</small>` : nothing}</span>
                </label>`;
              })}
            </div>
          </fieldset>
        `;
      }
      case 'et-date': {
        const v = (this._answers[s.id] as EthDate) ?? {};
        const top = currentEthiopianYear() - 10;
        const years = Array.from({ length: 80 }, (_, k) => top - k);
        const sel = (part: keyof EthDate, label: string, opts: [number, string][], first = false) => html`
          <label>${label}
            <select ?data-first=${first} aria-invalid=${this._error && !v[part] ? 'true' : nothing}
              @change=${(e: Event) => this.setDate(s, part, (e.target as HTMLSelectElement).value)}>
              <option value="">—</option>
              ${opts.map(([val, name]) => html`<option value=${val} ?selected=${v[part] === val}>${name}</option>`)}
            </select>
          </label>`;
        return html`
          <fieldset aria-describedby=${this.describedBy(s)}>
            <legend>${this.heading(s)}</legend>
            ${this.media(s)} ${this.hint(s)}
            <div class="date">
              ${sel('d', this.t.day, Array.from({ length: 30 }, (_, k) => [k + 1, String(k + 1)] as [number, string]), true)}
              ${sel('m', this.t.month, MONTHS[lang].map((n, k) => [k + 1, n] as [number, string]))}
              ${sel('y', this.t.year, years.map((y) => [y, String(y)] as [number, string]))}
            </div>
            <p class="hint" aria-live="polite">${isValid(v.y, v.m, v.d) ? this.t.gregorian(gregorianText(v.y!, v.m!, v.d!)) : ''}</p>
          </fieldset>
        `;
      }
      case 'review': {
        const items = this.steps.filter((x) => x.type !== 'review' && x.type !== 'info');
        return html`
          ${this.heading(s)} ${this.media(s)}
          <dl>
            ${items.map((x) => {
              const name = text(x.short ?? x.title, lang);
              return html`<div>
                <dt>${name}</dt>
                <dd>
                  <span>${this.answerText(x)}</span>
                  <button type="button" class="small" aria-label="${this.t.change}: ${name}" @click=${() => this.edit(x.id)}>${this.t.change}</button>
                </dd>
              </div>`;
            })}
          </dl>
        `;
      }
      default:
        return html`${this.heading(s)} ${this.media(s)} ${this.hint(s)}`;
    }
  }

  private renderNav(i: number, n: number) {
    const last = i === n - 1;
    const label = this._returnToReview ? this.t.save : last ? text(this.def.finish, this._lang) || this.t.next : `${this.t.next} →`;
    return html`
      <div class="row">
        ${i > 0 && !this._returnToReview ? html`<button type="button" class="grow" @click=${this.back}>← ${this.t.back}</button>` : nothing}
        <button type="button" class="primary grow" aria-disabled=${this._busy ? 'true' : nothing} @click=${this.next}>${label}</button>
      </div>
      ${this.flow === 'signup' && !last ? html`<div class="row"><button type="button" class="small" @click=${this.later}><span aria-hidden="true">💾</span> ${this.t.later}</button></div>` : nothing}
    `;
  }

  private renderDone() {
    const t = this.t;
    const heading = (s: string) => html`<h2 id="${this.uid}-done" tabindex="-1">${s}</h2>`;
    if (this.flow === 'signup') {
      const l = this._done!.learner!;
      return html`<section class="card" lang=${this._lang} aria-labelledby="${this.uid}-done">
        ${heading(t.done.signup)}
        <p class="ok">${t.idStatus[l.idStatus] ?? ''}</p>
        <div class="row">
          <a class="btn primary grow" href=${this.jobsUrl}><span aria-hidden="true">💼</span> ${t.findJobs}</a>
          <a class="btn grow" href=${this.profileUrl}><span aria-hidden="true">👤</span> ${t.profile}</a>
        </div>
        <button type="button" @click=${() => this.emit('lehulu:start-lesson', { learnerId: l.id })}><span aria-hidden="true">📘</span> ${t.startLesson}</button>
      </section>`;
    }
    if (this.flow === 'apply') {
      return html`<section class="card" lang=${this._lang} aria-labelledby="${this.uid}-done">
        ${heading(t.done.apply)}
        <p class="ok">${this._done!.shared ? t.sharedYes : t.sharedNo}</p>
      </section>`;
    }
    return html`<section class="card" lang=${this._lang} aria-labelledby="${this.uid}-done">
      ${heading(t.done.employer)}
      <button type="button" @click=${this.reset}>+ ${this._lang === 'am' ? 'ሌላ ሥራ ለጥፍ' : 'Post another job'}</button>
    </section>`;
  }
}
