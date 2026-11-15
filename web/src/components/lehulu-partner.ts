// <lehulu-partner lang="am|en">: a partner (for example AAAPD) signs in, confirms learners who have no ID
// document, and registers a learner who is with them (the learner agrees with an SMS code).

import { LitElement, html, nothing } from 'lit';
import signupFlow from '@flows/signup.json';
import { base } from './styles';
import { icon } from '../engine/icons';
import { FieldError, playables, staff, store, useApiBase, type NewRegistration, type StaffSession, type VouchRequest } from '../data/store';
import { NEEDS, optionsFor } from '../engine/flow';
import { text } from '../engine/i18n';
import { day, langOf, words } from '../engine/screens';
import { normalisePhone } from '../engine/validators';
import type { Flow, Lang } from '../engine/types';
// <audio> cannot take a <label>, so aria-label names each player for screen readers.

const step = (id: string) => (signupFlow as Flow).steps.find((s) => s.id === id)!;

export class LehuluPartner extends LitElement {
  static styles = base;
  static properties = {
    _me: { state: true }, _reqs: { state: true }, _urls: { state: true }, _status: { state: true },
    _lang: { state: true }, _error: { state: true }, _decided: { state: true }, _regError: { state: true }, _regField: { state: true }, _regStatus: { state: true },
  };
  declare _me: StaffSession | null;
  declare _reqs: VouchRequest[];
  declare _urls: Record<string, string>;
  declare _status: string;
  declare _lang: Lang;
  declare _error: string;
  declare _regError: string;
  declare _regField: string;
  declare _regStatus: string;
  private regLang: Lang = 'am';
  /** Requests answered in this session (shown as a summary number). */
  declare _decided: number;

  constructor() {
    super();
    this._me = null;
    this._reqs = [];
    this._urls = {};
    this._status = '';
    this._lang = 'en';
    this._error = '';
    this._regError = '';
    this._regField = '';
    this._regStatus = '';
    this._decided = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    useApiBase(this);
    this._lang = langOf(this);
    this._me = staff.get('partner');
    void this.load();
  }

  private signedIn = async () => {
    this._me = staff.get('partner');
    await this.load();
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>('#p-h')?.focus();
  };

  private signOut = async () => {
    staff.clear('partner');
    this._me = null;
    this._reqs = [];
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>('lehulu-staff-sign-in')?.shadowRoot?.querySelector<HTMLElement>('#staff-h')?.focus();
  };

  private async load() {
    if (!this._me) return;
    try {
      this._reqs = await store.listVouches(this._me.id);
      this._urls = await playables(this._reqs.map((r) => r.nameAudio), 'partner');
      this._error = '';
    } catch (e) {
      this._error = (e as Error).message;
      this._me = staff.get('partner');
    }
  }

  private async decide(r: VouchRequest, decision: 'confirm' | 'decline') {
    const w = words(this._lang);
    try {
      await store.decideVouch(this._me!.id, r.learnerId, decision);
      const who = r.name || w.theLearner;
      this._status = decision === 'confirm' ? w.confirmed(who) : w.declined(who);
      this._decided++;
    } catch (e) {
      this._status = (e as Error).message;
    }
    await this.load();
    this.renderRoot.querySelector<HTMLElement>('#p-h')?.focus();
  }

  private async register(e: Event) {
    e.preventDefault();
    const w = words(this._lang);
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const phone = normalisePhone(String(data.get('phone') ?? ''));
    const fail = async (message: string, field: string) => {
      this._regError = message;
      this._regField = field;
      this._regStatus = '';
      await this.updateComplete;
      this.renderRoot.querySelector<HTMLElement>(`#reg-${field}`)?.focus();
    };
    if (!name) return fail(w.learnerNameRequired, 'name');
    if (!phone) return fail(w.phoneInvalid, 'phone');
    const reg: NewRegistration = {
      name,
      phone,
      language: data.get('language') === 'en' ? 'en' : 'am',
      accessPreferences: data.getAll('ways').map(String),
      supportNeeds: data.getAll('needs').map(String),
    };
    try {
      const r = await store.registerLearner(this._me!.id, reg);
      this._regError = '';
      this._regField = '';
      this._regStatus = r.demoCode ? `${r.message} ${w.regDemoCode(r.demoCode)}` : r.message;
      form.reset();
    } catch (err) {
      const f = err instanceof FieldError ? err : new FieldError(String(err));
      await fail(f.message, f.field === 'phone' ? 'phone' : 'name');
    }
  }

