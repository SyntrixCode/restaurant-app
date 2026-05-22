import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';

export const col = (name) => collection(db, name);
export const ref = (name, id) => doc(db, name, id);

export async function fetchAll(name, ...constraints) {
  const q = constraints.length ? query(col(name), ...constraints) : col(name);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchOne(name, id) {
  const snap = await getDoc(ref(name, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchCollection(name, callback, ...constraints) {
  const q = constraints.length ? query(col(name), ...constraints) : col(name);
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export function watchDoc(name, id, callback) {
  return onSnapshot(ref(name, id), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function createDoc(name, data) {
  const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  const result = await addDoc(col(name), payload);
  return result.id;
}

export async function upsertDoc(name, id, data) {
  await setDoc(ref(name, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  return id;
}

export async function patchDoc(name, id, data) {
  await updateDoc(ref(name, id), { ...data, updatedAt: serverTimestamp() });
  return id;
}

export async function removeDoc(name, id) {
  await deleteDoc(ref(name, id));
  return id;
}

export { where, orderBy, query, writeBatch, serverTimestamp };
