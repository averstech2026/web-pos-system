import '../shared/styles.css';
import '../shared/global.css';
import './style.css';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../shared/firebase.js';
import { ensureQueueSession, QUEUE_TERMINAL_EMAIL, QUEUE_TERMINAL_PASSWORD } from './services/auth.js';
import { QueueBoard } from './pages/board.js';

if (import.meta.env.DEV) {
  import('../shared/seed.js').then(({ seedStaffAuth }) => {
    window.seedStaffAuth = seedStaffAuth;
    console.info(
      `%c[DEV] Queue screen helper loaded.\nRun once: await seedStaffAuth()\nTerminal login: ${QUEUE_TERMINAL_EMAIL} / ${QUEUE_TERMINAL_PASSWORD}`,
      'color:#1E1B4B;font-weight:bold',
    );
  });
}

const app = document.getElementById('app');
let board = null;
let initSeq = 0;

function renderBoot(message = 'Подключение к очереди…') {
  app.innerHTML = `
    <div class="qs-boot">
      <div class="qs-boot-spinner" aria-hidden="true"></div>
      <p>${message}</p>
    </div>`;
}

function renderBootError(err) {
  app.innerHTML = `
    <div class="qs-boot qs-boot--error">
      <p class="qs-boot-title">Экран очереди недоступен</p>
      <p class="qs-boot-msg">${esc(err.message || 'Ошибка подключения')}</p>
      <p class="qs-boot-hint">
        В dev-режиме выполните в консоли браузера:<br>
        <code>await seedStaffAuth()</code><br>
        Затем перезагрузите страницу.
      </p>
      <button type="button" class="btn btn-primary btn-pill btn-press" id="qs-retry">Повторить</button>
    </div>`;

  document.getElementById('qs-retry')?.addEventListener('click', () => boot());
}

async function boot() {
  const seq = ++initSeq;
  board?.destroy?.();
  board = null;
  renderBoot();

  try {
    await ensureQueueSession();
    if (seq !== initSeq) return;

    board = new QueueBoard(app);
    board.init();
  } catch (err) {
    if (seq !== initSeq) return;
    console.error('[queue-screen] boot', err);
    renderBootError(err);
  }
}

onAuthStateChanged(auth, () => {
  boot();
});

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