  private renderRegister() {
    const w = words(this._lang);
    const lang = this._lang;
    const bad = (f: string) => (this._regError && this._regField === f ? 'true' : nothing);
    const described = (f: string) => (this._regError && this._regField === f ? 'reg-err' : nothing);
    return html`<section class="card" aria-labelledby="reg-h">
      <h2 id="reg-h">${w.registerTitle}</h2>
      <p class="hint">${w.registerIntro}</p>
      <form @submit=${this.register} novalidate style="display:grid;gap:1rem">
        <div style="display:grid;gap:.35rem">
          <label class="field-label" for="reg-name">${w.learnerName}</label>
          <input id="reg-name" name="name" type="text" autocomplete="off" aria-invalid=${bad('name')} aria-describedby=${described('name')} />
        </div>
        <div style="display:grid;gap:.35rem">
          <label class="field-label" for="reg-phone">${w.learnerPhone}</label>
          <p id="reg-phone-hint" class="hint">${w.phoneHint}</p>
          <input id="reg-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" aria-invalid=${bad('phone')}
            aria-describedby=${this._regError && this._regField === 'phone' ? 'reg-phone-hint reg-err' : 'reg-phone-hint'} />
        </div>
        <fieldset>
          <legend><strong>${w.language}</strong></legend>
          <div class="choices">
            ${optionsFor(step('language')).map((o, k) => html`<label class="choice" for="reg-lang-${k}">
              <input id="reg-lang-${k}" type="radio" name="language" .value=${o.value} ?checked=${o.value === this.regLang} />
              <span lang=${o.lang ?? nothing}>${text(o.label, lang)}</span></label>`)}
          </div>
        </fieldset>
        <details class="fold">
        <summary>${w.moreAbout}</summary>
        <div style="display:grid;gap:1rem">
        <fieldset>
          <legend><strong>${w.learnerWays}</strong></legend>
          <div class="choices">
            ${optionsFor(step('ways')).map((o, k) => html`<label class="choice" for="reg-way-${k}">
              <input id="reg-way-${k}" type="checkbox" name="ways" .value=${o.value} />
              ${o.icon ? html`<span class="ico" aria-hidden="true">${icon(o.icon)}</span>` : nothing}<span>${text(o.label, lang)}</span></label>`)}
          </div>
        </fieldset>
        <fieldset>
          <legend><strong>${w.learnerNeeds}</strong></legend>
          <div class="choices">
            ${NEEDS.needs.map((n, k) => html`<label class="choice" for="reg-need-${k}">
              <input id="reg-need-${k}" type="checkbox" name="needs" .value=${n.id} />
              <span class="ico" aria-hidden="true">${icon(n.icon)}</span><span>${text(n.label, lang)}</span></label>`)}
          </div>
        </fieldset>
        </div>
        </details>
        ${this._regError ? html`<p id="reg-err" class="error" role="alert">${this._regError}</p>` : nothing}
        <button type="submit" class="primary">${w.sendRegistration}</button>
        <p class="status" role="status">${this._regStatus}</p>
      </form>
    </section>`;
  }

  render() {
    const w = words(this._lang);
    if (!this._me) {
      return html`<lehulu-staff-sign-in kind="partner" lang=${this._lang} @lehulu:staff-signed-in=${this.signedIn}></lehulu-staff-sign-in>`;
    }
    return html`<div style="display:grid;gap:1.25rem" lang=${this._lang}>
      <section class="card" aria-labelledby="p-h">
        <div class="head">
          <h2 id="p-h" tabindex="-1">${w.requestsTitle}</h2>
          <div class="row">
            <span class="pill">${icon('users')} ${w.signedInAs(this._me.name)}</span>
            <button type="button" class="small" @click=${this.signOut}>${w.signOut}</button>
          </div>
        </div>
        <div class="stats">
          <div class="stat accent"><span class="n">${this._reqs.length}</span><span class="l">${w.waitingN}</span></div>
          <div class="stat"><span class="n">${this._decided}</span><span class="l">${w.confirmedN}</span></div>
        </div>
        ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
        <p role="status" class="status">${this._status}</p>
        ${this._reqs.length === 0
          ? html`<div class="empty">${icon('inbox')}<p>${w.noRequests}</p></div>`
          : html`<ul style="list-style:none;margin:0;padding:0;display:grid;gap:.6rem">
              ${this._reqs.map((r) => html`<li class="card" style="gap:.4rem">
                <div class="head"><h3>${r.name || w.voiceName} · ${r.phone}</h3><span class="pill wait">${w.waitingPill}</span></div>
                ${r.nameAudio && this._urls[r.nameAudio]
                  ? html`<audio controls preload="none" src=${this._urls[r.nameAudio]} aria-label=${w.nameAudio}></audio>`
                  : nothing}
                <p class="meta">${w.asked(day(r.requestedAt, this._lang))}</p>
                <div class="row">
                  <button type="button" class="primary" @click=${() => this.decide(r, 'confirm')}>${w.confirm}</button>
                  <button type="button" @click=${() => this.decide(r, 'decline')}>${w.decline}</button>
                </div>
              </li>`)}
            </ul>`}
      </section>
      ${this.renderRegister()}
    </div>`;
  }
}
