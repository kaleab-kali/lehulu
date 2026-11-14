// One interface, two implementations, chosen at build time with VITE_DATA_MODE:
//  - ApiStore   ("api")   → Docker Compose build, talks to the Rust server (/v1/...)
//  - LocalStore ("local") → live demo on GitHub Pages / Vercel, keeps everything in this browser
// Screens never know which one they use.

import seedJobs from '@seed/jobs.json';
import seedPartners from '@seed/partners.json';
import type { EthDate } from '../engine/types';

export interface Learner {
  id: string;
  name: string;
  phone: string;
  language: 'am' | 'en';
  dobEthiopian?: EthDate | null;
  /** Filled in by the server (YYYY-MM-DD) */
  dobGregorian?: string | null;
  accessPreferences: string[];
  supportNeeds: string[];
  idType: 'kebele' | 'refugee' | 'other' | 'partner' | 'later';
  idNumber?: string | null;
  partner?: string | null;
  idStatus: 'not_given' | 'not_checked' | 'waiting_partner' | 'confirmed_by_partner';
}
export type NewLearner = Omit<Learner, 'id' | 'idStatus'>;
export interface Job { id: string; title: string; org: string; city?: string | null; remote: boolean; supportOffered: string[] }
export type NewJob = Omit<Job, 'id'>;
export interface Partner { id: string; name: string }
export interface VouchRequest { learnerId: string; name: string; phone: string; requestedAt: string }
export interface Draft { flowId: string; stepIndex: number; answers: Record<string, unknown>; sendLinkTo?: string }
export interface NewApplication { jobId: string; learnerId: string; why: string; shareSupport: boolean }
export interface EmployerApplication { id: string; learnerName: string; why?: string | null; supportRequested?: string[] | null }

/** An error the screen can show next to the right field. */
export class FieldError extends Error {
  constructor(message: string, public field?: string, public code?: string) {
    super(message);
  }
}

export interface DataStore {
  readonly mode: 'api' | 'local';
  saveDraft(code: string | null, d: Draft): Promise<string>;
  getDraft(code: string): Promise<Draft | null>;
  createLearner(l: NewLearner): Promise<Learner>;
  getLearner(id: string): Promise<Learner>;
  updateLearner(id: string, patch: Partial<NewLearner>): Promise<Learner>;
  deleteLearner(id: string): Promise<void>;
  listJobs(): Promise<Job[]>;
  postJob(j: NewJob): Promise<Job>;
  apply(a: NewApplication): Promise<{ id: string }>;
  listApplications(jobId: string): Promise<EmployerApplication[]>;
  listPartners(): Promise<Partner[]>;
  listVouches(partner: string): Promise<VouchRequest[]>;
  decideVouch(partner: string, learnerId: string, decision: 'confirm' | 'decline'): Promise<Learner>;
}

