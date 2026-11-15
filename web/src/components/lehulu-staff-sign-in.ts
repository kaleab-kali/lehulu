// <lehulu-staff-sign-in kind="partner|employer" lang="am|en">: OAuth 2.0 client credentials sign-in for
// partner and employer staff. Fires `lehulu:staff-signed-in` ({ kind, id, name }) when it works.

import { LitElement, html, nothing } from 'lit';
import { base } from './styles';
import { FieldError, store, useApiBase, type StaffKind } from '../data/store';
import { langOf, words } from '../engine/screens';
import type { Lang } from '../engine/types';

export class LehuluStaffSignIn extends LitElement {
  static styles = base;
  static properties = { kind: { type: String }, _lang: { state: true }, _error: { state: true }, _field: { state: true }, _busy: { state: true } };
  declare kind: StaffKind;
  declare _lang: Lang;
  declare _error: string;
  declare _field: 'clientId' | 'secret' | '';
  declare _busy: boolean;

  constructor() {
    super();
    this.kind = 'partner';
    this._lang = 'en';
    this._error = '';
    this._field = '';
    this._busy = false;
  }

  connectedCallback() {
    super.connectedCallback();
    useApiBase(this);
    this._lang = langOf(this);
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (this._busy) return;
    const w = words(this._lang);
    const root = this.renderRoot as ShadowRoot;
    const id = root.querySelector<HTMLInputElement>('#client-id')!.value;
    const secret = root.querySelector<HTMLInputElement>('#client-secret')!.value;
    if (!id.trim() || !secret.trim()) {
      return this.fail(w.staffRequired, id.trim() ? 'secret' : 'clientId');
    }
    this._busy = true;
    try {
      const s = await store.staffSignIn(this.kind, id, secret);
      this.dispatchEvent(new CustomEvent('lehulu:staff-signed-in', { detail: { kind: s.kind, id: s.id, name: s.name }, bubbles: true, composed: true }));
    } catch (err) {
      const f = err instanceof FieldError ? err : new FieldError(w.staffRequired);
      await this.fail(f.message, f.field === 'clientId' ? 'clientId' : 'secret');
    } finally {
      this._busy = false;
    }
  }

  private async fail(message: string, field: 'clientId' | 'secret') {
    this._error = message;
    this._field = field;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLInputElement>(field === 'clientId' ? '#client-id' : '#client-secret')?.focus();
  }

  render() {
    const w = words(this._lang);
    const bad = (f: string) => (this._error && this._field === f ? 'true' : nothing);
    const described = (f: string) => (this._error && this._field === f ? 'staff-err' : nothing);
    return html`<section class="card" lang=${this._lang} aria-labelledby="staff-h">
      <h2 id="staff-h" tabindex="-1">${this.kind === 'partner' ? w.partnerSignIn : w.employerSignIn}</h2>
      <p class="hint">${w.staffIntro}</p>
      <form @submit=${this.submit} novalidate style="display:grid;gap:.9rem">
        <div style="display:grid;gap:.35rem">
          <label class="field-label" for="client-id">${w.clientId}</label>
          <input id="client-id" type="text" autocomplete="username" spellcheck="false" autocapitalize="none"
            aria-invalid=${bad('clientId')} aria-describedby=${described('clientId')} />
        </div>
        <div style="display:grid;gap:.35rem">
          <label class="field-label" for="client-secret">${w.secret}</label>
          <input id="client-secret" type="password" autocomplete="current-password"
            aria-invalid=${bad('secret')} aria-describedby=${described('secret')} />
        </div>
        ${this._error ? html`<p id="staff-err" class="error" role="alert">${this._error}</p>` : nothing}
        <button type="submit" class="primary" aria-disabled=${this._busy ? 'true' : nothing}>${w.verify}</button>
      </form>
    </section>`;
  }
}
