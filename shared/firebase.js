import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyC8vckb40uJThK-c7i4am0iSAMvIP03LBU',
  authDomain: 'lunch-pos-demo.firebaseapp.com',
  projectId: 'lunch-pos-demo',
  storageBucket: 'lunch-pos-demo.firebasestorage.app',
  messagingSenderId: '497191730046',
  appId: '1:497191730046:web:d1a174c41b10179e03512f',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
