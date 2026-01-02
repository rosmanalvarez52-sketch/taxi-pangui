// src/lib/chat.js
import { auth, db } from './firebase';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
} from 'firebase/firestore';

function normStr(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
}

/**
 * Mensajes en:
 * rides/{rideId}/messages/{msgId}
 */
export function subscribeRideMessages(rideId, cb) {
  if (!rideId) return () => {};

  const q = query(
    collection(db, 'rides', rideId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      cb(msgs);
    },
    (err) => {
      console.log('subscribeRideMessages error:', err);
      cb([]);
    }
  );

  return unsub;
}

export async function sendRideMessage(rideId, text) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('No autenticado');
  if (!rideId) throw new Error('Falta rideId');

  const msg = normStr(text);
  if (!msg) return;

  // Tomamos SOLO mi perfil (regla /users/{uid} permite read solo a sí mismo)
  let senderName = null;
  let senderRole = null;

  try {
    const meSnap = await getDoc(doc(db, 'users', uid));
    if (meSnap.exists()) {
      const me = meSnap.data() || {};
      senderName =
        normStr(me.driverName) ||
        normStr(`${me.names || ''} ${me.surnames || ''}`.trim()) ||
        normStr(me.email) ||
        null;

      senderRole = normStr(me.role) || null;
    }
  } catch (e) {
    console.log('No se pudo leer perfil del usuario para chat:', e?.message);
  }

  await addDoc(collection(db, 'rides', rideId, 'messages'), {
    text: msg,
    senderUid: uid,
    senderName: senderName,
    senderRole: senderRole,
    createdAt: serverTimestamp(),
  });
}
