// <lehulu-jobs lang="am|en">: job list with a private "support I need" filter.
// Filtering happens on this device; the learner's needs are not sent to the server to filter.

import { LitElement, html, nothing } from 'lit';
import { base } from './styles';
import { NEEDS, needLabel } from '../engine/flow';
import { session, store, type Job } from '../data/store';
import type { Lang } from '../engine/types';
import { text } from '../engine/i18n';

export class LehuluJobs extends LitElement {
  static styles = base;
  static properties = { _jobs: { state: true }, _want: { state: true }, _applying: { state: true }, _lang: { state: true }, _error: { state: true } };
  declare _jobs: Job[];
  declare _want: string[];
  declare _applying: Job | null;
  declare _lang: Lang;
  declare _error: string;
  private lastJobId: string | null = null;

  constructor() {
    super();
    this._jobs = [];
    this._want = [];
    this._applying = null;
    this._lang = 'en';
    this._error = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    this._lang = this.getAttribute('lang') === 'am' ? 'am' : 'en';
    try {
      this._jobs = await store.listJobs();
    } catch (e) {
      this._error = (e as Error).message;
    }
    const id = session.get();
    if (id) {
      try {
        const l = await store.getLearner(id);
        this._want = l.supportNeeds;
        this._lang = l.language;
      } catch { /* not signed up on this device */ }
    }
  }

  private score(j: Job) {
    return this._want.filter((w) => j.supportOffered.includes(w)).length;
  }

  private toggle(id: string, on: boolean) {
    const s = new Set(this._want);
    if (on) s.add(id);
    else s.delete(id);
    this._want = [...s];
  }

  private open(j: Job, e: Event) {
    e.preventDefault();
    this.lastJobId = j.id;
    this._applying = j;
  }

  private close = async () => {
    this._applying = null;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>(`a[data-job="${this.lastJobId}"]`)?.focus();
  };

  render() {
    const am = this._lang === 'am';
    if (this._applying) {
      return html`
        <div class="row"><button type="button" class="small" @click=${this.close}>← ${am ? 'ወደ ሥራዎች ተመለስ' : 'Back to jobs'}</button></div>
        <lehulu-signup flow="apply" job-id=${this._applying.id} lang=${this._lang} focus-on-load></lehulu-signup>
      `;
    }
    const want = this._want;
    const full = this._jobs.filter((j) => this.score(j) === want.length);
    const shown = this._jobs.filter((j) => !want.length || this.score(j) > 0).sort((a, b) => this.score(b) - this.score(a));
    const count = !want.length
      ? am ? `${shown.length} ሥራዎች።` : `${shown.length} jobs.`
      : am
        ? `${full.length} ሥራዎች የሚፈልጉትን ድጋፍ ሁሉ ይሰጣሉ። ${shown.length - full.length} ተጨማሪ በከፊል ይሰጣሉ።`
        : `${full.length} ${full.length === 1 ? 'job offers' : 'jobs offer'} all the support you need. ${shown.length - full.length} more offer some of it.`;
    return html`
      <section class="card" lang=${this._lang} aria-labelledby="jobs-h">
        <h2 id="jobs-h">${am ? 'ለእርስዎ የሚሆኑ ሥራዎች' : 'Jobs for you'}</h2>
        <fieldset>
          <legend><strong>${am ? 'የሚፈልጉትን ድጋፍ የሚሰጡ ሥራዎችን አሳይ' : 'Show jobs that offer the support I need'}</strong></legend>
          <div class="choices">
            ${NEEDS.needs.map((n, k) => html`<label class="choice" for="need-${k}">
              <input id="need-${k}" type="checkbox" .checked=${want.includes(n.id)} @change=${(e: Event) => this.toggle(n.id, (e.target as HTMLInputElement).checked)} />
              <span class="ico" aria-hidden="true">${n.icon}</span><span>${text(n.label, this._lang)}</span>
            </label>`)}
          </div>
        </fieldset>
        <p class="hint">${am ? 'ምርጫዎ በዚህ ስልክ ላይ ብቻ ይቀራል። ቀጣሪ የሚያየው ሲያመለክቱ ከፈቀዱ ብቻ ነው።' : 'Your choices stay on this device. An employer sees them only if you choose to share when you apply.'}</p>
        ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
        <p role="status"><strong>${count}</strong></p>
        <ul style="list-style:none;margin:0;padding:0;display:grid;gap:.75rem">
          ${shown.map((j) => html`<li class="card" style="gap:.35rem">
            <h3><a href="#apply-${j.id}" data-job=${j.id} @click=${(e: Event) => this.open(j, e)}>${j.title}</a></h3>
            <p class="meta">${j.org} · ${j.remote ? (am ? 'ከርቀት' : 'Remote') : j.city ?? ''}${want.length ? ` · ${am ? `ከ${want.length} ፍላጎቶችዎ ${this.score(j)} ይሰጣል` : `offers ${this.score(j)} of your ${want.length} needs`}` : ''}</p>
            <div>
              <span class="sr">${am ? 'የሚሰጥ ድጋፍ፦' : 'Support offered:'}</span>
              <ul class="tags">${j.supportOffered.map((s) => html`<li class="tag ${want.includes(s) ? 'ok' : ''}">${want.includes(s) ? html`<span aria-hidden="true">✓ </span>` : nothing}${needLabel(s, this._lang)}</li>`)}</ul>
            </div>
          </li>`)}
        </ul>
      </section>
    `;
  }
}
