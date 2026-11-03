// Data layer. Uses Firebase when configured; otherwise a localStorage
// "Local Demo" store with the same interface.
import { firebaseConfig, OWNER_EMAIL, TEST_ACCOUNTS, FIREBASE_SDK, ALLOWED_DOMAINS, STAFF_EMAILS } from './config.js';
import { PRESET_DRILLS, newId } from './seed.js';

export const ROLES = ['owner', 'admin', 'coach', 'viewer', 'athlete', 'pending'];
export const ROLE_LABEL = { unverified: 'Unverified', denied: 'Not allowed', owner: 'Owner', admin: 'Admin Coach', coach: 'Coach', viewer: 'Viewer', athlete: 'Athlete', pending: 'Pending' };
export const can = (user, what) => {
  const r = user?.role;
  const staff = ['owner', 'admin', 'coach'].includes(r);
  switch (what) {
    case 'admin': return ['owner', 'admin'].includes(r);
    case 'edit': case 'run': case 'library': return staff;
    case 'viewAll': return staff || r === 'viewer';
    case 'member': return ['owner', 'admin', 'coach', 'viewer', 'athlete'].includes(r);
    default: return false;
  }
};
export const canEditPractice = (user, p) =>
  can(user, 'admin') || (can(user, 'edit') && (p.ownerUid === user.uid || p.coEdit));

export const isFirebase = !!firebaseConfig.apiKey;
const now = () => Date.now();

// ======================================================================
// Local Demo store
// ======================================================================
const LS = 'practice-local-v1';
const LEGACY = 'wrestling-system-v5'; // prototype's custom drills key
function localDb() {
  let db; try { db = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
  if (!db) {
    db = { practices: {}, drills: {}, runs: {}, users: {}, invites: {}, role: 'owner' };
    PRESET_DRILLS.forEach(d => { db.drills[d.id] = { ...d, createdAt: now() }; });
    // Bring over custom drills saved by last season's prototype on this device.
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY) || '[]');
      legacy.forEach(c => { const id = 'legacy-' + c.id; db.drills[id] = { id, title: c.title, category: c.category,
        description: c.description || '', cues: [], durationSec: (c.duration || 5) * 60, levels: [], createdAt: now(), createdBy: 'local' }; });
    } catch (e) {}
  }
  return db;
}
function saveLocal(db) { localStorage.setItem(LS, JSON.stringify(db)); }

