import { auth, db } from '../../shared/firebase.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { COL } from '../../shared/schema.js';
import { processOrderPayment } from '../../shared/payment.js';
import { cancelUnpaidOrder, canCancelOrder } from '../../shared/orders.js';
import { getItemImageUrl, resolveProductImageUrl } from '../../shared/item-images.js';
import { hasNutrition, renderNutritionGrid, sumNutrition } from '../../shared/nutrition.js';
import { resolveItemNutrition } from '../../shared/demo-nutrition.js';
import { cart } from '../store.js';
import { bindScrollFade } from '../utils/scroll-fade.js';
import { renderCartItemCompositionHtml } from '../../shared/composite-order-display.js';

function resolveItemImage(item) {
  return resolveProductImageUrl(item.imageUrl) || getItemImageUrl(item.name);
}

const TIME_SLOTS = ['11:30', '12:00', '12:30', '13:00', '13:30'];

/** Next N working dates (Mon–Fri), starting from tomorrow */
function getDateOptions(n = 7) {
  const opts = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (opts.length < n) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      opts.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }
  return opts;
}

function buildDateOptions(currentIso) {
  const opts = getDateOptions(7);
  if (currentIso && !opts.some(d => d.toISOString().slice(0, 10) === currentIso)) {
    opts.unshift(new Date(`${currentIso}T12:00:00`));
  }
  return opts;
}

function buildTimeOptions(currentTime) {
  if (currentTime && !TIME_SLOTS.includes(currentTime)) {
    return [currentTime, ...TIME_SLOTS];
  }
  return TIME_SLOTS;
}

function formatDateOption(d) {
  const iso = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString('ru-RU', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  });
  return { iso, label };
}

export class PaymentPage {
  constructor(container, navigate, params) {
    this.container = container;
    this.navigate = navigate;
    this.orderId = params.get('orderId');
    this.order = null;
    this.userData = null;
    this.useBalance = false;
    this._updatingQty = false;
    this._updatingSlot = false;
    this.init();
  }

  async init() {
    if (!auth.currentUser) { this.navigate('/auth'); return; }
    if (!this.orderId) { this.navigate('/home'); return; }

    this.renderLoading();

    try {
      const [orderSnap, userSnap] = await Promise.all([
        getDoc(doc(db, COL.ORDERS, this.orderId)),
        getDoc(doc(db, COL.USERS, auth.currentUser.uid)),
      ]);

      if (!orderSnap.exists()) { alert('Заказ не найден.'); this.navigate('/home'); return; }
      if (orderSnap.data().paymentStatus === 'paid') { this.navigate('/home'); return; }
      if (orderSnap.data().status === 'cancelled') { this.navigate('/home'); return; }

      this.order = orderSnap.data();
      this.userData = userSnap.exists() ? userSnap.data() : { balance: 0 };

      if (this.order.dateSlot && this.order.timeSlot) {
        cart.setSlot(this.order.dateSlot, this.order.timeSlot);
      }

      await this.enrichOrderNutrition();
      this.render();
    } catch (err) {
      console.error('Payment init error:', err);
      alert('Не удалось загрузить данные заказа.');
      this.navigate('/home');
    }
  }

  enrichOrderNutrition() {
    this.order.items = (this.order.items || []).map(item => {
      if (hasNutrition(item.nutrition)) return item;
      const nutrition = resolveItemNutrition(item);
      return nutrition ? { ...item, nutrition } : item;
    });
  }

