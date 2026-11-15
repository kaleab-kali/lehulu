// <lehulu-profile lang="am|en" signup-url="...">: sign in with phone + SMS code (with an account chooser for
// shared phones), see and change each answer, choose whether the host platform adapts, sign out, delete.
// Fires `lehulu:signed-in` ({ learnerId, linkToken }) and `lehulu:preferences` when the learner agreed.

import { LitElement, html, nothing, type TemplateResult } from 'lit';
import signupFlow from '@flows/signup.json';
import { base } from './styles';
import { icon } from '../engine/icons';
import { NEEDS, needLabel, optionsFor } from '../engine/flow';
import { text, ui } from '../engine/i18n';
import { langOf, words } from '../engine/screens';
import { normalisePhone } from '../engine/validators';
import { FieldError, playables, session, store, useApiBase, type AccountChoice, type Learner, type NewLearner } from '../data/store';
import type { Flow, Lang } from '../engine/types';
// <audio> cannot take a <label>, so aria-label names each player for screen readers.

const step = (id: string) => (signupFlow as Flow).steps.find((s) => s.id === id)!;
type Field = 'name' | 'phone' | 'language' | 'ways' | 'supportNeeds' | 'shareWithHost';

export class LehuluProfile extends LitElement {
  static styles = base;
  static properties = {
    signupUrl: { type: String, attribute: 'signup-url' },
    _l: { state: true }, _lang: { state: true }, _status: { state: true }, _error: { state: true }, _edit: { state: true },
    _confirmDelete: { state: true }, _phase: { state: true }, _choices: { state: true }, _field: { state: true }, _urls: { state: true },
  };
  declare signupUrl: string;
  declare _l: Learner | null;
  declare _lang: Lang;
  declare _status: string;
  declare _error: string;
  declare _edit: Field | null;
  declare _confirmDelete: boolean;
  declare _phase: 'phone' | 'code' | 'choose';
  declare _choices: AccountChoice[];
  declare _field: string;
  declare _urls: Record<string, string>;
  private phone = '';
  private code = '';
  private focusSel: string | null = null;

  constructor() {
    super();
    this.signupUrl = '../';
    this._l = null;
    this._lang = 'en';
    this._status = '';
    this._error = '';
    this._edit = null;
    this._confirmDelete = false;
    this._phase = 'phone';
    this._choices = [];
    this._field = '';
    this._urls = {};
  }

  private onSession = () => {
    if (session.get() !== (this._l?.id ?? null)) void this.load();
  };

  connectedCallback() {
    super.connectedCallback();
    useApiBase(this);
    this._lang = langOf(this);
    document.addEventListener('lehulu:session-changed', this.onSession);
    void this.load();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('lehulu:session-changed', this.onSession);
  }

  updated() {
    if (!this.focusSel) return;
    this.renderRoot.querySelector<HTMLElement>(this.focusSel)?.focus();
    this.focusSel = null;
  }

  private async load() {
    if (!session.get()) {
      this._l = null;
      return;
    }
    try {
      this.show(await store.me());
    } catch {
      this._l = null;
    }
  }

  private show(l: Learner) {
    this._l = l;
    this._lang = l.language;
    void playables([l.nameAudio], 'learner').then((u) => (this._urls = u));
  }

