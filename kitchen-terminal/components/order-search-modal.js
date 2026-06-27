import { db } from '../../shared/firebase.js';
import { collection, getDocs } from 'firebase/firestore';
import { COL } from '../../shared/schema.js';
import { findKitchenOrders, describeSearchResults } from '../utils/order-search.js';

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
 * @param {Array<object>} p.orders - current kitchen orders
 * @param {(result: { orderIds: string[], label: string, scrollToId?: string }) => void} p.onApply
 * @param {() => void} [p.onClose]
 */
export function openOrderSearchModal({ orders, onApply, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay kt-search-overlay';
  overlay.id = 'kt-search-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  overlay.innerHTML = `
    <div class="modal card kt-search-modal">
      <div class="modal-header">
        <span class="modal-title">Поиск заказа</span>
        <button class="modal-close btn-press" type="button" id="kt-search-close" aria-label="Закрыть">✕</button>
      </div>

      <div class="kt-search-body">
        <div class="form-group">
          <label for="kt-search-number">Номер заказа</label>
          <input id="kt-search-number" type="text" inputmode="numeric"
                 placeholder="Например, 042" autocomplete="off" />
        </div>

        <div class="form-group">
          <label for="kt-search-name">ФИО клиента</label>
          <input id="kt-search-name" type="text"
                 placeholder="Иванов" autocomplete="off" />
        </div>

        <div class="kt-search-divider">или отсканируйте QR из личного кабинета</div>

        <div class="kt-qr-reader-wrap">
          <div id="kt-qr-reader" class="kt-qr-reader"></div>
          <p class="kt-qr-hint" id="kt-qr-hint">Наведите камеру на QR-код карты питания</p>
        </div>

        <div id="kt-search-error" class="auth-error" hidden></div>
        <div id="kt-search-results" class="kt-search-results" hidden></div>
      </div>

      <div class="kt-search-actions">
        <button class="btn btn-outline btn-pill btn-press" type="button" id="kt-search-reset">
          Сбросить
        </button>
        <button class="btn btn-primary btn-pill btn-press" type="button" id="kt-search-submit">
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
    const el = document.getElementById('kt-search-error');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  };

  const renderResults = (results, onPick) => {
    const el = document.getElementById('kt-search-results');
    if (!el) return;

    if (results.length === 0) {
      el.innerHTML = `<p class="kt-search-empty">Заказы не найдены среди текущих на кухне.</p>`;
      el.hidden = false;
      return;
    }

    el.innerHTML = `
      <p class="kt-search-results-title">Найдено: ${results.length}</p>
      <div class="kt-search-results-list">
        ${results.map(r => `
          <button class="kt-search-result btn-press" type="button" data-orderid="${r.id}">
            <span class="kt-search-result-num">№ ${r.orderNumber}</span>
            <span class="kt-search-result-name">${r.clientName}</span>
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
    document.getElementById('kt-search-results').hidden = true;

    const orderNumber = document.getElementById('kt-search-number').value;
    const name = document.getElementById('kt-search-name').value;

    try {
      const matched = await findKitchenOrders(orders, { orderNumber, name, qrPayload });

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
    const hint = document.getElementById('kt-qr-hint');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      scanner = new Html5Qrcode('kt-qr-reader', { verbose: false });

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 220, height: 220 } },
        decoded => {
          qrPayload = decoded;
          if (hint) hint.textContent = 'QR распознан. Нажмите «Найти».';
          document.getElementById('kt-search-number').value = '';
          document.getElementById('kt-search-name').value = '';
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

  overlay.querySelector('#kt-search-close').addEventListener('click', close);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('#kt-search-submit').addEventListener('click', runSearch);
  overlay.querySelector('#kt-search-reset').addEventListener('click', () => {
    document.getElementById('kt-search-number').value = '';
    document.getElementById('kt-search-name').value = '';
    qrPayload = '';
    showError('');
    document.getElementById('kt-search-results').hidden = true;
    const hint = document.getElementById('kt-qr-hint');
    if (hint) hint.textContent = 'Наведите камеру на QR-код карты питания';
  });

  overlay.querySelector('#kt-search-number').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch();
  });
  overlay.querySelector('#kt-search-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') runSearch();
  });

  getDocs(collection(db, COL.USERS)).then(snap => {
    usersById = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
  }).catch(() => {});

  startQrScanner();

  setTimeout(() => document.getElementById('kt-search-number')?.focus(), 100);
}
