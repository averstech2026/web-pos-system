import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../shared/firebase.js';
import { COL, ROLES, createUserDoc } from '../../shared/schema.js';
import { STAFF_DEMO_PASSWORD } from '../../shared/seed.js';

export const POS_TERMINAL_EMAIL = 'pos@ifcm.demo';
export const POS_TERMINAL_FALLBACK_EMAIL = 'cashier@ifcm.demo';
export const POS_TERMINAL_PASSWORD = STAFF_DEMO_PASSWORD;

const TERMINAL_EMAILS = [POS_TERMINAL_EMAIL, POS_TERMINAL_FALLBACK_EMAIL];
const RATE_LIMIT_STORAGE_KEY = 'ct-auth-rate-limit-until';
const RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
const SIGN_IN_ATTEMPT_KEY = 'ct-auth-sign-in-attempted';

/** @param {import('firebase/auth').User} user @param {string} email */
async function ensurePosTerminalUser(user, email) {
  const ref = doc(db, COL.USERS, user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  await setDoc(ref, createUserDoc({
    id: user.uid,
    name: 'Кассовый терминал',
    email,
    role: ROLES.CASHIER,
    balance: 0,
    allowsWebAccess: false,
  }));
}

/** Wait until Firebase restores a persisted session (avoids redundant sign-in). */
export async function waitForAuthReady() {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
    return;
  }

  await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => {
      unsub();
      resolve();
    });
  });
}

export function isLocallyRateLimited() {
  const until = Number(sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY) || 0);
  return Date.now() < until;
}

/** @returns {number} */
export function getRateLimitRemainingMs() {
  const until = Number(sessionStorage.getItem(RATE_LIMIT_STORAGE_KEY) || 0);
  return Math.max(0, until - Date.now());
}

export function clearRateLimitCooldown() {
  sessionStorage.removeItem(RATE_LIMIT_STORAGE_KEY);
  sessionStorage.removeItem(SIGN_IN_ATTEMPT_KEY);
}

function markLocallyRateLimited() {
  sessionStorage.setItem(
    RATE_LIMIT_STORAGE_KEY,
    String(Date.now() + RATE_LIMIT_COOLDOWN_MS),
  );
}

function rateLimitError() {
  const remaining = getRateLimitRemainingMs();
  const minutes = Math.ceil(remaining / 60000) || 5;
  return new Error(
    `Firebase временно блокирует вход (осталось ~${minutes} мин). `
    + 'В dev-режиме можно открыть демо UI без Firebase.',
  );
}

/** @param {string} email */
async function signInTerminal(email) {
  const cred = await signInWithEmailAndPassword(auth, email, POS_TERMINAL_PASSWORD);
  await ensurePosTerminalUser(cred.user, email);
  sessionStorage.removeItem(SIGN_IN_ATTEMPT_KEY);
  return cred.user;
}

/**
 * Terminal session before any Firestore reads.
 * Reuses an existing Firebase session — does not sign in on every reload.
 */
export async function ensurePosTerminalSession() {
  await waitForAuthReady();

  if (auth.currentUser) {
    await ensurePosTerminalUser(
      auth.currentUser,
      auth.currentUser.email || POS_TERMINAL_EMAIL,
    ).catch(() => {});
    return auth.currentUser;
  }

  if (isLocallyRateLimited()) {
    throw rateLimitError();
  }

  const errors = [];

  for (const email of TERMINAL_EMAILS) {
    try {
      sessionStorage.setItem(SIGN_IN_ATTEMPT_KEY, String(Date.now()));
      return await signInTerminal(email);
    } catch (err) {
      if (err?.code === 'auth/too-many-requests') {
        markLocallyRateLimited();
        throw rateLimitError();
      }

      errors.push(`${email}: ${err?.code || err?.message}`);

      const missing = err?.code === 'auth/user-not-found'
        || err?.code === 'auth/invalid-login-credentials'
        || err?.code === 'auth/invalid-credential';
      if (!missing) throw err;
    }
  }

  throw new Error(
    'Не удалось войти кассовым терминалом. Откройте админку (localhost:3002), '
    + 'в консоли выполните: await seedStaffAuth(), затем обновите кассу.\n'
    + `Аккаунты: ${TERMINAL_EMAILS.join(', ')} / ${POS_TERMINAL_PASSWORD}`,
  );
}
