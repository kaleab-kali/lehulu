// <lehulu-applications>: what an employer receives. Support requests appear only when the learner shared them.
// TODO(F13): only the employer that posted the job may see its applications.

import { LitElement, html, nothing } from 'lit';
import { base } from './styles';
import { NEEDS } from '../engine/flow';
import { text } from '../engine/i18n';
import { store, type EmployerApplication, type Job } from '../data/store';

export class LehuluApplications extends LitElement {
  static styles = base;
  static properties = { _jobs: { state: true }, _job: { state: true }, _apps: { state: true } };
  declare _jobs: Job[];
  declare _job: string;
  declare _apps: EmployerApplication[];

  constructor() {
    super();
    this._jobs = [];
    this._job = '';
    this._apps = [];
  }

  async connectedCallback() {
    super.connectedCallback();
    await this.refresh();
    document.addEventListener('lehulu:job-posted', () => this.refresh());
  }

  private async refresh() {
    this._jobs = await store.listJobs();
    if (!this._job) this._job = this._jobs[0]?.id ?? '';
    await this.load();
  }

  private async load() {
    this._apps = this._job ? await store.listApplications(this._job) : [];
  }

  render() {
    return html`<section class="card" aria-labelledby="a-h">
      <h2 id="a-h">Applications received</h2>
      <label class="field-label" for="job">Job</label>
      <select id="job" @change=${async (e: Event) => { this._job = (e.target as HTMLSelectElement).value; await this.load(); }}>
        ${this._jobs.map((j) => html`<option value=${j.id} ?selected=${j.id === this._job}>${j.title}</option>`)}
      </select>
      <button type="button" class="small" @click=${() => this.load()}>Refresh</button>
      <p role="status" class="status">${this._apps.length} applications</p>
      <ul style="list-style:none;margin:0;padding:0;display:grid;gap:.6rem">
        ${this._apps.map((a) => html`<li class="card" style="gap:.4rem">
          <h3>${a.learnerName}</h3>
          ${a.why ? html`<p>“${a.why}”</p>` : nothing}
          ${a.supportRequested?.length
            ? html`<p><strong>Support requested:</strong></p>
                <ul class="tags">${a.supportRequested.map((n) => html`<li class="tag">${text(NEEDS.needs.find((x) => x.id === n)?.request, 'en')}</li>`)}</ul>`
            : html`<p class="meta">No support request shared. The learner kept their needs private.</p>`}
          <p class="meta">No diagnosis or disability is ever shown.</p>
        </li>`)}
      </ul>
    </section>`;
  }
}
