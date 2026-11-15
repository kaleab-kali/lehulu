// One interface, two implementations, chosen at build time with VITE_DATA_MODE:
//  - ApiStore   ("api")   → Docker Compose build, talks to the Rust server (/v1/...)
//  - LocalStore ("local") → live demo on GitHub Pages / Vercel, keeps everything in this browser
// Screens never know which one they use.
//
// Who is signed in lives here too: the learner on this device (localStorage, ends on "Sign out") and a
// partner or employer for this tab only (sessionStorage). Tokens go in the Authorization header.

import seedJobs from '@seed/jobs.json';
import seedPartners from '@seed/partners.json';
import seedEmployers from '@seed/employers.json';
import type { EthDate } from '../engine/types';

export interface Learner {
  id: string;
  /** May be empty when the name was given by voice (see nameAudio). */
  name: string;
  /** Recording of the learner saying their name (pass to store.playable). */
  nameAudio?: string | null;
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
  /** The learner agreed that the host platform may adapt to their language and access preferences. */
  shareWithHost: boolean;
}
export type NewLearner = Omit<Learner, 'id' | 'idStatus' | 'dobGregorian'>;
export interface Job { id: string; title: string; org: string; city?: string | null; remote: boolean; supportOffered: string[]; employerId?: string | null }
export type NewJob = Omit<Job, 'id' | 'employerId'>;
export interface Partner { id: string; name: string }
export interface VouchRequest { learnerId: string; name: string; nameAudio?: string | null; phone: string; requestedAt: string }
export interface Draft { flowId: string; stepIndex: number; answers: Record<string, unknown>; sendLinkTo?: string }
/** `why` may be empty when `whyAudio` (a recording id) is given. The learner comes from the session. */
export interface NewApplication { jobId: string; why: string; whyAudio?: string | null; shareSupport: boolean }
/** Recording fields are references: pass them to store.playable() to play. */
export interface EmployerApplication {
  id: string;
  learnerName: string;
  learnerNameAudio?: string | null;
  learnerPhone: string;
  createdAt: string;
  why?: string | null;
  whyAudio?: string | null;
  supportRequested?: string[] | null;
}
/** What a partner fills in with a learner beside them (F18). No ID, no document. */
export interface NewRegistration {
  name: string;
  phone: string;
  language: 'am' | 'en';
  accessPreferences: string[];
  supportNeeds: string[];
}
export interface CodeSent { message: string; demoCode?: string }
export interface AccountChoice { id: string; name: string; createdAt: string }
export interface SignedIn { learner: Learner; linkToken: string }
export type Verified = { signedIn: SignedIn; registered: boolean } | { choose: AccountChoice[] };

export type StaffKind = 'partner' | 'employer';
export interface StaffSession { kind: StaffKind; id: string; name: string; token: string }
interface LearnerSession { id: string; token: string }

/** An error the screen can show next to the right field. */
export class FieldError extends Error {
  constructor(message: string, public field?: string, public code?: string) {
    super(message);
  }
}

// ---------- sessions ----------

const LEARNER_KEY = 'lehulu:session';
const staffKey = (k: StaffKind) => `lehulu:staff:${k}`;

function read<T>(s: Storage | undefined, key: string): T | null {
  try { return JSON.parse(s?.getItem(key) ?? 'null') as T | null; } catch { return null; }
}
function write(s: Storage | undefined, key: string, v: unknown) {
  try {
    if (v == null) s?.removeItem(key);
    else s?.setItem(key, JSON.stringify(v));
  } catch { /* storage blocked: the session lasts for this page only */ }
}
const local = () => (typeof localStorage === 'undefined' ? undefined : localStorage);
const perTab = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);

function changed() {
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('lehulu:session-changed'));
}

/** The learner signed in on this device. */
export const session = {
  get(): string | null { return read<LearnerSession>(local(), LEARNER_KEY)?.id ?? null; },
  token(): string | null { return read<LearnerSession>(local(), LEARNER_KEY)?.token ?? null; },
  set(id: string, token: string) { write(local(), LEARNER_KEY, { id, token }); changed(); },
  clear() { write(local(), LEARNER_KEY, null); changed(); },
};