  private emit(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private fail(message: string, field: string) {
    this._error = message;
    this._field = field;
    this._status = '';
    this.focusSel = `#${field}`;
  }

  // ---------- sign in ----------
  private async sendCode(e: Event) {
    e.preventDefault();
    const w = words(this._lang);
    const raw = (this.renderRoot.querySelector<HTMLInputElement>('#si-phone')?.value ?? '').trim();
    const phone = normalisePhone(raw);
    if (!phone) return this.fail(w.phoneInvalid, 'si-phone');
    try {
      const r = await store.requestCode(phone);
      this.phone = phone;
      this._error = '';
      this._phase = 'code';
      this._status = r.demoCode ? `${r.message} ${w.demoCode(r.demoCode)}` : r.message;
      this.focusSel = '#si-code';
    } catch (err) {
      this.fail((err as Error).message, 'si-phone');
    }
  }

  private async verify(e: Event) {
    e.preventDefault();
    const w = words(this._lang);
    if (this._phase === 'code') {
      this.code = (this.renderRoot.querySelector<HTMLInputElement>('#si-code')?.value ?? '').replace(/\D/g, '');
      if (this.code.length !== 6) return this.fail(w.codeInvalid, 'si-code');
    }
    let chosen: string | undefined;
    if (this._phase === 'choose') {
      chosen = this.renderRoot.querySelector<HTMLInputElement>('input[name="account"]:checked')?.value;
      if (!chosen) return this.fail(w.choose, 'si-acc-0');
    }
    try {
      const r = await store.verifyCode(this.phone, this.code, chosen);
      if ('choose' in r) {
        this._choices = r.choose;
        this._phase = 'choose';
        this._error = '';
        this._status = '';
        this.focusSel = '#si-choose';
        return;
      }
      const l = r.signedIn.learner;
      this.show(l);
      this._phase = 'phone';
      this._error = '';
      this._status = r.registered ? words(l.language).registered : words(l.language).welcomeBack;
      this.focusSel = '#pr-h';
      this.emit('lehulu:signed-in', { learnerId: l.id, linkToken: r.signedIn.linkToken });
      if (l.shareWithHost) this.emit('lehulu:preferences', { language: l.language, accessPreferences: l.accessPreferences });
    } catch (err) {
      const f = err instanceof FieldError ? err : new FieldError(String(err));
      if (f.field === 'phone' || f.code === 'no_account') {
        this._phase = 'phone';
        this.fail(f.message, 'si-phone');
      } else {
        this.fail(f.message, this._phase === 'choose' ? 'si-acc-0' : 'si-code');
      }
    }
  }

  private restart = () => {
    this._phase = 'phone';
    this._error = '';
    this._status = '';
    this.focusSel = '#si-phone';
  };

  private renderSignIn() {
    const w = words(this._lang);
    const bad = (f: string) => (this._error && this._field === f ? 'true' : nothing);
    const err = this._error ? html`<p id="si-err" class="error" role="alert">${this._error}</p>` : nothing;
    let body: TemplateResult;
    if (this._phase === 'phone') {
      body = html`<form @submit=${this.sendCode} novalidate style="display:grid;gap:.75rem">
        <label class="field-label" for="si-phone">${w.phone}</label>
        <p id="si-phone-hint" class="hint">${w.phoneHint}</p>
        <input id="si-phone" type="tel" inputmode="tel" autocomplete="tel-national" .value=${this.phone}
          aria-invalid=${bad('si-phone')} aria-describedby=${this._error ? 'si-phone-hint si-err' : 'si-phone-hint'} />
        ${err}
        <button type="submit" class="primary">${w.sendCode}</button>
      </form>`;
    } else if (this._phase === 'code') {
      body = html`<form @submit=${this.verify} novalidate style="display:grid;gap:.75rem">
        <label class="field-label" for="si-code">${w.code}</label>
        <p id="si-code-hint" class="hint">${w.codeHint}</p>
        <input id="si-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8"
          aria-invalid=${bad('si-code')} aria-describedby=${this._error ? 'si-code-hint si-err' : 'si-code-hint'} />
        ${err}
        <div class="row">
          <button type="submit" class="primary grow">${w.verify}</button>
          <button type="button" class="small" @click=${this.restart}>${w.otherNumber}</button>
        </div>
      </form>`;
    } else {
      body = html`<form @submit=${this.verify} novalidate style="display:grid;gap:.75rem">
        <fieldset aria-describedby=${this._error ? 'si-err' : nothing}>
          <legend id="si-choose" tabindex="-1"><strong>${w.choose}</strong></legend>
          <div class="choices">
            ${this._choices.map((c, k) => html`<label class="choice" for="si-acc-${k}">
              <input id="si-acc-${k}" type="radio" name="account" .value=${c.id} />
              <span>${c.name || w.voiceName}</span></label>`)}
          </div>
        </fieldset>
        ${err}
        <button type="submit" class="primary">${w.verify}</button>
      </form>`;
    }
    return html`<section class="card" lang=${this._lang} aria-labelledby="pr-h">
      <h2 id="pr-h" tabindex="-1">${w.signInTitle}</h2>
      <p class="hint">${w.signInIntro}</p>
      ${body}
      <p class="status" role="status">${this._status}</p>
      <p>${w.noAccount} <a href=${this.signupUrl}>${w.signUp}</a></p>
    </section>`;
  }

  // ---------- profile ----------
  private startEdit(f: Field) {
    this._edit = f;
    this._error = '';
    this._status = '';
    this.focusSel = `#edit-${f}`;
  }

  private cancel = () => {
    const f = this._edit;
    this._edit = null;
    this._error = '';
    this.focusSel = `#change-${f}`;
  };

  private async saveEdit(e: Event) {
    e.preventDefault();
    const f = this._edit!;
    const w = words(this._lang);
    const root = this.renderRoot;
    const checked = (name: string) => [...root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((i) => i.value);
    let patch: Partial<NewLearner> = {};
    if (f === 'name') {
      const v = root.querySelector<HTMLInputElement>('#edit-name')!.value.trim();
      if (!v && !this._l?.nameAudio) return this.fail(w.nameRequired, 'edit-name');
      patch = { name: v };
    } else if (f === 'phone') {
      const v = normalisePhone(root.querySelector<HTMLInputElement>('#edit-phone')!.value);
      if (!v) return this.fail(w.phoneInvalid, 'edit-phone');
      patch = { phone: v };
    } else if (f === 'language') {
      patch = { language: checked('language')[0] === 'am' ? 'am' : 'en' };
    } else if (f === 'ways') {
      patch = { accessPreferences: checked('ways') };
    } else if (f === 'supportNeeds') {
      patch = { supportNeeds: checked('supportNeeds') };
    } else {
      patch = { shareWithHost: checked('shareWithHost')[0] === 'yes' };
    }
    try {
      const l = await store.updateMe(patch);
      this.show(l);
      this._edit = null;
      this._error = '';
      this._status = words(l.language).saved;
      this.focusSel = `#change-${f}`;
      if (l.shareWithHost && (f === 'ways' || f === 'language' || f === 'shareWithHost')) {
        this.emit('lehulu:preferences', { language: l.language, accessPreferences: l.accessPreferences });
      }
    } catch (err) {
      this.fail((err as Error).message, f === 'name' || f === 'phone' ? `edit-${f}` : `edit-${f}`);
    }
  }

  private signOut = async () => {
    await store.signOut();
    this._l = null;
    this._phase = 'phone';
    this._status = words(this._lang).signedOut;
    this.focusSel = '#pr-h';
  };

  private download = async () => {
    const w = words(this._lang);
    try {
      const data = await store.exportMe();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lehulu-my-data.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      this._status = w.downloaded;
    } catch (err) {
      this._error = (err as Error).message;
    }
  };

  private async deleteAccount() {
    const w = words(this._lang);
    try {
      await store.deleteMe();
      this._l = null;
      this._confirmDelete = false;
      this._status = w.deleted;
      this.focusSel = '#pr-h';
    } catch (err) {
      this._error = (err as Error).message;
    }
  }

  private editor(f: Field) {
    const w = words(this._lang);
    const l = this._l!;
    const lang = this._lang;
    const err = this._error ? html`<p id="ed-err" class="error" role="alert">${this._error}</p>` : nothing;
    const buttons = html`<div class="row"><button type="submit" class="primary">${w.save}</button><button type="button" @click=${this.cancel}>${w.cancel}</button></div>`;
    const group = (legend: string, type: 'radio' | 'checkbox', name: string, opts: { value: string; label: string; icon?: string; lang?: string }[], on: (v: string) => boolean) => html`
      <fieldset aria-describedby=${this._error ? 'ed-err' : nothing}>
        <legend id="edit-${f}" tabindex="-1"><strong>${legend}</strong></legend>
        <div class="choices">
          ${opts.map((o, k) => html`<label class="choice" for="${name}-${k}">
            <input id="${name}-${k}" type=${type} name=${name} .value=${o.value} ?checked=${on(o.value)} />
            ${o.icon ? html`<span class="ico" aria-hidden="true">${icon(o.icon)}</span>` : nothing}<span lang=${o.lang ?? nothing}>${o.label}</span></label>`)}
        </div>
      </fieldset>`;
    let body: TemplateResult;
    if (f === 'name' || f === 'phone') {
      body = html`<label class="field-label" for="edit-${f}">${f === 'name' ? w.name : w.phone}</label>
        <input id="edit-${f}" type=${f === 'name' ? 'text' : 'tel'} inputmode=${f === 'phone' ? 'tel' : nothing}
          autocomplete=${f === 'name' ? 'name' : 'tel-national'} .value=${f === 'name' ? l.name : l.phone}
          aria-invalid=${this._error ? 'true' : nothing} aria-describedby=${this._error ? 'ed-err' : nothing} />`;
    } else if (f === 'language') {
      body = group(w.language, 'radio', 'language', optionsFor(step('language')).map((o) => ({ value: o.value, label: text(o.label, lang), lang: o.lang })), (v) => v === l.language);
    } else if (f === 'ways') {
      body = group(w.ways, 'checkbox', 'ways', optionsFor(step('ways')).map((o) => ({ value: o.value, label: text(o.label, lang), icon: o.icon })), (v) => l.accessPreferences.includes(v));
    } else if (f === 'supportNeeds') {
      body = group(w.support, 'checkbox', 'supportNeeds', NEEDS.needs.map((n) => ({ value: n.id, label: text(n.label, lang), icon: n.icon })), (v) => l.supportNeeds.includes(v));
    } else {
      body = group(w.share, 'radio', 'shareWithHost', [{ value: 'yes', label: w.shareYes }, { value: 'no', label: w.shareNo }], (v) => (v === 'yes') === l.shareWithHost);
    }
    return html`<form @submit=${this.saveEdit} novalidate style="display:grid;gap:.6rem;width:100%">${body}${err}${buttons}</form>`;
  }

  private row(f: Field, label: string, value: TemplateResult | string) {
    const w = words(this._lang);
    if (this._edit === f) return html`<div><dt>${label}</dt><dd>${this.editor(f)}</dd></div>`;
    return html`<div><dt>${label}</dt><dd>
      <span>${value}</span>
      <button type="button" class="small" id="change-${f}" aria-label="${w.change}: ${label}" @click=${() => this.startEdit(f)}>${w.change}</button>
    </dd></div>`;
  }

  render() {
    const l = this._l;
    if (!l) return this.renderSignIn();
    const w = words(this._lang);
    const lang = this._lang;
    const wayLabel = (v: string) => text(optionsFor(step('ways')).find((o) => o.value === v)?.label, lang);
    const langLabel = text(optionsFor(step('language')).find((o) => o.value === l.language)?.label, lang);
    const nameUrl = l.nameAudio ? this._urls[l.nameAudio] : '';
    return html`<section class="card" lang=${lang} aria-labelledby="pr-h">
      <h2 id="pr-h" tabindex="-1">${w.profileTitle}</h2>
      <p role="status" class="status">${this._status}</p>
      <dl>
        ${this.row('name', w.name, html`${l.name || w.voiceName}${nameUrl ? html`<audio controls preload="none" src=${nameUrl} aria-label=${w.yourNameAudio}></audio>` : nothing}`)}
        ${this.row('phone', w.phone, l.phone)}
        ${this.row('language', w.language, langLabel)}
        ${this.row('ways', w.ways, l.accessPreferences.map(wayLabel).join(', ') || w.none)}
        ${this.row('supportNeeds', w.support, l.supportNeeds.map((n) => needLabel(n, lang)).join(', ') || w.none)}
        ${this.row('shareWithHost', w.share, l.shareWithHost ? w.shareYes : w.shareNo)}
        <div><dt>${w.idStatus}</dt><dd>${ui(lang).idStatus[l.idStatus] ?? ''}</dd></div>
      </dl>
      ${this._error && !this._edit ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      ${this._confirmDelete
        ? html`<div class="card" role="group" aria-labelledby="del-h">
            <p id="del-h"><strong>${w.deleteWarn}</strong></p>
            <div class="row">
              <button type="button" id="del-yes" @click=${() => this.deleteAccount()}>${w.deleteYes}</button>
              <button type="button" class="primary" @click=${() => { this._confirmDelete = false; this.focusSel = '#del'; }}>${w.deleteNo}</button>
            </div>
          </div>`
        : html`<div class="row">
            <button type="button" @click=${this.download}>${w.download}</button>
            <button type="button" @click=${this.signOut}>${w.signOut}</button>
            <button type="button" id="del" @click=${() => { this._confirmDelete = true; this.focusSel = '#del-yes'; }}>${w.deleteAccount}</button>
          </div>`}
    </section>`;
  }
}
