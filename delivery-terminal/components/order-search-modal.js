import { db } from '../../shared/firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { COL } from '../../shared/schema.js';
import { findDeliveryOrders, describeSearchResults } from '../utils/order-search.js';

let scanner = null;
let scannerRunning = false;

async function stopScanner() {
  if (!scanner || !scannerRunning) return;
  try {
    await scanner.stop();
  } catch {
    /* already stopped */
  }
  scannerRunning = false;
}

async function destroyScanner() {
  await stopScanner();
  if (scanner) {
    try {
      scanner.clear();
    } catch {
      /* ignore */
    }
    scanner = null;
  }
}

/**
 * @param {object} p
 * @param {Array<object>} p.orders
 * @param {boolean} [p.focusQr]
 * @param {(result: { orderIds: string[], label: string, scrollToId?: string }) => void} p.onApply
 * @param {() => void} [p.onClose]
 */
export function openOrderSearchModal({ orders, focusQr = false, onApply, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay dt-search-overlay';
  overlay.id = 'dt-search-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="modal card dt-search-modal">
      <div class="modal-header">
        <span class="modal-title">Поиск заказа</span>
        <button class="modal-close btn-press" type="button" id="dt-search-close" aria-label="Закрыть">✕</button>
      </div>

      <div class="dt-search-body">
        <div class="form-group">
          <label for="dt-search-number">Номер заказа</label>
          <input id="dt-search-number" type="text" inputmode="numeric"
                 placeholder="Например, 042" autocomplete="off" />
        </div>

        <div class="form-group">
          <label for="dt-search-name">ФИО клиента</label>
          <input id="dt-search-name" type="text"
                 placeholder="Иванов" autocomplete="off" />
        </div>

        <div class="dt-search-divider">или отсканируйте QR из личного кабинета</div>

        <div class="dt-qr-reader-wrap">
          <div id="dt-qr-reader" class="dt-qr-reader"></div>
          <p class="dt-qr-hint" id="dt-qr-hint">Наведите камеру на QR-код карты питания</p>
        </div>

        <div id="dt-search-error" class="auth-error" hidden></div>
        <div id="dt-search-results" class="dt-search-results" hidden></div>
      </div>

      <div class="dt-search-actions">
        <button class="btn btn-outline btn-pill btn-press" type="button" id="dt-search-reset">
          Сбросить
        </button>
        <button class="btn btn-primary btn-pill btn-press" type="button" id="dt-search-submit">
          Найти
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let qrPayload = '';
  let usersById = {};

  const close = async () => {
    await destroyScanner();
    overlay.remove();
    onClose?.();
  };

  const showError = msg => {
    const el = document.getElementById('dt-search-error');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  };

  const renderResults = (results, onPick) => {
    const el = document.getElementById('dt-search-results');
    if (!el) return;

    if (results.length === 0) {
      el.innerHTML = `<p class="dt-search-empty">Готовых заказов не найдено.</p>`;
      el.hidden = false;
      return;
    }

    el.innerHTML = `
      <p class="dt-search-results-title">Найдено: ${results.length}</p>
      <div class="dt-search-results-list">
        ${results.map(r => `
          <button class="dt-search-result btn-press" type="button" data-orderid="${r.id}">
            <span class="dt-search-result-num">№ ${r.orderNumber}</span>
            <span class="dt-search-result-name">${r.clientName}</span>
          </button>
        `).join('')}
      </div>
    `;
    el.hidden = false;

    el.querySelectorAll('[data-orderid]').forEach(btn => {
      btn.addEventListener('click', () => onPick(btn.dataset.orderid));
    });
  };

  const applyFilter = (matched, label) => {
    const orderIds = matched.map(o => o.id);
    onApply({
      orderIds,
      label,
      scrollToId: orderIds.length === 1 ? orderIds[0] : undefined,
    });
    close();
  };

  const runSearch = async () => {
    showError('');
    document.getElementById('dt-search-results').hidden = true;

    const orderNumber = document.getElementById('dt-search-number').value;
    const name = document.getElementById('dt-search-name').value;

    try {
      const matched = await findDeliveryOrders(orders, { orderNumber, name, qrPayload });

      if (matched.length === 0) {
        renderResults([]);
        return;
      }

      if (matched.length === 1) {
        const label = orderNumber.trim()
          ? `№ ${matched[0].orderNumber}`
          : name.trim() || 'QR';
        applyFilter(matched, label);
        return;
      }

      const results = describeSearchResults(matched, usersById);
      renderResults(results, id => {
        const one = matched.filter(o => o.id === id);
        applyFilter(one, `№ ${one[0]?.orderNumber}`);
      });
    } catch (err) {
      showError(err.message || 'Ошибка поиска');
    }
  };

  const startQrScanner = async () => {
    const hint = document.getElementById('dt-qr-hint');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      scanner = new Html5Qrcode('dt-qr-reader', { verbose: false });

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        decoded => {
          qrPayload = decoded;
          if (hint) hint.textContent = 'QR распознан. Нажмите «Найти».';
          document.getElementById('dt-search-number').value = '';
          document.getElementById('dt-search-name').value = '';
          if (focusQr) runSearch();
        },
        () => {},
      );
      scannerRunning = true;
    } catch (err) {
      console.warn('QR scanner unavailable:', err);
      if (hint) {
        hint.textContent = 'Камера недоступна. Разрешите доступ или введите номер / ФИО.';
      }
    }
  };

  overlay.querySelector('#dt-search-close').addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('#dt-search-submit').addEventListener('click', runSearch);
  overlay.querySelector('#dt-search-reset').addEventListener('click', () => {
    document.getElementById('dt-search-number').value = '';
    document.getElementById('dt-search-name').value = '';
    qrPayload = '';
    showError('');
    document.getElementById('dt-search-results').hidden = true;
    const hint = document.getElementById('dt-qr-hint');
    if (hint) hint.textContent = 'Наведите камеру на QR-код карты питания';
  });

  overlay.querySelector('#dt-search-number').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch();
  });
  overlay.querySelector('#dt-search-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch();
  });

  getDocs(collection(db, COL.USERS)).then(snap => {
    usersById = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
  }).catch(() => {});

  startQrScanner();

  if (focusQr) {
    setTimeout(() => document.getElementById('dt-qr-hint')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  } else {
    setTimeout(() => document.getElementById('dt-search-number')?.focus(), 100);
  }
}