/** A partner or employer signed in in this tab. */
export const staff = {
  get(kind: StaffKind): StaffSession | null { return read<StaffSession>(perTab(), staffKey(kind)); },
  set(s: StaffSession) { write(perTab(), staffKey(s.kind), s); changed(); },
  clear(kind: StaffKind) { write(perTab(), staffKey(kind), null); changed(); },
};

const SIGN_IN_AGAIN = 'Please sign in again.';

export interface DataStore {
  readonly mode: 'api' | 'local';
  /** Where the Lehulu server is (the `api-base` attribute). Empty = same site. */
  setApiBase(base: string): void;
  saveDraft(code: string | null, d: Draft): Promise<string>;
  getDraft(code: string): Promise<Draft | null>;
  /** Creates the account and signs the learner in on this device. */
  createLearner(l: NewLearner): Promise<SignedIn>;
  /** The signed-in learner. Fails with a plain message when nobody is signed in. */
  me(): Promise<Learner>;
  updateMe(patch: Partial<NewLearner>): Promise<Learner>;
  /** Everything held about the signed-in learner (right of access). */
  exportMe(): Promise<unknown>;
  deleteMe(): Promise<void>;
  signOut(): Promise<void>;
  requestCode(phone: string): Promise<CodeSent>;
  /** Signs in on success; for a shared phone, returns the accounts to choose from. */
  verifyCode(phone: string, code: string, learnerId?: string): Promise<Verified>;
  staffSignIn(kind: StaffKind, clientId: string, secret: string): Promise<StaffSession>;
  listJobs(): Promise<Job[]>;
  postJob(j: NewJob): Promise<Job>;
  apply(a: NewApplication): Promise<{ id: string }>;
  listApplications(jobId: string): Promise<EmployerApplication[]>;
  listPartners(): Promise<Partner[]>;
  listVouches(partner: string): Promise<VouchRequest[]>;
  decideVouch(partner: string, learnerId: string, decision: 'confirm' | 'decline'): Promise<void>;
  registerLearner(partner: string, r: NewRegistration): Promise<CodeSent>;
  /** Save a voice answer; returns the id an answer refers to (nameAudio, whyAudio). */
  uploadRecording(audio: Blob): Promise<string>;
  /** A URL an <audio> element can play. `as` says whose sign-in may play it (default: the learner). */
  playable(ref: string, as?: 'learner' | StaffKind): Promise<string>;
}

type Auth = 'learner' | StaffKind | undefined;

function defaultApiBase(): string {
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  // lehulu.js loaded from a Lehulu server: that server is the API.
  return import.meta.env.VITE_LIB ? new URL(/* @vite-ignore */ '.', import.meta.url).href.replace(/\/$/, '') : '';
}

class ApiStore implements DataStore {
  readonly mode = 'api' as const;
  private urls = new Map<string, string>();
  constructor(private base: string) {}

  setApiBase(base: string) { this.base = base.replace(/\/$/, ''); }

  private token(auth: Auth) {
    if (!auth) return null;
    return auth === 'learner' ? session.token() : staff.get(auth)?.token ?? null;
  }