const local = {
  mode: 'local',
  async init(onUser) {
    const db = localDb(); saveLocal(db);
    this._onUser = onUser;
    this.user = { uid: 'local', email: 'demo@local', name: 'Demo Coach', role: db.role || 'owner', prefs: db.prefs || {} };
    onUser(this.user);
  },
  setDemoRole(role) { const db = localDb(); db.role = role; saveLocal(db); this.user = { ...this.user, role }; this._onUser(this.user); },
  async signInGoogle() {}, async signInEmail() {}, async signOut() {}, async resetPassword() {}, isAllowedEmail() { return true; }, async signUp() {},
  async listPractices() { return Object.values(localDb().practices).sort((a, b) => b.updatedAt - a.updatedAt); },
  async getPractice(id) { return localDb().practices[id] || null; },
  async getPublicPractice(id) { return this.getPractice(id); },
  async savePractice(p) {
    const db = localDb(); p.id ||= newId(); p.updatedAt = now(); p.createdAt ||= now();
    p.ownerUid ||= this.user.uid; p.ownerName ||= this.user.name;
    db.practices[p.id] = JSON.parse(JSON.stringify(p)); saveLocal(db); return p;
  },
  async deletePractice(id) { const db = localDb(); delete db.practices[id]; saveLocal(db); },
  async listDrills() { return Object.values(localDb().drills); },
  async saveDrill(d) { const db = localDb(); d.id ||= newId(); d.createdBy ||= this.user.uid; d.updatedAt = now(); db.drills[d.id] = d; saveLocal(db); return d; },
  async deleteDrill(id) { const db = localDb(); delete db.drills[id]; saveLocal(db); },
  async seedDrills() { const db = localDb(); PRESET_DRILLS.forEach(d => { db.drills[d.id] ||= { ...d }; }); saveLocal(db); return PRESET_DRILLS.length; },
  async createRun(r) { const db = localDb(); r.id = newId(); db.runs[r.id] = r; saveLocal(db); window.dispatchEvent(new CustomEvent('local-run', { detail: r.id })); return r.id; },
  async updateRun(id, patch) { const db = localDb(); if (db.runs[id]) { Object.assign(db.runs[id], patch); saveLocal(db); window.dispatchEvent(new CustomEvent('local-run', { detail: id })); } },
  async runCommand(id, fn) {
    const db = localDb(); const r = db.runs[id]; if (!r || r.status !== 'live') return null;
    const patch = fn(r); Object.assign(r, patch, { version: (r.version || 0) + 1, heartbeat: now() }); saveLocal(db);
    window.dispatchEvent(new CustomEvent('local-run', { detail: id })); return r;
  },
  async measureOffset() { return 0; },
  async getRun(id) { return localDb().runs[id] || null; },
  async listRuns() { return Object.values(localDb().runs).sort((a, b) => b.startedAt - a.startedAt); },
  async deleteRun(id) { const db = localDb(); delete db.runs[id]; saveLocal(db); },
  watchRun(id, cb) {
    const h = (e) => { if (!e.key || e.key === LS || e.detail === id) cb(localDb().runs[id], { fromCache: false }); };
    window.addEventListener('storage', h); window.addEventListener('local-run', h); cb(localDb().runs[id], { fromCache: false });
    return () => { window.removeEventListener('storage', h); window.removeEventListener('local-run', h); };
  },
  watchLiveRuns(cb) {
    const emit = () => cb(Object.values(localDb().runs).filter(r => r.status === 'live' && now() - (r.heartbeat || 0) < 3 * 3600e3));
    const h = (e) => { if (!e.key || e.key === LS) emit(); };
    window.addEventListener('storage', h); window.addEventListener('local-run', h); emit();
    return () => { window.removeEventListener('storage', h); window.removeEventListener('local-run', h); };
  },
  async listSites() { return Object.values(localDb().sites || {}).sort((a, b) => a.name.localeCompare(b.name)); },
  async saveSite(name) { const db = localDb(); db.sites ||= {}; const id = newId(); db.sites[id] = { id, name }; saveLocal(db); return id; },
  async deleteSite(id) { const db = localDb(); delete (db.sites || {})[id]; saveLocal(db); },
  async setMyPrefs(patch) { const db = localDb(); db.prefs = { ...(db.prefs || {}), ...patch }; saveLocal(db); this.user.prefs = db.prefs; },
  async listUsers() { return [this.user]; },
  async setUser() {}, async listInvites() { return []; }, async saveInvite() {}, async deleteInvite() {},
  async seedTestAccounts() { throw new Error('Test accounts need Firebase. Add your config in js/config.js first.'); },
};

