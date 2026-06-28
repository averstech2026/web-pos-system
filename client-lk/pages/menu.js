import { auth, db } from '../../shared/firebase.js';
import {
  collection, getDocs, addDoc, query, where,
  serverTimestamp,
} from 'firebase/firestore';
import { COL, ORDER_STATUS, PAYMENT_STATUS } from '../../shared/schema.js';
import { getItemImageUrl, resolveProductImageUrl } from '../../shared/item-images.js';
import { cart } from '../store.js';
import { openItemDetailModal } from '../components/item-detail.js';

function resolveImageUrl(item) {
  return resolveProductImageUrl(item.imageUrl) || getItemImageUrl(item.name);
}

/** Emoji per category */
const CAT_EMOJI = {
  'Первые блюда': '🍲',
  'Вторые блюда': '🍽️',
  'Салаты': '🥗',
  'Напитки': '🧃',
  'Выпечка': '🥐',
};

/** Generate 3-digit order number */
function orderNum() {
  return String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
}

/** Format ISO date → 'DD.MM.YY' */
function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

export class MenuPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.items = [];           // all Firestore items
    this.categories = [];      // ordered unique category list
    this.activeCategory = null;
    this._cartUnsub = null;
    this.init();
  }

  async init() {
    if (!auth.currentUser) { this.navigate('/auth'); return; }
    if (!cart.dateSlot) { this.navigate('/home'); return; }

    this.renderSkeleton();
    await this.fetchItems();
    this.renderFull();
    this._cartUnsub = cart.subscribe(() => this.updateCartBar());
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="menu-shell">
        <header class="menu-header">
          <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
          <span class="menu-title">Загрузка меню…</span>
        </header>
        <div class="menu-scroll"><div class="loading-text">Загрузка блюд…</div></div>
      </div>
    `;
    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));
  }

  async fetchItems() {
    const snap = await getDocs(
      query(collection(db, COL.ITEMS), where('isAvailable', '==', true))
    );
    this.items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Preserve a nice category order
    const order = ['Первые блюда', 'Вторые блюда', 'Салаты', 'Напитки', 'Выпечка'];
    const found = [...new Set(this.items.map(i => i.category))];
    this.categories = [
      ...order.filter(c => found.includes(c)),
      ...found.filter(c => !order.includes(c)),
    ];
    this.activeCategory = this.categories[0] || null;
  }

  renderFull() {
    const dateLabel = fmtDate(cart.dateSlot);
    const timeLabel = cart.timeSlot || '';

    this.container.innerHTML = `
      <div class="menu-shell">

        <header class="menu-header">
          <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
          <span class="menu-title">Заказ на ${dateLabel}, ${timeLabel}</span>
        </header>

        <!-- Category tabs -->
        <div class="cat-tabs-wrap">
          <div class="cat-tabs hide-scrollbar" id="cat-tabs">
            ${this.categories.map(c => `
              <button class="cat-tab ${c === this.activeCategory ? 'active' : ''}"
                      type="button"
                      data-cat="${c}">${c}</button>
            `).join('')}
          </div>
        </div>

        <!-- Items grid -->
        <div class="menu-scroll" id="menu-scroll">
          <div class="items-grid" id="items-grid"></div>
        </div>

        <!-- Sticky cart bar -->
        <div class="cart-bar" id="cart-bar" style="display:none">
          <button class="btn btn-primary btn-pill btn-press cart-bar-btn" id="btn-checkout">
            <span id="cart-bar-label">Оформить заказ</span>
            <span class="cart-bar-badge" id="cart-bar-total">0 р.</span>
          </button>
        </div>

      </div>
    `;

    this.bindMenuEvents();
    this.renderItems();
    this.updateCartBar();
    requestAnimationFrame(() => this.scrollActiveCategory(false));
  }

  scrollActiveCategory(smooth = true) {
    const active = document.querySelector('#cat-tabs .cat-tab.active');
    if (!active) return;
    active.scrollIntoView({
      behavior: smooth ? 'smooth' : 'instant',
      block: 'nearest',
      inline: 'center',
    });
  }

  bindMenuEvents() {
    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));

    document.getElementById('cat-tabs').addEventListener('click', e => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      this.activeCategory = btn.dataset.cat;
      document.querySelectorAll('.cat-tab').forEach(b => b.classList.toggle('active', b.dataset.cat === this.activeCategory));
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      this.renderItems();
    });

    document.getElementById('btn-checkout').addEventListener('click', () => this.createOrderAndPay());

    document.getElementById('items-grid').addEventListener('click', e => {
      const detailBtn = e.target.closest('[data-action="detail"]');
      if (detailBtn) {
        const item = this.items.find(i => i.id === detailBtn.dataset.id);
        if (item) this.openItemDetail(item);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, name, price } = btn.dataset;
      if (action === 'add') { cart.add(id, name, Number(price)); }
      if (action === 'dec') { cart.decrement(id); }
      this.renderItems();
    });
  }

  openItemDetail(item) {
    const emoji = CAT_EMOJI[item.category] || '🍴';
    openItemDetailModal(item, {
      imageUrl: resolveImageUrl(item),
      emoji,
      getQty: () => cart.qty(item.id),
      onAdd: () => {
        cart.add(item.id, item.name, item.price);
        this.renderItems();
        this.updateCartBar();
      },
      onDec: () => {
        cart.decrement(item.id);
        this.renderItems();
        this.updateCartBar();
      },
    });
  }

  renderItems() {
    const grid = document.getElementById('items-grid');
    if (!grid) return;

    const filtered = this.items.filter(i => i.category === this.activeCategory);

    if (!filtered.length) {
      grid.innerHTML = `<p class="empty-text" style="grid-column:1/-1">Нет доступных блюд</p>`;
      return;
    }

    grid.innerHTML = filtered.map(item => {
      const qty = cart.qty(item.id);
      const emoji = CAT_EMOJI[item.category] || '🍴';
      const imageUrl = resolveImageUrl(item);
      const media = imageUrl
        ? `<button class="item-image-wrap btn-press" type="button" data-action="detail" data-id="${item.id}" aria-label="Подробнее: ${item.name}">
             <img class="item-image" src="${imageUrl}" alt="${item.name}" loading="lazy" />
           </button>`
        : `<button class="item-emoji btn-press" type="button" data-action="detail" data-id="${item.id}" aria-label="Подробнее: ${item.name}">${emoji}</button>`;

      return `
        <div class="item-card" data-id="${item.id}">
          ${media}
          <div class="item-price">${item.price} Р</div>
          <div class="item-name">${item.name}</div>
          ${item.description ? `<div class="item-desc">${item.description}</div>` : '<div class="item-desc item-desc--empty"></div>'}

          <div class="item-action">
          ${qty === 0
            ? `<button class="item-add-btn btn-press" data-action="add" data-id="${item.id}"
                        data-name="${item.name}" data-price="${item.price}">В корзину</button>`
            : `<div class="item-qty-ctrl">
                 <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
                 <span class="qty-val">${qty}</span>
                 <button class="qty-btn" data-action="add" data-id="${item.id}"
                         data-name="${item.name}" data-price="${item.price}">+</button>
               </div>`
          }
          </div>
        </div>
      `;
    }).join('');
  }

  updateCartBar() {
    const bar = document.getElementById('cart-bar');
    const label = document.getElementById('cart-bar-label');
    const total = document.getElementById('cart-bar-total');
    if (!bar) return;

    const count = cart.count();
    if (count === 0) {
      bar.style.display = 'none';
    } else {
      bar.style.display = 'block';
      label.textContent = `Оформить заказ (${count} ${pluralItem(count)})`;
      total.textContent = `${cart.total().toLocaleString('ru-RU')} р.`;
    }
  }

  async createOrderAndPay() {
    const btn = document.getElementById('btn-checkout');
    if (!btn || btn.disabled) return;
    if (cart.count() === 0) return;

    btn.disabled = true;
    btn.querySelector('#cart-bar-label').textContent = 'Создаём заказ…';

    try {
      const user = auth.currentUser;
      const orderData = {
        orderNumber: orderNum(),
        userId: user.uid,
        checkId: null,
        status: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.UNPAID,
        items: cart.items,
        dateSlot: cart.dateSlot,
        timeSlot: cart.timeSlot,
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, COL.ORDERS), orderData);
      this.navigate(`/payment?orderId=${ref.id}`);
    } catch (err) {
      console.error('Create order error:', err);
      alert('Не удалось создать заказ. Попробуйте ещё раз.');
      btn.disabled = false;
      this.updateCartBar();
    }
  }

  destroy() {
    this._cartUnsub?.();
    document.getElementById('item-detail-modal')?.remove();
  }
}

function pluralItem(n) {
  const mod = n % 10;
  if (mod === 1 && n !== 11) return 'блюдо';
  if (mod >= 2 && mod <= 4 && (n < 10 || n > 20)) return 'блюда';
  return 'блюд';
}
