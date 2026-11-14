// <lehulu-partner>: a partner (for example AAAPD) confirms learners who have no ID document.
// TODO(F13): sign in with the partner's OAuth client credentials instead of choosing from a list.

import { LitElement, html, nothing } from 'lit';
import { base } from './styles';
import { store, type Partner, type VouchRequest } from '../data/store';

export class LehuluPartner extends LitElement {
  static styles = base;
  static properties = { _partners: { state: true }, _partner: { state: true }, _reqs: { state: true }, _status: { state: true } };
  declare _partners: Partner[];
  declare _partner: string;
  declare _reqs: VouchRequest[];
  declare _status: string;

  constructor() {
    super();
    this._partners = [];
    this._partner = '';
    this._reqs = [];
    this._status = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    this._partners = await store.listPartners();
    this._partner = this._partners[0]?.id ?? '';
    await this.load();
  }

  private async load() {
    this._reqs = this._partner ? await store.listVouches(this._partner) : [];
  }

  private async decide(r: VouchRequest, decision: 'confirm' | 'decline') {
    await store.decideVouch(this._partner, r.learnerId, decision);
    this._status =
      decision === 'confirm'
        ? `Confirmed. ${r.name}’s ID status is now “confirmed by partner”.`
        : `Marked “I don’t know this person”. ${r.name} keeps learning and can choose another ID route.`;
    await this.load();
    this.renderRoot.querySelector<HTMLElement>('h2')?.focus();
  }

  render() {
    return html`<section class="card" aria-labelledby="p-h">
      <h2 id="p-h" tabindex="-1">Requests to confirm a learner</h2>
      <label class="field-label" for="partner">Partner organisation</label>
      <select id="partner" @change=${async (e: Event) => { this._partner = (e.target as HTMLSelectElement).value; await this.load(); }}>
        ${this._partners.map((p) => html`<option value=${p.id} ?selected=${p.id === this._partner}>${p.name}</option>`)}
      </select>
      <p role="status" class="status">${this._status}</p>
      ${this._reqs.length === 0
        ? html`<p>No requests waiting. They appear here when a learner chooses “No document. A partner can vouch for me.”</p>`
        : html`<ul style="list-style:none;margin:0;padding:0;display:grid;gap:.6rem">
            ${this._reqs.map((r) => html`<li class="card" style="gap:.4rem">
              <h3>${r.name} · ${r.phone}</h3>
              <p class="meta">Asked on ${new Date(r.requestedAt).toLocaleString()}. No document attached.</p>
              <div class="row">
                <button type="button" class="primary" @click=${() => this.decide(r, 'confirm')}>I know this person, confirm</button>
                <button type="button" @click=${() => this.decide(r, 'decline')}>I don’t know this person</button>
              </div>
            </li>`)}
          </ul>`}
      ${nothing}
    </section>`;
  }
}
