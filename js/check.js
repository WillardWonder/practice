// Live permission checks against Firebase. Each check performs a real operation
// and compares the outcome to what the role should be allowed to do.
import { can } from './store.js';

export async function runChecks(store, user) {
  if (store.mode !== 'firebase') return [{ name: 'Firebase not configured (Local Demo)', expect: true, got: false, ok: false }];
  const m = store.m, db = store.db, r = user.role;
  const staff = ['owner', 'admin', 'coach', 'viewer'].includes(r), coach = ['owner', 'admin', 'coach'].includes(r), admin = ['owner', 'admin'].includes(r);
  const out = [];
  const t = async (name, expect, fn) => {
    try { await fn(); out.push({ name, expect, got: true, ok: expect === true }); }
    catch (e) { out.push({ name, expect, got: false, ok: expect === false, err: e.code || e.message }); }
  };
  await t('Read my own profile', true, () => m.getDoc(m.doc(db, 'users', user.uid)));
  await t('List all coach accounts', staff, () => m.getDocs(m.collection(db, 'users')));
  await t('Read the drill library', true, () => m.getDocs(m.collection(db, 'drills')));
  await t('List all practices (incl. coach-only)', staff, () => m.getDocs(m.collection(db, 'practices')));
  await t('List athlete-visible practices', true, () => m.getDocs(m.query(m.collection(db, 'practices'), m.where('visibility', 'in', ['athletes', 'public']))));
  await t('Read practice history', true, () => m.getDocs(m.query(m.collection(db, 'runs'), m.limit(5))));
  await t('Make myself Owner (should always be blocked)', false, () => m.updateDoc(m.doc(db, 'users', user.uid), { role: 'owner' }));
  const pid = 'zz-check-' + user.uid;
  await t('Create a practice', coach, () => m.setDoc(m.doc(db, 'practices', pid), { title: 'Access check', blocks: [], visibility: 'team', ownerUid: user.uid, ownerName: user.name, updatedAt: Date.now() }));
  if (coach) await t('Delete my own practice', true, () => m.deleteDoc(m.doc(db, 'practices', pid)));
  const did = 'zz-check-' + user.uid;
  await t('Add a drill to the library', coach, () => m.setDoc(m.doc(db, 'drills', did), { title: 'Access check', category: 'Neutral', durationSec: 60, createdBy: user.uid }));
  if (coach) await t('Delete my own drill', true, () => m.deleteDoc(m.doc(db, 'drills', did)));
  await t('Create an invite', admin, async () => { await m.setDoc(m.doc(db, 'invites', 'zz-check@example.com'), { role: 'viewer' }); await m.deleteDoc(m.doc(db, 'invites', 'zz-check@example.com')); });
  await t('Start a practice session', coach, async () => {
    const ref = await m.addDoc(m.collection(db, 'runs'), { test: true, status: 'live', coachUid: user.uid, controllerUid: user.uid, practice: { title: 'check', blocks: [] }, practiceTitle: 'Access check', startedAt: Date.now(), heartbeat: Date.now(), clock: {}, version: 1 });
    await m.updateDoc(ref, { status: 'ended', endedAt: Date.now() });
    store._checkRun = ref;
  });
  if (coach && store._checkRun) await t('Edit a finished record (should be blocked)', false, () => m.updateDoc(store._checkRun, { practiceTitle: 'tampered' }));
  if (admin && store._checkRun) await t('Delete the test record (admin)', true, () => m.deleteDoc(store._checkRun));
  return out;
}

export { can };
