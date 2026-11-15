// <lehulu-profile>: the learner's saved answers, ID status and account deletion.
// TODO(F12): "Change" for each answer (reuse <lehulu-signup> on that step and PATCH /v1/learners/{id}).

import { LitElement, html, nothing } from 'lit';
import { base } from './styles';
import { needLabel } from '../engine/flow';
import { session, store, type Learner } from '../data/store';
// <audio> cannot take a <label>, so aria-label names each player for screen readers.

export class LehuluProfile extends LitElement {
  static styles = base;
  static properties = { _l: { state: true }, _status: { state: true } };
  declare _l: Learner | null;
  declare _status: string;

  constructor() {
    super();
    this._l = null;
    this._status = '';
  }

  async connectedCallback() {
    super.connectedCallback();
    const id = session.get();
    if (id) {
      try { this._l = await store.getLearner(id); } catch { this._l = null; }
    }
  }

  private async deleteAccount() {
    if (!this._l) return;
    await store.deleteLearner(this._l.id);
    session.clear();
    this._l = null;
    this._status = 'Your account and all your answers were deleted.';
  }

  render() {
    const l = this._l;
    return html`<section class="card" aria-labelledby="pr-h">
      <h2 id="pr-h">My profile</h2>
      <p role="status" class="status">${this._status}</p>
      ${!l
        ? html`<p>You are not signed up on this device.</p>`
        : html`<dl>
              <div><dt>Name</dt><dd>${l.name || 'Given by voice'}
                ${l.nameAudio
                  ? html`<audio controls preload="none" src=${store.recordingUrl(l.nameAudio)} aria-label="Your name, as you said it"></audio>`
                  : nothing}</dd></div>
              <div><dt>Phone</dt><dd>${l.phone}</dd></div>
              <div><dt>How I use my phone</dt><dd>${l.accessPreferences.join(', ') || '—'}</dd></div>
              <div><dt>Support</dt><dd>${l.supportNeeds.map((n) => needLabel(n, 'en')).join(', ') || 'None'}</dd></div>
              <div><dt>ID status</dt><dd>${l.idStatus.replaceAll('_', ' ')}</dd></div>
            </dl>
            <button type="button" @click=${this.deleteAccount}>Delete my account</button>`}
      ${nothing}
    </section>`;
  }
}
