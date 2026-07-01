import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase.js';
import { COL, ROLES, createUserDoc } from '../../shared/schema.js';

/** Shared terminal account (created by seedStaffAuth). */
export const QUEUE_TERMINAL_EMAIL = 'kiosk@ifcm.demo';
export const QUEUE_TERMINAL_PASSWORD = 'demo1234';

const FALLBACK_TERMINAL_EMAILS = [
  'kiosk@ifcm.demo',
  'cashier@ifcm.demo',
  'queue@ifcm.demo',
];

async function ensureQueueTerminalUser(user, displayName = 'Экран очереди') {
  const ref = doc(db, COL.USERS, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, createUserDoc({
    id: user.uid,
    name: displayName,
    email: user.email || QUEUE_TERMINAL_EMAIL,
    role: ROLES.CASHIER,
    balance: 0,
    allowsWebAccess: false,
  }));
}

async function signInTerminal() {
  const errors = [];

  for (const email of FALLBACK_TERMINAL_EMAILS) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, QUEUE_TERMINAL_PASSWORD);
      return cred.user;
    } catch (err) {
      errors.push(`${email}: ${err.code || err.message}`);
    }
  }

  throw new Error(
    'Не удалось войти терминалом очереди. Выполните await seedStaffAuth() '
    + 'или удалите пользователя queue@ifcm.demo в Firebase Console → Authentication.',
  );
}

/** Terminal session — required by Firestore rules to read all orders. */
export async function ensureQueueSession() {
  let user = auth.currentUser;

  if (!user) {
    user = await signInTerminal();
  } else {
    const profile = await getDoc(doc(db, COL.USERS, user.uid));
    const role = profile.data()?.role;
    const isTerminalStaff = role && [ROLES.CASHIER, ROLES.COOK, ROLES.MANAGER, ROLES.ADMIN].includes(role);
    if (!isTerminalStaff) {
      user = await signInTerminal();
    }
  }

  await ensureQueueTerminalUser(user);
  return user;
}
