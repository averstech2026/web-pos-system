import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/** Replaced at build time via vite `define`. */
/* global __FIREBASE_APP_NAME__ */

const firebaseConfig = {
  apiKey: 'AIzaSyC8vckb40uJThK-c7i4am0iSAMvIP03LBU',
  authDomain: 'lunch-pos-demo.firebaseapp.com',
  projectId: 'lunch-pos-demo',
  storageBucket: 'lunch-pos-demo.firebasestorage.app',
  messagingSenderId: '497191730046',
  appId: '1:497191730046:web:d1a174c41b10179e03512f',
};

const PORT_APP_NAME = {
  3001: 'lk',
  3002: 'admin',
  3003: 'kitchen',
  3004: 'delivery',
  3005: 'queue',
  3006: 'kiosk',
  3007: 'validator',
  3008: 'cashier',
};

const PATH_APP_NAME = [
  ['/client-lk', 'lk'],
  ['/cashier-terminal', 'cashier'],
  ['/kitchen-terminal', 'kitchen'],
  ['/delivery-terminal', 'delivery'],
  ['/validator-terminal', 'validator'],
  ['/queue-screen', 'queue'],
  ['/kiosk', 'kiosk'],
  ['/admin', 'admin'],
];

function resolveAppName() {
  if (typeof __FIREBASE_APP_NAME__ === 'string' && __FIREBASE_APP_NAME__) {
    return __FIREBASE_APP_NAME__;
  }
  if (typeof location === 'undefined') return 'default';

  const fromPort = PORT_APP_NAME[location.port];
  if (fromPort) return fromPort;

  const path = location.pathname || '';
  const fromPath = PATH_APP_NAME.find(([prefix]) => path.includes(prefix));
  return fromPath?.[1] || 'default';
}

const appName = resolveAppName();
const app = getApps().some(item => item.name === appName)
  ? getApp(appName)
  : initializeApp(firebaseConfig, appName);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