  renderLoading() {
    this.container.innerHTML = `
      <div class="pay-shell">
        <header class="pay-header">
          <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
          <span class="menu-title">Оплата</span>
        </header>
        <div class="pay-main"><div class="loading-text">Загрузка…</div></div>
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));
  }

  renderItemRow(item) {
    const imageUrl = resolveItemImage(item);
    const thumb = imageUrl
      ? `<img src="${imageUrl}" alt="${item.name}" loading="lazy" />`
      : `<span class="pay-item-thumb-emoji" aria-hidden="true">🍽️</span>`;

    return `
      <div class="pay-item-row" data-dish-id="${item.dishId}">
        <div class="pay-item-thumb">${thumb}</div>
        <div class="pay-item-main">
          <div class="pay-item-name">${item.name}</div>
          ${renderCartItemCompositionHtml(item, { className: 'order-line-composition pay-item-composition' })}
        </div>
        <div class="pay-qty-stepper">
          <button class="pay-qty-btn btn-press" type="button" data-action="dec" data-dish-id="${item.dishId}" aria-label="Уменьшить">−</button>
          <span class="pay-qty-val">${item.quantity}</span>
          <button class="pay-qty-btn btn-press" type="button" data-action="add" data-dish-id="${item.dishId}" aria-label="Увеличить">+</button>
        </div>
        <div class="pay-item-price">${(item.price * item.quantity).toLocaleString('ru-RU')}&nbsp;₽</div>
      </div>
    `;
  }

  renderSlotFields() {
    const o = this.order;
    const dateOpts = buildDateOptions(o.dateSlot).map(formatDateOption);
    const timeOpts = buildTimeOptions(o.timeSlot);

    return `
      <div class="card pay-slot-card">
        <div class="pay-slot-fields">
          <div class="form-group pay-slot-field">
            <label for="pay-date">📅 Дата</label>
            <select id="pay-date" ${this._updatingSlot ? 'disabled' : ''}>
              ${dateOpts.map(({ iso, label }) => `
                <option value="${iso}" ${iso === o.dateSlot ? 'selected' : ''}>${label}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group pay-slot-field">
            <label for="pay-time">🕐 Время</label>
            <select id="pay-time" ${this._updatingSlot ? 'disabled' : ''}>
              ${timeOpts.map(t => `
                <option value="${t}" ${t === o.timeSlot ? 'selected' : ''}>${t}</option>
              `).join('')}
            </select>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const o = this.order;
    const items = o.items || [];
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const balance = this.userData.balance || 0;
    const orderNutrition = sumNutrition(items);
    const nutritionHtml = orderNutrition
      ? `<div class="pay-nutrition">${renderNutritionGrid(orderNutrition, { title: 'КБЖУ заказа' })}</div>`
      : '';

    this.container.innerHTML = `
      <div class="pay-shell">
        <header class="pay-header">
          <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
          <span class="menu-title">Оплата заказа № ${o.orderNumber}</span>
          ${canCancelOrder(o) ? `
            <button class="btn btn-outline btn-outline-danger btn-pill btn-press pay-cancel-btn" id="btn-cancel" type="button">
              Отменить заказ
            </button>
          ` : ''}
        </header>

        <main class="pay-main" id="pay-main">

          <!-- Items -->
          <div class="card pay-cart-card">
            <div class="pay-items-list" id="pay-items-list">
              ${items.map(i => this.renderItemRow(i)).join('')}
            </div>
            <hr class="pay-divider">
            <div class="pay-total-row" id="pay-total-row">
              <span>Итого</span>
              <span id="pay-subtotal">${subtotal.toLocaleString('ru-RU')} р.</span>
            </div>
            ${nutritionHtml}
          </div>

          <!-- Balance toggle -->
          ${balance > 0 ? `
          <div class="card">
            <div class="balance-toggle">
              <div class="balance-toggle-label">
                Списать с баланса
                <div class="balance-toggle-sub">Доступно: ${balance.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} р.</div>
              </div>
              <label class="toggle-switch">
                <input type="checkbox" id="toggle-balance" ${this.useBalance ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>
          ` : ''}

          <!-- Split preview -->
          <div class="card pay-split-info" id="split-info">
            ${this.renderSplit(subtotal, balance)}
          </div>

          <!-- Date / time -->
          ${this.renderSlotFields()}

        </main>

        <div class="pay-scroll-fade" id="pay-scroll-fade" hidden aria-hidden="true"></div>

        <!-- Pay footer -->
        <div class="pay-footer">
          <button class="btn btn-primary btn-pill btn-press pay-btn" id="btn-pay"
                  ${items.length === 0 ? 'disabled' : ''}>
            Оплатить ${subtotal.toLocaleString('ru-RU')} р.
          </button>
        </div>
      </div>
    `;

    this.bindEvents(subtotal, balance);
  }

  renderSplit(total, balance) {
    const used = this.useBalance ? Math.min(balance, total) : 0;
    const card = total - used;

    if (used === 0) {
      return `<div class="pay-split-row"><span>Оплата картой</span><strong>${total.toLocaleString('ru-RU')} р.</strong></div>`;
    }
    if (card === 0) {
      return `<div class="pay-split-row"><span>Списание с баланса</span><strong>${used.toLocaleString('ru-RU')} р.</strong></div>`;
    }
    return `
      <div class="pay-split-row">
        <span>Баланс</span>
        <strong>−${used.toLocaleString('ru-RU')} р.</strong>
      </div>
      <div class="pay-split-row">
        <span>Карта</span>
        <strong>${card.toLocaleString('ru-RU')} р.</strong>
      </div>
    `;
  }

  getSubtotal() {
    return (this.order.items || []).reduce((s, i) => s + i.price * i.quantity, 0);
  }

  async changeQty(dishId, delta) {
    if (this._updatingQty) return;

    const items = [...(this.order.items || [])];
    const idx = items.findIndex(i => i.dishId === dishId);
    if (idx === -1) return;

    const nextQty = items[idx].quantity + delta;
    if (nextQty <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx] = { ...items[idx], quantity: nextQty };
    }

    this._updatingQty = true;
    try {
      await updateDoc(doc(db, COL.ORDERS, this.orderId), { items });
      this.order.items = items;

      if (items.length === 0) {
        alert('В заказе не осталось блюд. Выберите блюда в меню.');
        this.navigate('/menu');
        return;
      }

      this.render();
    } catch (err) {
      console.error('Update order items error:', err);
      alert('Не удалось изменить количество. Попробуйте ещё раз.');
    } finally {
      this._updatingQty = false;
    }
  }

  async changeSlot(dateSlot, timeSlot) {
    if (this._updatingSlot) return;
    if (dateSlot === this.order.dateSlot && timeSlot === this.order.timeSlot) return;

    this._updatingSlot = true;
    const dateEl = document.getElementById('pay-date');
    const timeEl = document.getElementById('pay-time');
    dateEl?.setAttribute('disabled', '');
    timeEl?.setAttribute('disabled', '');

    try {
      await updateDoc(doc(db, COL.ORDERS, this.orderId), { dateSlot, timeSlot });
      this.order.dateSlot = dateSlot;
      this.order.timeSlot = timeSlot;
      cart.setSlot(dateSlot, timeSlot);
    } catch (err) {
      console.error('Update slot error:', err);
      alert('Не удалось изменить дату или время.');
      if (dateEl) dateEl.value = this.order.dateSlot || '';
      if (timeEl) timeEl.value = this.order.timeSlot || '';
    } finally {
      dateEl?.removeAttribute('disabled');
      timeEl?.removeAttribute('disabled');
      this._updatingSlot = false;
    }
  }

  bindEvents(subtotal, balance) {
    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));

    document.getElementById('pay-items-list')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, dishId } = btn.dataset;
      if (action === 'add') this.changeQty(dishId, 1);
      if (action === 'dec') this.changeQty(dishId, -1);
    });

    const toggle = document.getElementById('toggle-balance');
    toggle?.addEventListener('change', () => {
      this.useBalance = toggle.checked;
      document.getElementById('split-info').innerHTML = this.renderSplit(this.getSubtotal(), balance);
    });

    document.getElementById('btn-pay').addEventListener('click', () => this.pay());

    document.getElementById('btn-cancel')?.addEventListener('click', () => this.cancelOrder());

    const onSlotChange = () => {
      const dateSlot = document.getElementById('pay-date')?.value;
      const timeSlot = document.getElementById('pay-time')?.value;
      if (dateSlot && timeSlot) this.changeSlot(dateSlot, timeSlot);
    };
    document.getElementById('pay-date')?.addEventListener('change', onSlotChange);
    document.getElementById('pay-time')?.addEventListener('change', onSlotChange);

    this.bindPayScrollFade();
  }

  bindPayScrollFade() {
    this._scrollFadeCleanup?.();
    this._scrollFadeCleanup = bindScrollFade({
      shell: document.querySelector('.pay-shell'),
      main: document.getElementById('pay-main'),
      fade: document.getElementById('pay-scroll-fade'),
      footer: document.querySelector('.pay-footer'),
      classScrollHint: 'pay-shell--scroll-hint',
      classHasOverflow: 'pay-shell--has-overflow',
    });
  }

  async cancelOrder() {
    if (!confirm('Отменить заказ? Это действие нельзя отменить.')) return;

    const btn = document.getElementById('btn-cancel');
    btn.disabled = true;
    btn.textContent = 'Отменяем…';

    try {
      await cancelUnpaidOrder(this.orderId);
      cart.clear();
      this.navigate('/home');
    } catch (err) {
      console.error('Cancel order error:', err);
      alert(err.message || 'Не удалось отменить заказ.');
      btn.disabled = false;
      btn.textContent = 'Отменить заказ';
    }
  }

  async pay() {
    const btn = document.getElementById('btn-pay');
    btn.disabled = true;
    btn.textContent = 'Обрабатываем оплату…';

    try {
      const result = await processOrderPayment(this.orderId, this.useBalance);
      cart.clear();
      this.renderSuccess(result);
    } catch (err) {
      console.error('Payment error:', err);
      alert(`Ошибка оплаты: ${err.message}`);
      btn.disabled = false;
      btn.textContent = 'Оплатить';
    }
  }

  renderSuccess({ checkId, check }) {
    const balancePaid = check.paymentParts?.balance || 0;
    const cardPaid = check.paymentParts?.card || 0;
    const { fd, fp } = check.fiscalData || {};

    this.container.innerHTML = `
      <div class="success-screen">
        <div class="success-icon">✅</div>
        <div class="success-title">Оплачено!</div>
        <div class="success-sub">
          Заказ № ${this.order.orderNumber} передан на кухню.<br>
          Ожидайте готовности — следите за экраном очереди.
        </div>

        <div class="success-fiscal">
          <strong>Кассовый чек</strong>
          Чек ID: ${checkId}<br>
          ${balancePaid > 0 ? `Баланс: −${balancePaid.toLocaleString('ru-RU')} р.<br>` : ''}
          ${cardPaid > 0 ? `Карта: ${cardPaid.toLocaleString('ru-RU')} р.<br>` : ''}
          Итого: ${check.total.toLocaleString('ru-RU')} р.<br>
          ${fd ? `ФД: ${fd} · ФП: ${fp}` : ''}
        </div>

        <button class="btn btn-primary btn-pill btn-press" style="width:100%;padding:16px;font-size:16px;"
                id="btn-to-home">На главную</button>
      </div>
    `;

    document.getElementById('btn-to-home').addEventListener('click', () => this.navigate('/home'));
  }
}
