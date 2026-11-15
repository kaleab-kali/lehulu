// <lehulu-employer lang="am|en">: the employer screen in one tag. Sign in, post a job with the support it
// offers, and read the applications for your own jobs.

import { LitElement, html } from 'lit';
import { base } from './styles';
import { staff, useApiBase, type StaffSession } from '../data/store';
import { langOf, words } from '../engine/screens';
import type { Lang } from '../engine/types';

export class LehuluEmployer extends LitElement {
  static styles = base;
  static properties = { _me: { state: true }, _lang: { state: true } };
  declare _me: StaffSession | null;
  declare _lang: Lang;

  constructor() {
    super();
    this._me = null;
    this._lang = 'en';
  }

  connectedCallback() {
    super.connectedCallback();
    useApiBase(this);
    this._lang = langOf(this);
    this._me = staff.get('employer');
  }

  private signedIn = async () => {
    this._me = staff.get('employer');
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>('#e-h')?.focus();
  };

  private signOut = async () => {
    staff.clear('employer');
    this._me = null;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>('lehulu-staff-sign-in')?.shadowRoot?.querySelector<HTMLElement>('#staff-h')?.focus();
  };

  render() {
    const w = words(this._lang);
    if (!this._me) {
      return html`<lehulu-staff-sign-in kind="employer" lang=${this._lang} @lehulu:staff-signed-in=${this.signedIn}></lehulu-staff-sign-in>`;
    }
    return html`<div style="display:grid;gap:1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,28rem),1fr));align-items:start" lang=${this._lang}>
      <div class="row" style="grid-column:1/-1">
        <h2 id="e-h" tabindex="-1" style="font-size:1.1rem">${w.signedInAs(this._me.name)}</h2>
        <button type="button" class="small" @click=${this.signOut}>${w.signOut}</button>
      </div>
      <lehulu-signup flow="employer" lang=${this._lang}></lehulu-signup>
      <lehulu-applications lang=${this._lang}></lehulu-applications>
    </div>`;
  }
}