  private async send(method: string, url: string, auth: Auth, body?: BodyInit, type?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (type) headers['Content-Type'] = type;
    const token = this.token(auth);
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetch(url, { method, headers, body });
    } catch {
      throw new FieldError('You seem to be offline. Your answers are saved on this phone. Try again when you are connected.', undefined, 'offline');
    }
  }

  private async fail(res: Response, auth: Auth): Promise<never> {
    const e = await res.json().catch(() => null);
    if (res.status === 401 && auth) {
      if (auth === 'learner') session.clear();
      else staff.clear(auth);
      throw new FieldError(SIGN_IN_AGAIN, undefined, 'unauthorized');
    }
    throw new FieldError(e?.error?.message ?? 'Something went wrong. Your answers are saved. Try again.', e?.error?.field, e?.error?.code);
  }

  private async call<T>(method: string, path: string, body?: unknown, auth?: Auth): Promise<T> {
    const res = await this.send(method, `${this.base}${path.startsWith('/oauth') ? '' : '/v1'}${path}`, auth, body ? JSON.stringify(body) : undefined, body ? 'application/json' : undefined);
    if (!res.ok) return this.fail(res, auth);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  private signedIn(r: Learner & { token: string; linkToken: string }): SignedIn {
    const { token, linkToken, ...learner } = r;
    session.set(learner.id, token);
    return { learner, linkToken };
  }

  private myId() {
    const id = session.get();
    if (!id) throw new FieldError(SIGN_IN_AGAIN, undefined, 'unauthorized');
    return id;
  }

  async saveDraft(code: string | null, d: Draft) {
    const r = await this.call<{ resumeCode: string }>(code ? 'PUT' : 'POST', code ? `/drafts/${encodeURIComponent(code)}` : '/drafts', d);
    return r.resumeCode;
  }
  getDraft(code: string) { return this.call<Draft>('GET', `/drafts/${encodeURIComponent(code)}`).catch(() => null); }
  async createLearner(l: NewLearner) {
    return this.signedIn(await this.call('POST', '/learners', l));
  }
  me() { return this.call<Learner>('GET', '/me', undefined, 'learner'); }
  updateMe(p: Partial<NewLearner>) { return this.call<Learner>('PATCH', `/learners/${this.myId()}`, p, 'learner'); }
  exportMe() { return this.call<unknown>('GET', `/learners/${this.myId()}/export`, undefined, 'learner'); }
  async deleteMe() {
    await this.call<void>('DELETE', `/learners/${this.myId()}`, undefined, 'learner');
    session.clear();
  }
  async signOut() {
    await this.call<void>('POST', '/auth/signout', undefined, 'learner').catch(() => undefined);
    session.clear();
  }
  requestCode(phone: string) { return this.call<CodeSent>('POST', '/auth/code', { phone }); }
  async verifyCode(phone: string, code: string, learnerId?: string): Promise<Verified> {
    const r = await this.call<{ signedIn?: Learner & { token: string; linkToken: string }; choose?: AccountChoice[]; registered: boolean }>(
      'POST', '/auth/verify', { phone, code, learnerId });
    if (r.signedIn) return { signedIn: this.signedIn(r.signedIn), registered: r.registered };
    return { choose: r.choose ?? [] };
  }
  async staffSignIn(kind: StaffKind, clientId: string, secret: string) {
    const res = await this.send('POST', `${this.base}/oauth/token`, undefined,
      new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId.trim(), client_secret: secret.trim() }),
      'application/x-www-form-urlencoded');
    if (!res.ok) return this.fail(res, undefined);
    const t = (await res.json()) as { access_token: string; scope: string; name: string };
    const [got, id] = t.scope.split(':');
    if (got !== kind) throw new FieldError(kind === 'partner' ? 'This is not a partner account. Use the employer screen.' : 'This is not an employer account. Use the partner screen.', 'clientId');
    const s: StaffSession = { kind, id, name: t.name, token: t.access_token };
    staff.set(s);
    return s;
  }
  listJobs() { return this.call<Job[]>('GET', '/jobs'); }
  postJob(j: NewJob) { return this.call<Job>('POST', '/jobs', j, 'employer'); }
  apply(a: NewApplication) { return this.call<{ id: string }>('POST', '/applications', a, 'learner'); }
  listApplications(jobId: string) { return this.call<EmployerApplication[]>('GET', `/jobs/${encodeURIComponent(jobId)}/applications`, undefined, 'employer'); }
  listPartners() { return this.call<Partner[]>('GET', '/partners'); }
  listVouches(p: string) { return this.call<VouchRequest[]>('GET', `/partners/${encodeURIComponent(p)}/vouches`, undefined, 'partner'); }
  async decideVouch(p: string, id: string, decision: 'confirm' | 'decline') {
    await this.call('POST', `/partners/${encodeURIComponent(p)}/vouches/${encodeURIComponent(id)}`, { decision }, 'partner');
  }
  registerLearner(p: string, r: NewRegistration) {
    return this.call<CodeSent>('POST', `/partners/${encodeURIComponent(p)}/registrations`, r, 'partner');
  }
  async uploadRecording(audio: Blob) {
    const res = await this.send('POST', `${this.base}/v1/media`, session.token() ? 'learner' : undefined, audio, audio.type || 'audio/webm');
    if (!res.ok) return this.fail(res, undefined);
    return ((await res.json()) as { id: string }).id;
  }
  async playable(ref: string, as: Auth = 'learner') {
    const key = `${as}:${ref}`;
    const cached = this.urls.get(key);
    if (cached) return cached;
    // <audio src> cannot send a token, so fetch the recording and play it from memory.
    const url = ref.startsWith('/v1/') ? `${this.base}${ref}` : `${this.base}/v1/media/${encodeURIComponent(ref)}`;
    const res = await this.send('GET', url, as);
    if (!res.ok) return this.fail(res, as);
    const blobUrl = URL.createObjectURL(await res.blob());
    this.urls.set(key, blobUrl);
    return blobUrl;
  }
}

