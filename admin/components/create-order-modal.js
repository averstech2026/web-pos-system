import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import {
  COL, ORDER_STATUS, PAYMENT_STATUS,
} from '../../shared/schema.js';
import { processOrderPayment } from '../../shared/payment.js';
import { fmtMoney } from '../utils/format.js';
import { orderTotal } from '../utils/order-format.js';
import { toDateInputValue } from '../utils/dates.js';
import { isMenuItemAvailableAt } from '../../shared/availability-rules.js';

const TIME_SLOTS = ['11:30', '12:00', '12:30', '13:00', '13:30'];

function orderNum() {
  return String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
}

/**
 * @param {object} p
 * @param {Array<{ id: string, name: string, email?: string, balance?: number }>} p.clients
 * @param {Array<{ id: string, name: string, price: number, category: string, isAvailable?: boolean, availabilityRuleId?: string|null }>} p.items
 * @param {Map<string, { availabilityRuleId?: string|null }>} [p.groupsByName]
 * @param {Partial<import('../../shared/availability-rules.js').AvailabilityRuleDoc>[]} [p.allRules]
 * @param {() => void} [p.onCreated]
 */
export function openCreateOrderModal({ clients, items, groupsByName = new Map(), allRules = [], onCreated }) {
  const state = {
    userId: clients[0]?.id || '',
    dateSlot: toDateInputValue(),
    timeSlot: TIME_SLOTS[1],
    cart: new Map(),
    useBalance: true,
    activeCategory: null,
  };

  function getAvailableItems() {
    return items.filter(i =>
      isMenuItemAvailableAt(i, groupsByName, allRules, {
        date: state.dateSlot,
        time: state.timeSlot,
      }),
    );
  }

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'create-order-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  function cartLines() {
    return [...state.cart.values()];
  }

  function render() {
    const lines = cartLines();
    const total = orderTotal(lines);
    const client = clients.find(c => c.id === state.userId);
    const balance = client?.balance ?? 0;
    const available = getAvailableItems();
    const categories = [...new Set(available.map(i => i.category))];
    if (!state.activeCategory || !categories.includes(state.activeCategory)) {
      state.activeCategory = categories[0] || null;
    }

    overlay.innerHTML = `
      <div class="admin-modal card">
        <div class="admin-modal-head">
          <h2 class="admin-modal-title">Создать заказ за клиента</h2>
          <button type="button" class="admin-modal-close btn-press" id="com-close" aria-label="Закрыть">✕</button>
        </div>

        <div class="admin-modal-body">
          <div class="com-form-row">
            <label class="com-field">
              <span>Клиент</span>
              <select id="com-client">
                ${clients.map(c => `
                  <option value="${c.id}" ${c.id === state.userId ? 'selected' : ''}>
                    ${c.name}${c.email ? ` (${c.email})` : ''}
                  </option>
                `).join('')}
              </select>
            </label>
            <label class="com-field">
              <span>Дата выдачи</span>
              <input type="date" id="com-date" value="${state.dateSlot}" />
            </label>
            <label class="com-field">
              <span>Время</span>
              <select id="com-time">
                ${TIME_SLOTS.map(t => `
                  <option value="${t}" ${t === state.timeSlot ? 'selected' : ''}>${t}</option>
                `).join('')}
              </select>
            </label>
          </div>

          <div class="com-menu">
            <div class="com-cats" id="com-cats">
              ${categories.map(cat => `
                <button type="button" class="com-cat btn-press ${cat === state.activeCategory ? 'com-cat--active' : ''}" data-cat="${cat}">${cat}</button>
              `).join('')}
            </div>
            <div class="com-items" id="com-items"></div>
          </div>

          <div class="com-cart card">
            <div class="com-cart-head">Корзина · ${fmtMoney(total)}</div>
            <div class="com-cart-lines" id="com-cart-lines">
              ${lines.length
    ? lines.map(l => `
                  <div class="com-cart-line">
                    <span>${l.name}</span>
                    <div class="com-qty">
                      <button type="button" class="btn-press" data-qty-dec="${l.dishId}">−</button>
                      <span>${l.quantity}</span>
                      <button type="button" class="btn-press" data-qty-inc="${l.dishId}">+</button>
                    </div>
                    <span>${fmtMoney(l.price * l.quantity)}</span>
                  </div>
                `).join('')
    : '<p class="com-empty">Добавьте блюда из меню</p>'}
            </div>
            ${client ? `<p class="com-balance-hint">Баланс клиента: ${fmtMoney(balance)}</p>` : ''}
            <label class="com-balance-check">
              <input type="checkbox" id="com-use-balance" ${state.useBalance ? 'checked' : ''} />
              Списать с внутреннего баланса (остаток — картой)
            </label>
          </div>
          <p class="com-error" id="com-error" hidden></p>
        </div>

        <div class="admin-modal-foot">
          <button type="button" class="btn btn-outline btn-press" id="com-cancel">Отмена</button>
          <button type="button" class="btn btn-primary btn-pill btn-press" id="com-submit" ${lines.length ? '' : 'disabled'}>
            Оформить и оплатить
          </button>
        </div>
      </div>
    `;

    renderItems(state.activeCategory);
    bindModalEvents();
  }

  function renderItems(activeCat) {
    const grid = overlay.querySelector('#com-items');
    if (!grid) return;
    const list = getAvailableItems().filter(i => i.category === activeCat);
    grid.innerHTML = list.map(item => `
      <button type="button" class="com-item btn-press" data-add="${item.id}">
        <span class="com-item-name">${item.name}</span>
        <span class="com-item-price">${fmtMoney(item.price)}</span>
      </button>
    `).join('') || '<p class="com-empty">Нет блюд в категории</p>';
  }

  function bindModalEvents() {
    overlay.querySelector('#com-close')?.addEventListener('click', close);
    overlay.querySelector('#com-cancel')?.addEventListener('click', close);

    overlay.querySelector('#com-client')?.addEventListener('change', e => {
      state.userId = e.target.value;
      render();
    });
    overlay.querySelector('#com-date')?.addEventListener('change', e => {
      state.dateSlot = e.target.value;
      render();
    });
    overlay.querySelector('#com-time')?.addEventListener('change', e => {
      state.timeSlot = e.target.value;
      render();
    });
    overlay.querySelector('#com-use-balance')?.addEventListener('change', e => {
      state.useBalance = e.target.checked;
    });

    overlay.querySelector('#com-cats')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      overlay.querySelectorAll('.com-cat').forEach(el => el.classList.remove('com-cat--active'));
      btn.classList.add('com-cat--active');
      state.activeCategory = btn.dataset.cat;
      renderItems(btn.dataset.cat);
    });

    overlay.querySelector('#com-items')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      addItem(btn.dataset.add);
    });

    overlay.querySelector('#com-cart-lines')?.addEventListener('click', e => {
      const inc = e.target.closest('[data-qty-inc]');
      const dec = e.target.closest('[data-qty-dec]');
      if (inc) changeQty(inc.dataset.qtyInc, 1);
      if (dec) changeQty(dec.dataset.qtyDec, -1);
    });

    overlay.querySelector('#com-submit')?.addEventListener('click', submit);
  }

  function addItem(itemId) {
    const item = getAvailableItems().find(i => i.id === itemId);
    if (!item) return;
    const existing = state.cart.get(itemId);
    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.set(itemId, {
        dishId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        nutrition: item.nutrition || undefined,
      });
    }
    render();
  }

  function changeQty(itemId, delta) {
    const line = state.cart.get(itemId);
    if (!line) return;
    line.quantity += delta;
    if (line.quantity <= 0) state.cart.delete(itemId);
    render();
  }

  async function submit() {
    const errEl = overlay.querySelector('#com-error');
    const btn = overlay.querySelector('#com-submit');
    const lines = cartLines();

    if (!state.userId || !lines.length) return;

    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Оформляем…';

    try {
      const ref = await addDoc(collection(db, COL.ORDERS), {
        orderNumber: orderNum(),
        userId: state.userId,
        checkId: null,
        status: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.UNPAID,
        items: lines,
        dateSlot: state.dateSlot,
        timeSlot: state.timeSlot,
        createdAt: serverTimestamp(),
      });

      await processOrderPayment(ref.id, state.useBalance);
      close();
      onCreated?.();
    } catch (err) {
      console.error('[create-order]', err);
      errEl.textContent = err.message || 'Не удалось оформить заказ';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Оформить и оплатить';
    }
  }

  function close() {
    overlay.remove();
  }

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) close();
  });
  render();
}