class ApiStore implements DataStore {
  readonly mode = 'api' as const;
  constructor(private base: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/v1${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new FieldError('You seem to be offline. Your answers are saved on this phone. Try again when you are connected.');
    }
    if (!res.ok) {
      const e = await res.json().catch(() => null);
      throw new FieldError(e?.error?.message ?? 'Something went wrong. Your answers are saved. Try again.', e?.error?.field, e?.error?.code);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async saveDraft(code: string | null, d: Draft) {
    const r = await this.call<{ resumeCode: string }>(code ? 'PUT' : 'POST', code ? `/drafts/${code}` : '/drafts', d);
    return r.resumeCode;
  }
  getDraft(code: string) { return this.call<Draft>('GET', `/drafts/${code}`).catch(() => null); }
  createLearner(l: NewLearner) { return this.call<Learner>('POST', '/learners', l); }
  getLearner(id: string) { return this.call<Learner>('GET', `/learners/${id}`); }
  updateLearner(id: string, p: Partial<NewLearner>) { return this.call<Learner>('PATCH', `/learners/${id}`, p); }
  deleteLearner(id: string) { return this.call<void>('DELETE', `/learners/${id}`); }
  listJobs() { return this.call<Job[]>('GET', '/jobs'); }
  postJob(j: NewJob) { return this.call<Job>('POST', '/jobs', j); }
  apply(a: NewApplication) { return this.call<{ id: string }>('POST', '/applications', a); }
  listApplications(jobId: string) { return this.call<EmployerApplication[]>('GET', `/jobs/${jobId}/applications`); }
  listPartners() { return this.call<Partner[]>('GET', '/partners'); }
  listVouches(p: string) { return this.call<VouchRequest[]>('GET', `/partners/${encodeURIComponent(p)}/vouches`); }
  decideVouch(p: string, id: string, decision: 'confirm' | 'decline') {
    return this.call<Learner>('POST', `/partners/${encodeURIComponent(p)}/vouches/${id}`, { decision });
  }
}

// ---------- Demo mode: everything stays in this browser ----------

interface LocalDb {
  learners: Learner[];
  jobs: Job[];
  drafts: Record<string, Draft>;
  vouches: { learnerId: string; partner: string; status: 'requested' | 'confirmed' | 'declined'; requestedAt: string }[];
  applications: (NewApplication & { id: string })[];
}

const KEY = 'lehulu:demo-db';

class LocalStore implements DataStore {
  readonly mode = 'local' as const;
  private mem: LocalDb | null = null;

  private db(): LocalDb {
    if (this.mem) return this.mem;
    let db: LocalDb | null = null;
    try { db = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { db = null; }
    this.mem = db ?? { learners: [], jobs: seedJobs as Job[], drafts: {}, vouches: [], applications: [] };
    return this.mem;
  }
  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.mem)); } catch { /* private window: keep in memory */ }
  }
  private id() { return crypto.randomUUID(); }

  async saveDraft(code: string | null, d: Draft) {
    const c = code ?? Math.random().toString(36).slice(2, 8).toUpperCase();
    this.db().drafts[c] = d;
    this.save();
    return c;
  }
  async getDraft(code: string) { return this.db().drafts[code] ?? null; }

  async createLearner(l: NewLearner) {
    const idStatus: Learner['idStatus'] = l.idType === 'partner' ? 'waiting_partner' : l.idType === 'later' ? 'not_given' : 'not_checked';
    const learner: Learner = { ...l, id: this.id(), idStatus };
    this.db().learners.push(learner);
    if (l.idType === 'partner' && l.partner) {
      this.db().vouches.push({ learnerId: learner.id, partner: l.partner, status: 'requested', requestedAt: new Date().toISOString() });
    }
    this.save();
    return learner;
  }
  async getLearner(id: string) {
    const l = this.db().learners.find((x) => x.id === id);
    if (!l) throw new FieldError('We could not find that learner.');
    return l;
  }
  async updateLearner(id: string, p: Partial<NewLearner>) {
    const l = await this.getLearner(id);
    Object.assign(l, p);
    this.save();
    return l;
  }
  async deleteLearner(id: string) {
    const db = this.db();
    db.learners = db.learners.filter((x) => x.id !== id);
    db.vouches = db.vouches.filter((v) => v.learnerId !== id);
    db.applications = db.applications.filter((a) => a.learnerId !== id);
    this.save();
  }
  async listJobs() { return this.db().jobs; }
  async postJob(j: NewJob) {
    const job = { ...j, id: `job-${this.id()}` };
    this.db().jobs.unshift(job);
    this.save();
    return job;
  }
  async apply(a: NewApplication) {
    const rec = { ...a, id: this.id() };
    this.db().applications.push(rec);
    this.save();
    return { id: rec.id };
  }
  async listApplications(jobId: string) {
    const db = this.db();
    return db.applications.filter((a) => a.jobId === jobId).map((a) => {
      const l = db.learners.find((x) => x.id === a.learnerId);
      return { id: a.id, learnerName: l?.name ?? '—', why: a.why, supportRequested: a.shareSupport ? l?.supportNeeds ?? [] : null };
    });
  }
  async listPartners() { return seedPartners as Partner[]; }
  async listVouches(p: string) {
    const db = this.db();
    return db.vouches
      .filter((v) => v.partner === p && v.status === 'requested')
      .map((v) => {
        const l = db.learners.find((x) => x.id === v.learnerId)!;
        return { learnerId: l.id, name: l.name, phone: l.phone, requestedAt: v.requestedAt };
      });
  }
  async decideVouch(p: string, id: string, decision: 'confirm' | 'decline') {
    const v = this.db().vouches.find((x) => x.learnerId === id && x.partner === p && x.status === 'requested');
    if (!v) throw new FieldError('We could not find that request.');
    v.status = decision === 'confirm' ? 'confirmed' : 'declined';
    return this.updateLearnerStatus(id, decision === 'confirm' ? 'confirmed_by_partner' : 'not_given');
  }
  private async updateLearnerStatus(id: string, s: Learner['idStatus']) {
    const l = await this.getLearner(id);
    l.idStatus = s;
    this.save();
    return l;
  }
}

export const store: DataStore =
  import.meta.env.VITE_DATA_MODE === 'local' ? new LocalStore() : new ApiStore(import.meta.env.VITE_API_BASE ?? '');

// The signed-in learner on this device. TODO(F12): replace with a real session (cookie) in API mode.
const SESSION = 'lehulu:learner-id';
export const session = {
  get(): string | null { try { return localStorage.getItem(SESSION); } catch { return null; } },
  set(id: string) { try { localStorage.setItem(SESSION, id); } catch { /* ignore */ } },
  clear() { try { localStorage.removeItem(SESSION); } catch { /* ignore */ } },
};