// ---------- Demo mode: everything stays in this browser ----------

interface LocalDb {
  learners: Learner[];
  jobs: Job[];
  drafts: Record<string, Draft>;
  vouches: { learnerId: string; partner: string; status: 'requested' | 'confirmed' | 'declined'; requestedAt: string }[];
  applications: (NewApplication & { id: string; learnerId: string; createdAt: string })[];
  /** Voice recordings as data: URLs, by id (demo mode keeps them in this browser). */
  media: Record<string, string>;
  codes: { phone: string; code: string; registration?: string }[];
  registrations: { id: string; partner: string; reg: NewRegistration }[];
}

const KEY = 'lehulu:demo-db';
const ownerOf = (jobId: string) => (seedJobs as Job[]).find((j) => j.id === jobId)?.employerId ?? null;

class LocalStore implements DataStore {
  readonly mode = 'local' as const;
  private mem: LocalDb | null = null;

  setApiBase() { /* demo mode has no server */ }

  private db(): LocalDb {
    if (this.mem) return this.mem;
    const db = read<LocalDb>(local(), KEY);
    this.mem = db ?? { learners: [], jobs: seedJobs as Job[], drafts: {}, vouches: [], applications: [], media: {}, codes: [], registrations: [] };
    // Demo data saved by older versions.
    this.mem.media ??= {};
    this.mem.codes ??= [];
    this.mem.registrations ??= [];
    this.mem.jobs = this.mem.jobs.map((j) => (j.employerId ? j : { ...j, employerId: ownerOf(j.id) }));
    this.mem.learners = this.mem.learners.map((l) => ({ ...l, shareWithHost: Boolean(l.shareWithHost) }));
    return this.mem;
  }
  private save() { write(local(), KEY, this.mem); }
  private id() { return crypto.randomUUID(); }
  private find(id: string) {
    const l = this.db().learners.find((x) => x.id === id);
    if (!l) throw new FieldError('We could not find that learner.');
    return l;
  }
  private signIn(l: Learner): SignedIn {
    session.set(l.id, 'demo');
    return { learner: l, linkToken: `demo-${this.id()}` };
  }
  private meId() {
    const id = session.get();
    if (!id || !this.db().learners.some((x) => x.id === id)) {
      if (id) session.clear();
      throw new FieldError(SIGN_IN_AGAIN, undefined, 'unauthorized');
    }
    return id;
  }
  private staffOrFail(kind: StaffKind) {
    const s = staff.get(kind);
    if (!s) throw new FieldError(SIGN_IN_AGAIN, undefined, 'unauthorized');
    return s;
  }

