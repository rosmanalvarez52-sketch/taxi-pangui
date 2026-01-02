// src/lib/userProfile.js
import Constants from 'expo-constants';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const EXTRA =
  Constants.expoConfig?.extra ??
  Constants.manifest?.extra ??
  {};

const ADMIN_EMAILS = (EXTRA.adminEmails ?? []).map((e) => (e || '').toLowerCase().trim());

// ✅ correo único de secretaria
const SECRETARY_EMAIL = 'secretaxipangui11@gmail.com';

function computeRoleByEmail(email) {
  const e = (email || '').toLowerCase().trim();

  if (e === SECRETARY_EMAIL) return 'secretary';
  if (ADMIN_EMAILS.includes(e)) return 'driver_admin';

  return 'passenger';
}

export async function ensureUserProfile(user) {
  if (!user) return;

  const email = (user.email || '').toLowerCase().trim();
  const role = computeRoleByEmail(email);

  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email,
      role,
      createdAt: serverTimestamp(),
    });
    return;
  }

  // ✅ sincroniza si cambió
  const current = snap.data() || {};
  if (current.role !== role || current.email !== email) {
    await updateDoc(ref, {
      role,
      email,
      updatedAt: serverTimestamp(),
    });
  }
}