// ======================================================================
// Firebase store
// ======================================================================
const fb = {
  mode: 'firebase',
  async init(onUser) {
    const [appM, authM, fsM] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
    ]);
    this.m = { ...appM, ...authM, ...fsM };
    const m = this.m;
    this.app = m.initializeApp(firebaseConfig);
    this.auth = m.getAuth(this.app);
    try {
      this.db = m.initializeFirestore(this.app, { localCache: m.persistentLocalCache({ tabManager: m.persistentMultipleTabManager() }) });
    } catch (e) { this.db = m.getFirestore(this.app); }
    m.onAuthStateChanged(this.auth, async (u) => {
      if (!u) { this.user = null; onUser(null); return; }
      try { this.user = await this.loadProfile(u); }
      catch (e) { console.error(e); this.user = { uid: u.uid, email: u.email, name: u.displayName || u.email, role: 'pending', error: e.message }; }
      onUser(this.user);
    });
  },
  async loadProfile(u) {
    const m = this.m, email = (u.email || '').toLowerCase();
    const ref = m.doc(this.db, 'users', u.uid);
    let snap = await m.getDoc(ref);
    if (!snap.exists()) {
      let role = 'pending', invited = false;
      try { const inv = await m.getDoc(m.doc(this.db, 'invites', email)); if (inv.exists()) { role = inv.data().role; invited = true; } } catch (e) {}
      if (email === OWNER_EMAIL && u.emailVerified) role = 'owner';
      else if (!invited && STAFF_EMAILS.includes(email)) role = 'coach';
      const allowed = invited || STAFF_EMAILS.includes(email) || ALLOWED_DOMAINS.some(d => email.endsWith('@' + d));
      if (!allowed) return { uid: u.uid, email, name: u.displayName || email, role: 'denied' };
      if (!u.emailVerified) return { uid: u.uid, email, name: u.displayName || email, role: 'unverified' };
      await m.setDoc(ref, { email, name: u.displayName || email.split('@')[0], role, createdAt: m.serverTimestamp() });
      snap = await m.getDoc(ref);
    }
    const d = snap.data();
    m.updateDoc(ref, { lastSeen: m.serverTimestamp() }).catch(() => {});
    return { uid: u.uid, email, name: d.name, role: d.role, prefs: d.prefs || {} };
  },
  async signInGoogle() { const m = this.m; await m.signInWithPopup(this.auth, new m.GoogleAuthProvider()); },
  async signInEmail(email, pw) { await this.m.signInWithEmailAndPassword(this.auth, email.trim(), pw); },
  async signOut() { await this.m.signOut(this.auth); },
  async resetPassword(email) { await this.m.sendPasswordResetEmail(this.auth, email.trim()); },
  isAllowedEmail(email) { email = email.trim().toLowerCase(); return STAFF_EMAILS.includes(email) || ALLOWED_DOMAINS.some(d => email.endsWith('@' + d)); },
  async signUp(email, pw, name) {
    const m = this.m;
    const cred = await m.createUserWithEmailAndPassword(this.auth, email.trim(), pw);
    if (name) await m.updateProfile(cred.user, { displayName: name });
    await m.sendEmailVerification(cred.user);
  },
  async resendVerification() { await this.m.sendEmailVerification(this.auth.currentUser); },
  async reloadUser() { await this.auth.currentUser.reload(); await this.auth.currentUser.getIdToken(true); this.user = await this.loadProfile(this.auth.currentUser); return this.user; },

  _list(snap) { return snap.docs.map(d => ({ id: d.id, ...d.data() })); },
  async listPractices() {
    const m = this.m, col = m.collection(this.db, 'practices');
    const q = can(this.user, 'viewAll') ? col : m.query(col, m.where('visibility', 'in', ['athletes', 'public']));
    return this._list(await m.getDocs(q)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },
  async getPractice(id) { const s = await this.m.getDoc(this.m.doc(this.db, 'practices', id)); return s.exists() ? { id: s.id, ...s.data() } : null; },
  async getPublicPractice(id) { return this.getPractice(id); },
  async savePractice(p) {
    const m = this.m; const isNew = !p.id; p.id ||= newId();
    p.updatedAt = now(); p.createdAt ||= now();
    if (isNew || !p.ownerUid) { p.ownerUid = this.user.uid; p.ownerName = this.user.name; }
    const { id, ...data } = JSON.parse(JSON.stringify(p));
    await m.setDoc(m.doc(this.db, 'practices', id), data); return p;
  },
  async deletePractice(id) { await this.m.deleteDoc(this.m.doc(this.db, 'practices', id)); },
  async listDrills() {
    const list = this._list(await this.m.getDocs(this.m.collection(this.db, 'drills')));
    return list.length ? list : PRESET_DRILLS.map(d => ({ ...d }));
  },
  async saveDrill(d) {
    const m = this.m; d.id ||= newId(); d.createdBy ||= this.user.uid; d.updatedAt = now();
    const { id, ...data } = d; await m.setDoc(m.doc(this.db, 'drills', id), data); return d;
  },
  async deleteDrill(id) { await this.m.deleteDoc(this.m.doc(this.db, 'drills', id)); },
  async seedDrills() {
    const m = this.m, batch = m.writeBatch(this.db);
    const existing = new Set((await m.getDocs(m.collection(this.db, 'drills'))).docs.map(d => d.id));
    let n = 0;
    PRESET_DRILLS.forEach(d => { if (!existing.has(d.id)) { const { id, ...data } = d; batch.set(m.doc(this.db, 'drills', id), { ...data, createdBy: this.user.uid, updatedAt: now() }); n++; } });
    await batch.commit(); return n;
  },
  async createRun(r) { const m = this.m; const ref = await m.addDoc(m.collection(this.db, 'runs'), r); return ref.id; },
  async updateRun(id, patch) { await this.m.updateDoc(this.m.doc(this.db, 'runs', id), patch); },
  // Coach commands go through a transaction against the run's current state,
  // so two coaches tapping at once can't clobber each other. If the gym Wi-Fi
  // is down, the command is applied locally and queued for when it reconnects.
  async runCommand(id, fn) {
    const m = this.m, ref = m.doc(this.db, 'runs', id);
    try {
      return await m.runTransaction(this.db, async (tx) => {
        const snap = await tx.get(ref); if (!snap.exists()) throw new Error('Run not found');
        const r = snap.data(); if (r.status !== 'live') return null;
        const patch = fn(r);
        tx.update(ref, { ...patch, version: (r.version || 0) + 1, heartbeat: now() });
        return { ...r, ...patch };
      });
    } catch (e) {
      if (e.code === 'unavailable' || e.code === 'failed-precondition' || !navigator.onLine) {
        const cached = this._lastRun?.[id]; if (!cached) throw e;
        const patch = fn(cached);
        m.updateDoc(ref, { ...patch, version: (cached.version || 0) + 1, heartbeat: now() }).catch(() => {});
        return { ...cached, ...patch };
      }
      throw e;
    }
  },
  // Measures this device's clock against Firestore's server clock.
  async measureOffset() {
    const m = this.m; if (!this.user) return 0;
    try {
      const ref = m.doc(this.db, 'users', this.user.uid);
      const t0 = Date.now(); await m.updateDoc(ref, { lastSeen: m.serverTimestamp() });
      const snap = await m.getDocFromServer(ref); const t1 = Date.now();
      const server = snap.data().lastSeen?.toMillis?.(); if (!server) return 0;
      return server - (t0 + t1) / 2;
    } catch (e) { return 0; }
  },
  async getRun(id) { const s = await this.m.getDoc(this.m.doc(this.db, 'runs', id)); return s.exists() ? { id: s.id, ...s.data() } : null; },
  async listRuns() {
    const m = this.m;
    const q = m.query(m.collection(this.db, 'runs'), m.orderBy('startedAt', 'desc'), m.limit(300));
    return this._list(await m.getDocs(q));
  },
  async deleteRun(id) { await this.m.deleteDoc(this.m.doc(this.db, 'runs', id)); },
  watchRun(id, cb) {
    this._lastRun ||= {};
    return this.m.onSnapshot(this.m.doc(this.db, 'runs', id), { includeMetadataChanges: true }, s => {
      const r = s.exists() ? { id: s.id, ...s.data() } : null; if (r) this._lastRun[id] = r;
      cb(r, { fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites });
    }, () => cb(null, {}));
  },
  watchLiveRuns(cb) {
    const m = this.m;
    const q = m.query(m.collection(this.db, 'runs'), m.where('status', '==', 'live'));
    return m.onSnapshot(q, s => cb(this._list(s).filter(r => now() - (r.heartbeat || 0) < 3 * 3600e3)), () => cb([]));
  },
  async listSites() { return this._list(await this.m.getDocs(this.m.collection(this.db, 'sites'))).sort((a, b) => a.name.localeCompare(b.name)); },
  async saveSite(name) { const ref = await this.m.addDoc(this.m.collection(this.db, 'sites'), { name, createdAt: now() }); return ref.id; },
  async deleteSite(id) { await this.m.deleteDoc(this.m.doc(this.db, 'sites', id)); },
  async setMyPrefs(patch) { const prefs = { ...(this.user.prefs || {}), ...patch }; await this.m.updateDoc(this.m.doc(this.db, 'users', this.user.uid), { prefs }); this.user.prefs = prefs; },
  async listUsers() { return this._list(await this.m.getDocs(this.m.collection(this.db, 'users'))).map(u => ({ uid: u.id, ...u })); },
  async setUser(uid, patch) { await this.m.updateDoc(this.m.doc(this.db, 'users', uid), patch); },
  async listInvites() { return this._list(await this.m.getDocs(this.m.collection(this.db, 'invites'))); },
  async saveInvite(email, role) {
    email = email.trim().toLowerCase();
    await this.m.setDoc(this.m.doc(this.db, 'invites', email), { role, invitedBy: this.user.email, createdAt: now() });
  },
  async deleteInvite(email) { await this.m.deleteDoc(this.m.doc(this.db, 'invites', email)); },
  // Creates the three test logins without signing the admin out, by using a
  // second, throwaway Firebase app instance for the sign-ups.
  async seedTestAccounts() {
    const m = this.m, results = [];
    const sec = m.initializeApp(firebaseConfig, 'seeder-' + now());
    const secAuth = m.getAuth(sec);
    for (const a of TEST_ACCOUNTS) {
      try {
        await this.saveInvite(a.email, a.role);
        let cred;
        try { cred = await m.createUserWithEmailAndPassword(secAuth, a.email, a.password); }
        catch (e) {
          if (e.code === 'auth/email-already-in-use') cred = await m.signInWithEmailAndPassword(secAuth, a.email, a.password);
          else throw e;
        }
        await m.setDoc(m.doc(this.db, 'users', cred.user.uid), { email: a.email, name: a.name, role: a.role, createdAt: now() }, { merge: true });
        await m.signOut(secAuth);
        results.push(`✓ ${a.email} — ${ROLE_LABEL[a.role]}`);
      } catch (e) { results.push(`✗ ${a.email} — ${e.code || e.message}`); }
    }
    try { await m.deleteApp(sec); } catch (e) {}
    return results;
  },
};

export const store = isFirebase ? fb : local;