  async saveDraft(code: string | null, d: Draft) {
    const c = code ?? Array.from({ length: 8 }, () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 32)]).join('');
    const { sendLinkTo: _, ...draft } = d;
    this.db().drafts[c] = draft;
    this.save();
    return c;
  }
  async getDraft(code: string) { return this.db().drafts[code.toUpperCase()] ?? null; }

  async createLearner(l: NewLearner) {
    const idStatus: Learner['idStatus'] = l.idType === 'partner' ? 'waiting_partner' : l.idType === 'later' ? 'not_given' : 'not_checked';
    const learner: Learner = { ...l, id: this.id(), idStatus };
    this.db().learners.push(learner);
    if (l.idType === 'partner' && l.partner) {
      this.db().vouches.push({ learnerId: learner.id, partner: l.partner, status: 'requested', requestedAt: new Date().toISOString() });
    }
    this.save();
    return this.signIn(learner);
  }
  async me() { return this.find(this.meId()); }
  async updateMe(p: Partial<NewLearner>) {
    const l = this.find(this.meId());
    if (p.partner !== undefined || p.idType !== undefined) {
      const changedPartner = (p.idType ?? l.idType) !== l.idType || (p.partner ?? l.partner) !== l.partner;
      if (changedPartner) l.idStatus = (p.idType ?? l.idType) === 'partner' ? 'waiting_partner' : 'not_checked';
    }
    Object.assign(l, p);
    this.save();
    return l;
  }
  async exportMe() {
    const id = this.meId();
    const db = this.db();
    return {
      exportedAt: new Date().toISOString(),
      learner: this.find(id),
      applications: db.applications.filter((a) => a.learnerId === id).map((a) => {
        const j = db.jobs.find((x) => x.id === a.jobId);
        return { jobId: a.jobId, jobTitle: j?.title ?? '', org: j?.org ?? '', why: a.why || null, whyAudio: a.whyAudio ?? null, supportShared: a.shareSupport, createdAt: a.createdAt };
      }),
      note: 'Demo mode: everything is kept in this browser only.',
    };
  }
  async deleteMe() {
    const id = this.meId();
    const db = this.db();
    // Right to erasure includes voice recordings.
    const mine = [db.learners.find((x) => x.id === id)?.nameAudio, ...db.applications.filter((a) => a.learnerId === id).map((a) => a.whyAudio)];
    for (const m of mine) if (m) delete db.media[m];
    db.learners = db.learners.filter((x) => x.id !== id);
    db.vouches = db.vouches.filter((v) => v.learnerId !== id);
    db.applications = db.applications.filter((a) => a.learnerId !== id);
    this.save();
    session.clear();
  }
  async signOut() { session.clear(); }
  async requestCode(phone: string) {
    const db = this.db();
    const message = `If ${phone} has a Lehulu account, we sent a code to it by SMS. The code works for a day.`;
    if (!db.learners.some((l) => l.phone === phone)) return { message };
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    db.codes.push({ phone, code });
    this.save();
    return { message, demoCode: code };
  }
  async verifyCode(phone: string, code: string, learnerId?: string): Promise<Verified> {
    const db = this.db();
    const digits = code.replace(/\D/g, '');
    const hit = db.codes.find((c) => c.phone === phone && c.code === digits);
    if (!hit) throw new FieldError('That code is not right. Enter the 6 numbers from the SMS, for example 482913.', 'code');
    if (hit.registration) {
      const r = db.registrations.find((x) => x.id === hit.registration);
      if (!r) throw new FieldError('This registration can no longer be used. Ask your partner to register you again.', 'code');
      const learner: Learner = { ...r.reg, id: this.id(), idType: 'partner', partner: r.partner, idStatus: 'confirmed_by_partner', shareWithHost: false, nameAudio: null };
      db.learners.push(learner);
      db.registrations = db.registrations.filter((x) => x !== r);
      db.codes = db.codes.filter((c) => c !== hit);
      this.save();
      return { signedIn: this.signIn(learner), registered: true };
    }
    const accounts = db.learners.filter((l) => l.phone === phone);
    if (!accounts.length) throw new FieldError('There is no account for this number. Sign up first.', 'phone');
    let chosen: Learner | undefined;
    if (learnerId) chosen = accounts.find((a) => a.id === learnerId);
    else if (accounts.length === 1) chosen = accounts[0];
    else return { choose: accounts.map((a) => ({ id: a.id, name: a.name, createdAt: '' })) };
    if (!chosen) throw new FieldError('Choose one of the accounts on this phone.', 'learnerId');
    db.codes = db.codes.filter((c) => c !== hit);
    this.save();
    return { signedIn: this.signIn(chosen), registered: false };
  }
  async staffSignIn(kind: StaffKind, clientId: string, secret: string) {
    const orgs = (kind === 'partner' ? seedPartners : seedEmployers) as Partner[];
    const org = orgs.find((o) => o.id === clientId.trim());
    if (!org || secret.trim() !== `${org.id}-demo`) {
      throw new FieldError('That client ID and secret do not match. Check them with the person who set up your account.', 'clientSecret');
    }
    const s: StaffSession = { kind, id: org.id, name: org.name, token: 'demo' };
    staff.set(s);
    return s;
  }
  async listJobs() { return this.db().jobs; }
  async postJob(j: NewJob) {
    const who = this.staffOrFail('employer');
    const job: Job = { ...j, org: j.org || who.name, id: `job-${this.id()}`, employerId: who.id };
    this.db().jobs.unshift(job);
    this.save();
    return job;
  }
  async apply(a: NewApplication) {
    const rec = { ...a, learnerId: this.meId(), id: this.id(), createdAt: new Date().toISOString() };
    this.db().applications.push(rec);
    this.save();
    return { id: rec.id };
  }
  async listApplications(jobId: string) {
    const who = this.staffOrFail('employer');
    const db = this.db();
    const job = db.jobs.find((j) => j.id === jobId);
    if (!job) throw new FieldError('We could not find that job.');
    if (job.employerId !== who.id) throw new FieldError('Only the employer that posted this job can see its applications.');
    return db.applications.filter((a) => a.jobId === jobId).flatMap((a) => {
      const l = db.learners.find((x) => x.id === a.learnerId);
      if (!l) return [];
      return [{
        id: a.id,
        learnerName: l.name,
        learnerNameAudio: l.nameAudio ?? null,
        learnerPhone: l.phone,
        createdAt: a.createdAt,
        why: a.why || null,
        whyAudio: a.whyAudio ?? null,
        supportRequested: a.shareSupport ? l.supportNeeds : null,
      }];
    });
  }
  async listPartners() { return seedPartners as Partner[]; }
  async listVouches(p: string) {
    if (this.staffOrFail('partner').id !== p) throw new FieldError('You can only see your own organisation’s requests.');
    const db = this.db();
    return db.vouches
      .filter((v) => v.partner === p && v.status === 'requested')
      .flatMap((v) => {
        const l = db.learners.find((x) => x.id === v.learnerId);
        return l ? [{ learnerId: l.id, name: l.name, nameAudio: l.nameAudio ?? null, phone: l.phone, requestedAt: v.requestedAt }] : [];
      });
  }
  async decideVouch(p: string, id: string, decision: 'confirm' | 'decline') {
    if (this.staffOrFail('partner').id !== p) throw new FieldError('You can only answer your own organisation’s requests.');
    const v = this.db().vouches.find((x) => x.learnerId === id && x.partner === p && x.status === 'requested');
    if (!v) throw new FieldError('We could not find that request.');
    v.status = decision === 'confirm' ? 'confirmed' : 'declined';
    this.find(id).idStatus = decision === 'confirm' ? 'confirmed_by_partner' : 'not_given';
    this.save();
  }
  async registerLearner(p: string, r: NewRegistration) {
    if (this.staffOrFail('partner').id !== p) throw new FieldError('You can only register learners for your own organisation.');
    if (!r.name.trim()) throw new FieldError('Enter the learner’s name.', 'name');
    const db = this.db();
    const id = this.id();
    db.registrations.push({ id, partner: p, reg: r });
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    db.codes.push({ phone: r.phone, code, registration: id });
    this.save();
    return { message: `We texted ${r.phone}. The account is made only when the learner agrees with the code. They have a week.`, demoCode: code };
  }
  async uploadRecording(audio: Blob) {
    if (audio.size > 2 * 1024 * 1024) throw new FieldError('The recording is too long for demo mode. Please keep it short, or type your answer.');
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new FieldError('We could not save the recording. Please try again.'));
      r.readAsDataURL(audio);
    });
    const id = this.id();
    this.db().media[id] = url;
    this.save();
    return id;
  }
  async playable(ref: string) {
    const url = this.db().media[ref];
    if (!url) throw new FieldError('This recording cannot be played here.');
    return url;
  }
}

export const store: DataStore =
  import.meta.env.VITE_DATA_MODE === 'local' ? new LocalStore() : new ApiStore(defaultApiBase());

/** Components call this with their `api-base` (or `api`) attribute, so one lehulu.js works with any Lehulu
 * server. Give the server's address, with or without a trailing `/v1` or `/api`. */
export function useApiBase(el: Element) {
  const base = el.getAttribute('api-base') ?? el.getAttribute('api');
  if (base) store.setApiBase(base.replace(/\/+$/, '').replace(/\/(v1|api(\/v1)?)$/, ''));
}

/** Play URLs for several recordings at once; recordings that cannot be played are left out. */
export async function playables(refs: (string | null | undefined)[], as: 'learner' | StaffKind): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(refs.filter((r): r is string => Boolean(r)))].map(async (r) => {
      try { out[r] = await store.playable(r, as); } catch { /* not allowed or gone: no player */ }
    }),
  );
  return out;
}
