// <lehulu-applications lang="am|en">: what an employer receives for the jobs it posted. Support requests
// appear only when the learner shared them. Needs the employer's sign-in (shows it when missing).

import { LitElement, html, nothing } from 'lit';
import { base } from './styles';
import { icon } from '../engine/icons';
import { NEEDS } from '../engine/flow';
import { text } from '../engine/i18n';
import { day, langOf, words } from '../engine/screens';
import { playables, staff, store, useApiBase, type EmployerApplication, type Job, type StaffSession } from '../data/store';
import type { Lang } from '../engine/types';
// <audio> cannot take a <label>, so aria-label names each player for screen readers.

export class LehuluApplications extends LitElement {
  static styles = base;
  static properties = { _me: { state: true }, _jobs: { state: true }, _job: { state: true }, _apps: { state: true }, _urls: { state: true }, _lang: { state: true }, _error: { state: true } };
  declare _me: StaffSession | null;
  declare _jobs: Job[];
  declare _job: string;
  declare _apps: EmployerApplication[];
  declare _urls: Record<string, string>;
  declare _lang: Lang;
  declare _error: string;

  constructor() {
    super();
    this._me = null;
    this._jobs = [];
    this._job = '';
    this._apps = [];
    this._urls = {};
    this._lang = 'en';
    this._error = '';
  }

  private onPosted = (e: Event) => {
    const job = (e as CustomEvent<{ job: Job }>).detail?.job;
    if (job) this._job = job.id;
    void this.refresh();
  };
  private onSession = () => {
    const me = staff.get('employer');
    if (me?.id !== this._me?.id) {
      this._me = me;
      this._job = '';
      void this.refresh();
    }
  };

  connectedCallback() {
    super.connectedCallback();
    useApiBase(this);
    this._lang = langOf(this);
    this._me = staff.get('employer');
    document.addEventListener('lehulu:job-posted', this.onPosted);
    document.addEventListener('lehulu:session-changed', this.onSession);
    void this.refresh();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('lehulu:job-posted', this.onPosted);
    document.removeEventListener('lehulu:session-changed', this.onSession);
  }

  private async refresh() {
    if (!this._me) return;
    try {
      const mine = (await store.listJobs()).filter((j) => j.employerId === this._me!.id);
      this._jobs = mine;
      if (!mine.some((j) => j.id === this._job)) this._job = mine[0]?.id ?? '';
      await this.load();
    } catch (e) {
      this._error = (e as Error).message;
    }
  }

  private async load() {
    try {
      this._apps = this._job ? await store.listApplications(this._job) : [];
      this._urls = await playables(this._apps.flatMap((a) => [a.learnerNameAudio, a.whyAudio]), 'employer');
      this._error = '';
    } catch (e) {
      this._apps = [];
      this._error = (e as Error).message;
      this._me = staff.get('employer');
    }
  }

  private player(ref: string | null | undefined, label: string) {
    const url = ref ? this._urls[ref] : '';
    return url ? html`<audio controls preload="none" src=${url} aria-label=${label}></audio>` : nothing;
  }

  render() {
    const w = words(this._lang);
    const lang = this._lang;
    if (!this._me) {
      return html`<lehulu-staff-sign-in kind="employer" lang=${lang}></lehulu-staff-sign-in>`;
    }
    const shared = this._apps.filter((a) => a.supportRequested?.length).length;
    return html`<section class="card" lang=${lang} aria-labelledby="a-h">
      <h2 id="a-h">${w.appsTitle}</h2>
      <div class="stats">
        <div class="stat"><span class="n">${this._jobs.length}</span><span class="l">${w.jobsN}</span></div>
        <div class="stat accent"><span class="n">${this._apps.length}</span><span class="l">${w.appsN}</span></div>
        <div class="stat"><span class="n">${shared}</span><span class="l">${w.sharedN}</span></div>
      </div>
      ${this._jobs.length === 0
        ? html`<div class="empty">${icon('briefcase')}<p>${w.noJobs}</p></div>`
        : html`<label class="field-label" for="job">${w.job}</label>
            <div class="row">
              <select id="job" style="flex:1;min-width:12rem" @change=${async (e: Event) => { this._job = (e.target as HTMLSelectElement).value; await this.load(); }}>
                ${this._jobs.map((j) => html`<option value=${j.id} ?selected=${j.id === this._job}>${j.title}</option>`)}
              </select>
              <button type="button" class="small" @click=${() => this.load()}>${w.refresh}</button>
            </div>
            <p role="status" class="status">${w.count(this._apps.length)}</p>
            ${this._apps.length === 0 ? html`<div class="empty">${icon('inbox')}<p>${w.noApps}</p></div>` : nothing}`}
      ${this._error ? html`<p class="error" role="alert">${this._error}</p>` : nothing}
      <ul style="list-style:none;margin:0;padding:0;display:grid;gap:.6rem">
        ${this._apps.map((a) => html`<li class="card" style="gap:.4rem">
          <div class="head">
            <h3>${a.learnerName || w.voiceName}</h3>
            ${a.supportRequested?.length
              ? html`<span class="pill ok">${w.sharedPill}</span>`
              : html`<span class="pill">${icon('lock')} ${w.privatePill}</span>`}
          </div>
          ${this.player(a.learnerNameAudio, w.nameAudio)}
          <p class="meta">${w.applied(day(a.createdAt, lang))} ${w.contact} <a href="tel:${a.learnerPhone}">${a.learnerPhone}</a></p>
          ${a.why ? html`<p>“${a.why}”</p>` : nothing}
          ${a.whyAudio && this._urls[a.whyAudio] ? html`<p class="meta">${w.whyIntro}</p>${this.player(a.whyAudio, w.whyAudio)}` : nothing}
          ${a.supportRequested?.length
            ? html`<p><strong>${w.supportRequested}</strong></p>
                <ul class="tags">${a.supportRequested.map((n) => html`<li class="tag">${text(NEEDS.needs.find((x) => x.id === n)?.request, lang)}</li>`)}</ul>`
            : html`<p class="meta">${w.noSupport}</p>`}
          <p class="meta">${w.noDiagnosis}</p>
        </li>`)}
      </ul>
    </section>`;
  }
}
