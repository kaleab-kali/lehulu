// <lehulu-signup flow="signup|apply|employer" lang="am|en" job-id="..." jobs-url="..." profile-url="..." api-base="...">
// One renderer for every flow: one question per screen, autosave, no time limits, voice on text fields,
// plain errors that are announced and focused, and a review screen with Change buttons.
// A "continue later" SMS link (?resume=CODE) reopens the draft; a copy is also kept on the phone for offline use.

import { LitElement, html, nothing, type TemplateResult } from 'lit';
import signupFlow from '@flows/signup.json';
import applyFlow from '@flows/apply.json';
import employerFlow from '@flows/employer.json';
import { base } from './styles';
import { icon } from '../engine/icons';
import { needsFromWays, optionsFor, realNeeds, toggleCheck, validateStep, visibleSteps } from '../engine/flow';
import { modesFrom } from '../engine/modes';
import { text, ui } from '../engine/i18n';
import { normalisePhone } from '../engine/validators';
import { Recorder } from '../engine/recorder';
import { EMPTY_MANIFEST, assetsBase, canSpeak, mediaManifest, speak, stopSpeaking, type MediaManifest } from '../engine/assets';
import { MONTHS, currentEthiopianYear, gregorianText, isValid } from '../lib/ethiopian-calendar';
import { FieldError, session, store, useApiBase, type Learner } from '../data/store';
import type { Answers, EthDate, Flow, Lang, Step } from '../engine/types';

const FLOWS: Record<string, Flow> = {
  signup: signupFlow as Flow,
  apply: applyFlow as Flow,
  employer: employerFlow as Flow,
};

