import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@shared/firebase.js';
import { COL, ROLES, createUserDoc } from '@shared/schema.js';

export const KIOSK_TERMINAL_EMAIL = 'kiosk@ifcm.demo';
export const KIOSK_TERMINAL_PASSWORD = 'demo1234';
/** Firestore user id for anonymous card payments at the kiosk. */
export const KIOSK_GUEST_USER_ID = 'kiosk-guest';

/** Firestore profile for card payments without a loyalty account. */
export async function ensureKioskGuestUser() {
  const ref = doc(db, COL.USERS, KIOSK_GUEST_USER_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, createUserDoc({
    id: KIOSK_GUEST_USER_ID,
    name: 'Гость киоска',
    email: 'guest@kiosk.local',
    role: ROLES.CLIENT,
    balance: 0,
    allowsWebAccess: false,
  }));
}

/** Cashier profile for the signed-in kiosk terminal (required by isStaff() rules). */
async function ensureKioskTerminalUser(user) {
  const ref = doc(db, COL.USERS, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, createUserDoc({
    id: user.uid,
    name: 'Киоск',
    email: KIOSK_TERMINAL_EMAIL,
    role: ROLES.CASHIER,
    balance: 0,
    allowsWebAccess: false,
  }));
}

/**
 * Terminal session (required by Firestore rules for writes).
 */
export async function ensureKioskSession() {
  let user = auth.currentUser;
  if (!user) {
    const cred = await signInWithEmailAndPassword(
      auth,
      KIOSK_TERMINAL_EMAIL,
      KIOSK_TERMINAL_PASSWORD,
    );
    user = cred.user;
  }

  await ensureKioskTerminalUser(user);
  await ensureKioskGuestUser();
  return user;
}