// Server field names → step ids, so an API error lands on the right question.
const FIELD_TO_STEP: Record<string, string> = { dobEthiopian: 'dob', supportOffered: 'supportOffered', nameAudio: 'name', whyAudio: 'why' };
/** Answer value for a recording kept on this phone until it can be uploaded (offline). */
const PENDING = 'pending';

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
    _playing: { state: true },
    _media: { state: true },
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
  declare _playing: string | null;
  /** Which recorded prompts and sign clips exist (public/media.json). */
  declare _media: MediaManifest;

  private uid = `lehulu-${++counter}`;
  private focusTarget: 'heading' | 'field' | 'done' | 'voice' | null = null;
  private draftCode: string | null = null;
  private recorder = new Recorder();
  /** Recordings not uploaded yet (offline), by step id. Sent before the answers are. */
  readonly recordings = new Map<string, Blob>();
  /** Local playback URLs for recordings made on this page, by step id. */
  private previews = new Map<string, string>();
  private player: HTMLAudioElement | null = null;

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
    this._playing = null;
    this._media = EMPTY_MANIFEST;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.player?.pause();
    stopSpeaking();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.removeEventListener?.('voiceschanged', this.voicesReady);
    for (const url of this.previews.values()) URL.revokeObjectURL(url);
  }

  connectedCallback() {
    super.connectedCallback();
    useApiBase(this);
    this._lang = this.getAttribute('lang') === 'am' ? 'am' : 'en';
    // Phone voices load late: show "Play question" once one for this language is ready.
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', this.voicesReady);
    void this.restore();
  }

  private voicesReady = () => this.requestUpdate();

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
    if (this.flow === 'apply' && session.get()) {
      try {
        const l = await store.me();
        this._prefs = l.accessPreferences;
        this._lang = l.language;
      } catch {
        /* signed-out or deleted: handled at finish */
      }
    }
    if (this.flow !== 'signup') {
      this.checkMedia();
      return;
    }
    // A "continue later" link (?resume=CODE) wins over a draft saved on this phone.
    let fromLink: string | null = null;
    try { fromLink = new URLSearchParams(location.search).get('resume'); } catch { /* no location */ }
    let saved: string | null = null;
    try { saved = localStorage.getItem(this.draftKey); } catch { /* storage blocked */ }
    const copy = this.offlineCopy();
    if (!fromLink && copy) {
      // The copy on this phone is the newest: it is updated after every answer, even offline.
      this.draftCode = saved;
      this.load(copy.answers, copy.stepIndex);
    } else {
      const code = fromLink?.trim().toUpperCase() || saved;
      const d = code ? await store.getDraft(code) : null;
      if (d && d.flowId === this.flow) {
        this.draftCode = code;
        this.load(d.answers as Answers, d.stepIndex);
        try { localStorage.setItem(this.draftKey, code!); } catch { /* storage blocked */ }
      } else if (fromLink) {
        this._status = this.t.resumeMissing;
      }
    }
    this.checkMedia();
  }

  private load(answers: Answers, stepIndex: number) {
    // A recording that never left the old page (offline, or an older draft) is gone: ask again.
    this._answers = Object.fromEntries(
      Object.entries(answers).filter(([k, v]) => !(k.endsWith('__audio') && (v === PENDING || v === 'recorded'))),
    ) as Answers;
    this._i = Math.min(stepIndex, this.steps.length - 1);
    if (this._answers.language === 'am' || this._answers.language === 'en') this.setLang(this._answers.language);
    this._status = this.t.restored;
  }

  /** Answers kept on this phone so sign-up survives going offline. Never the ID number. */
  private get copyKey() {
    return `lehulu:draft-copy:${this.flow}`;
  }
  private offlineCopy(): { answers: Answers; stepIndex: number } | null {
    try { return JSON.parse(localStorage.getItem(this.copyKey) ?? 'null'); } catch { return null; }
  }
  private keepCopy() {
    const { idNumber: _, ...answers } = this._answers;
    try { localStorage.setItem(this.copyKey, JSON.stringify({ answers, stepIndex: this._i })); } catch { /* storage blocked */ }
  }
  private dropDraft() {
    try {
      localStorage.removeItem(this.draftKey);
      localStorage.removeItem(this.copyKey);
    } catch { /* ignore */ }
  }

  /** Load the list of recorded prompts and sign clips, so only buttons that work are shown. */
  private checkMedia() {
    void mediaManifest().then((m) => (this._media = m));
  }

  private applyFocus() {
    if (!this.focusTarget) return;
    const root = this.renderRoot as ShadowRoot;
    const sel =
      this.focusTarget === 'heading'
        ? `#${this.uid}-h`
        : this.focusTarget === 'done'
          ? `#${this.uid}-done`
          : this.focusTarget === 'voice'
            ? '[data-voice]'
            : '[aria-invalid="true"], [data-first]';
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
    if (this.flow === 'signup') this.emit('lehulu:language', { language: lang });
  }

  private set(id: string, value: Answers[string]) {
    this._answers = { ...this._answers, [id]: value };
    if (this._error) this._error = null;
    // Kept on the phone the moment it is given: a reload or a dropped connection loses nothing.
    if (this.flow === 'signup') this.keepCopy();
  }

  // ---------- navigation ----------
  private enterStep() {
    const s = this.steps[this._i];
    if (s?.prefill === 'needsFromWays' && this._answers[s.id] === undefined) {
      this.set(s.id, needsFromWays((this._answers.ways as string[]) ?? []));
    }
    this.focusTarget = 'heading';
    this.emitStep();
    void this.autosave();
  }

  /** Lets the host show progress elsewhere (never the answers). */
  private emitStep() {
    this.emit('lehulu:step', { flow: this.flow, step: this._i + 1, of: this.steps.length, id: this.steps[this._i]?.id });
  }

  private back = () => {
    if (this._i === 0) return;
    this._i--;
    this._error = null;
    this._status = '';
    this.focusTarget = 'heading';
    this.emitStep();
    if (this.flow === 'signup') this.keepCopy();
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
    if (this.flow === 'signup') this.keepCopy();
    try {
      this.draftCode = await store.saveDraft(this.draftCode, {
        flowId: this.flow,
        stepIndex: this._i,
        answers: this._answers as Record<string, unknown>,
        sendLinkTo,
      });
      // The account may have been created while this save was on its way: then the draft is finished.
      if (this._done) return this.draftCode;
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
      this.set(s.id, toggleCheck((this._answers[s.id] as string[]) ?? [], value, checked));
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

  private audioRef(stepId: string): string | null {
    const v = this._answers[`${stepId}__audio`];
    return typeof v === 'string' && v !== PENDING && v !== 'recorded' ? v : null;
  }

  private dropAnswer(key: string) {
    const rest = { ...this._answers };
    delete rest[key];
    this._answers = rest;
  }

  private async toggleVoice(s: Step) {
    if (!Recorder.supported()) {
      this._status = this.t.micBlocked;
      return;
    }
    this.stopPlaying();
    if (this.recorder.recording) {
      const { blob, seconds } = await this.recorder.stop();
      this._recording = false;
      const old = this.previews.get(s.id);
      if (old) URL.revokeObjectURL(old);
      this.previews.set(s.id, URL.createObjectURL(blob));
      this._status = this.t.savingRec;
      try {
        const id = await store.uploadRecording(blob);
        this.recordings.delete(s.id);
        this.set(`${s.id}__audio`, id);
        this._status = this.t.recorded(seconds);
      } catch {
        // Offline: keep it on this phone; finish() sends it before the answers.
        this.recordings.set(s.id, blob);
        this.set(`${s.id}__audio`, PENDING);
        this._status = this.t.recPending;
      }
      void this.autosave();
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

  private stopPlaying() {
    this.player?.pause();
    this.player = null;
    this._playing = null;
    stopSpeaking();
  }

  private async playRecording(stepId: string) {
    if (this._playing === stepId) {
      this.stopPlaying();
      this._status = '';
      return;
    }
    this.stopPlaying();
    const ref = this.audioRef(stepId);
    let url = this.previews.get(stepId) ?? '';
    if (!url && ref) {
      try { url = await store.playable(ref); } catch { url = ''; }
    }
    if (!url) {
      this._status = this.t.playFailed;
      return;
    }
    const audio = new Audio(url);
    this.player = audio;
    this._playing = stepId;
    this._status = this.t.playing;
    audio.onended = () => {
      if (this.player === audio) this.stopPlaying();
      this._status = '';
    };
    audio.play().catch(() => {
      if (this.player === audio) this.stopPlaying();
      this._status = this.t.playFailed;
    });
  }

  private deleteRecording(s: Step) {
    this.stopPlaying();
    this.recordings.delete(s.id);
    const url = this.previews.get(s.id);
    if (url) URL.revokeObjectURL(url);
    this.previews.delete(s.id);
    this.dropAnswer(`${s.id}__audio`);
    this._status = this.t.deleted;
    this.focusTarget = 'voice'; // the Delete button is gone: put focus back on the voice button
    void this.autosave();
  }

  /** Send recordings that were kept on this phone while offline. */
  private async flushRecordings() {
    for (const [stepId, blob] of [...this.recordings]) {
      const id = await store.uploadRecording(blob);
      this.recordings.delete(stepId);
      this.set(`${stepId}__audio`, id);
    }
  }

  private hasPrompt(s: Step) {
    return this._media.audio[this._lang].includes(s.id);
  }

  /** The human recording if there is one, otherwise the phone's own voice (never both). */
  private play(s: Step) {
    this.stopPlaying();
    if (this.hasPrompt(s)) {
      const audio = new Audio(`${assetsBase()}audio/${this._lang}/${s.id}.opus`);
      this.player = audio;
      audio.play().catch(() => {
        if (!this.speakStep(s)) this._status = this.t.playFailed;
      });
      return;
    }
    if (!this.speakStep(s)) this._status = this.t.playFailed;
  }

  private speakStep(s: Step) {
    const lang = this._lang;
    const parts = [text(s.title, lang), text(s.hint, lang), ...optionsFor(s).map((o) => text(o.label, lang))];
    return speak(parts.filter(Boolean).join('. '), lang);
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
    if (!v && this._answers[`${s.id}__audio`]) return this.t.voiceAnswer;
    return (v as string) || '—';
  }

  // ---------- finish ----------
  private async finish() {
    const a = this._answers;
    const str = (k: string) => String(a[k] ?? '').trim();
    this._busy = true;
    this._status = this.t.sending;
    try {
      await this.flushRecordings();
      if (this.flow === 'signup') {
        const { learner, linkToken } = await store.createLearner({
          name: str('name'),
          nameAudio: this.audioRef('name'),
          phone: normalisePhone(str('phone')) ?? str('phone'),
          language: (a.language as Lang) ?? this._lang,
          dobEthiopian: (a.dob as EthDate) ?? null,
          accessPreferences: (a.ways as string[]) ?? [],
          supportNeeds: realNeeds(a.supportNeeds as string[]),
          idType: a.idType as Learner['idType'],
          idNumber: str('idNumber') || null,
          partner: a.idType === 'partner' ? (a.partner as string) : null,
          shareWithHost: a.shareWithHost === 'yes',
        });
        this.dropDraft();
        this._done = { learner };
        // linkToken: the host's server exchanges it once at POST /v1/link to link this learner to its own account.
        this.emit('lehulu:signup-complete', { learnerId: learner.id, idStatus: learner.idStatus, linkToken });
        if (learner.shareWithHost) {
          this.emit('lehulu:preferences', { language: learner.language, accessPreferences: learner.accessPreferences });
        }
      } else if (this.flow === 'apply') {
        if (!session.get() || !this.jobId) throw new FieldError(this.t.signUpFirst);
        const shared = a.shareSupport === 'yes';
        await store.apply({ jobId: this.jobId, why: str('why'), whyAudio: this.audioRef('why'), shareSupport: shared });
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
        <p class="step">${this.t.question(i + 1, steps.length)}</p>
        <div class="bar" aria-hidden="true"><span style="width:${Math.round((100 * (i + 1)) / steps.length)}%"></span></div>
        ${m.tiles && s.icon ? html`<div class="bigicon" aria-hidden="true">${icon(s.icon, 'i')}</div>` : nothing}
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
    // Only buttons that work: a recorded prompt, or the phone's own voice in this language.
    if ((force || m.playPrompt) && (this.hasPrompt(s) || canSpeak(this._lang))) {
      parts.push(html`<div class="row"><button type="button" class="small" @click=${() => this.play(s)}>${icon('volume')} ${this.t.play}</button></div>`);
    }
    if ((force || m.signClips) && this._media.sign.includes(s.id)) {
      const key = `sign:${s.id}`;
      if (this._missing.has(key)) {
        // The clip is listed but failed to load: show nothing rather than a broken player.
      } else if (m.lazyMedia && !this._signLoaded) {
        parts.push(html`<div class="row"><button type="button" class="small" @click=${() => (this._signLoaded = true)}>${icon('hand')} ${this.t.loadSign}</button></div>`);
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
        const voice = s.type === 'text' ? this.voiceRow(s) : nothing;
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
                  ${o.icon ? html`<span class="ico" aria-hidden="true">${icon(o.icon)}</span>` : nothing}
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
                  <span class="row">
                    ${this._answers[`${x.id}__audio`]
                      ? html`<button type="button" class="small" aria-label="${this._playing === x.id ? this.t.stopPlaying : this.t.playRec}: ${name}" @click=${() => this.playRecording(x.id)}>
                          ${icon(this._playing === x.id ? 'stop' : 'play')} ${this._playing === x.id ? this.t.stopPlaying : this.t.playRec}
                        </button>`
                      : nothing}
                    <button type="button" class="small" aria-label="${this.t.change}: ${name}" @click=${() => this.edit(x.id)}>${this.t.change}</button>
                  </span>
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

  /** Voice answer controls. The first button stays the same element (Answer → Stop → Record again)
   * so keyboard focus is never lost while recording. */
  private voiceRow(s: Step) {
    const t = this.t;
    const has = Boolean(this._answers[`${s.id}__audio`]);
    const rec = this._recording;
    const first = rec ? t.stop : has ? t.reRecord : t.voice;
    const big = this.modes.voiceFirst && !has && !rec;
    return html`<div class="row">
      <button type="button" data-voice class=${big ? 'primary grow' : 'small'} @click=${() => this.toggleVoice(s)}>
        ${icon(rec ? 'stop' : 'mic')} ${first}
      </button>
      ${has && !rec
        ? html`<button type="button" class="small" @click=${() => this.playRecording(s.id)}>
              ${icon(this._playing === s.id ? 'stop' : 'play')} ${this._playing === s.id ? t.stopPlaying : t.playMine}
            </button>
            <button type="button" class="small" @click=${() => this.deleteRecording(s)}>${icon('trash')} ${t.deleteRec}</button>`
        : nothing}
    </div>`;
  }

  private renderNav(i: number, n: number) {
    const last = i === n - 1;
    const label = this._returnToReview ? this.t.save : last ? text(this.def.finish, this._lang) || this.t.next : `${this.t.next} →`;
    return html`
      <div class="row">
        ${i > 0 && !this._returnToReview ? html`<button type="button" class="grow" @click=${this.back}>${icon('arrowLeft')} ${this.t.back}</button>` : nothing}
        <button type="button" class="primary grow" aria-disabled=${this._busy ? 'true' : nothing} @click=${this.next}>${label}</button>
      </div>
      ${this.flow === 'signup' && !last ? html`<div class="row"><button type="button" class="small" @click=${this.later}>${icon('save')} ${this.t.later}</button></div>` : nothing}
    `;
  }

  private renderDone() {
    const t = this.t;
    const heading = (s: string, describedBy?: string) =>
      html`<h2 id="${this.uid}-done" tabindex="-1" aria-describedby=${describedBy ?? nothing}>${s}</h2>`;
    if (this.flow === 'signup') {
      const l = this._done!.learner!;
      // Read together with the heading when focus lands on it: the ID status, and that the site now adapts.
      const said = [`${this.uid}-id`, l.shareWithHost ? `${this.uid}-adapt` : ''].filter(Boolean).join(' ');
      return html`<section class="card" lang=${this._lang} aria-labelledby="${this.uid}-done">
        ${heading(t.done.signup, said)}
        <p class="ok" id="${this.uid}-id">${t.idStatus[l.idStatus] ?? ''}</p>
        ${l.shareWithHost ? html`<p class="ok" id="${this.uid}-adapt">${icon('sparkles')} ${t.adapted}</p>` : nothing}
        <div class="row">
          <a class="btn primary grow" href=${this.jobsUrl}>${icon('briefcase')} ${t.findJobs}</a>
          <a class="btn grow" href=${this.profileUrl}>${icon('user')} ${t.profile}</a>
        </div>
        <button type="button" @click=${() => this.emit('lehulu:start-lesson', { learnerId: l.id })}>${icon('book')} ${t.startLesson}</button>
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
