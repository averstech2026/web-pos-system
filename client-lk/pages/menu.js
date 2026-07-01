import { auth, db } from '../../shared/firebase.js';
import {
  collection, doc, getDoc, getDocs, addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { COL, ORDER_STATUS, PAYMENT_STATUS, ORDER_SOURCE } from '../../shared/schema.js';
import { getItemImageUrl, resolveProductImageUrl } from '../../shared/item-images.js';
import { cart } from '../store.js';
import { openItemDetailModal } from '../components/item-detail.js';
import { resolveItemNutrition } from '../../shared/demo-nutrition.js';
import { filterActiveRules, isMenuItemAvailableAt, normalizeAvailabilityRuleDoc } from '../../shared/availability-rules.js';
import { normalizePromoRuleDoc } from '../../shared/promo-rules.js';
import { filterWebVisibleCategoryGroups, mergeCategoryGroups, sortCategoryGroupsByChannel } from '../../shared/menu-catalog.js';
import { fetchWebMenuItems } from '../../shared/menu-items-data.js';
import { fetchMarketingBannersForLk } from '../services/marketing-banners-data.js';
import { getStoredLocationId } from '../../shared/marketing-banners.js';
import {
  bindMarketingBlock,
  getVisibleMarketingContent,
  renderMarketingBlockHtml,
} from '../components/marketing-block.js';

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
    this.items = [];
    this.categories = [];
    this.activeCategory = null;
    this.allRules = [];
    this.promoRules = [];
    this.categoryGroups = [];
    this._marketingBanners = [];
    this._cartUnsub = null;
    this.init();
  }

  async init() {
    if (!auth.currentUser) { this.navigate('/auth'); return; }
    if (!cart.dateSlot) { this.navigate('/home'); return; }

    this.renderSkeleton();
    await Promise.all([
      this.fetchItems(),
      fetchMarketingBannersForLk()
        .then(banners => { this._marketingBanners = banners; })
        .catch(err => console.warn('[menu] marketing load failed', err)),
    ]);
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
    const uid = auth.currentUser?.uid;
    const [webItems, rulesSnap, promosSnap, menuSnap, userSnap] = await Promise.all([
      fetchWebMenuItems(),
      getDocs(collection(db, COL.AVAILABILITY_RULES)),
      getDocs(collection(db, COL.PROMO_RULES)),
      getDoc(doc(db, COL.SETTINGS, 'menu')),
      uid ? getDoc(doc(db, COL.USERS, uid)) : Promise.resolve(null),
    ]);

    this._userGroupId = userSnap?.exists() ? userSnap.data().userGroupId : null;

    this.allRules = filterActiveRules(
      rulesSnap.docs.map(d => normalizeAvailabilityRuleDoc({ id: d.id, ...d.data() }, d.id)),
    );

    this.promoRules = promosSnap.docs
      .map(d => normalizePromoRuleDoc({ id: d.id, ...d.data() }, d.id))
      .filter(p => p.visibleInWeb !== false);

    const menuData = menuSnap.exists() ? menuSnap.data() : {};
    const groups = sortCategoryGroupsByChannel(
      filterWebVisibleCategoryGroups(mergeCategoryGroups(menuData.categoryGroups || [])),
      'web',
    );
    this.categoryGroups = groups;
    this.groupsByName = new Map(groups.map(g => [g.name, g]));

    const slot = { date: cart.dateSlot, time: cart.timeSlot };

    const allItems = webItems.map(data => ({
      ...data,
      nutrition: resolveItemNutrition(data),
    }));

    this.items = allItems.filter(item => isMenuItemAvailableAt(item, this.groupsByName, this.allRules, slot));

    cart.setPromoContext({
      activePromos: this.promoRules,
      allAvailabilityRules: this.allRules,
      catalogItems: allItems,
      categoryGroups: this.categoryGroups,
    });

    const groupNames = groups.map(g => g.name);
    const found = [...new Set(this.items.map(i => i.category))];
    this.categories = [
      ...groupNames.filter(c => found.includes(c)),
      ...found.filter(c => !groupNames.includes(c)).sort((a, b) => a.localeCompare(b, 'ru')),
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

        <div class="cat-tabs-wrap">
          <div class="cat-tabs hide-scrollbar" id="cat-tabs">
            ${this.categories.map(c => `
              <button class="cat-tab ${c === this.activeCategory ? 'active' : ''}"
                      type="button"
                      data-cat="${c}">${c}</button>
            `).join('')}
          </div>
        </div>

        <div class="menu-scroll" id="menu-scroll">
          <div id="mkt-block-host" class="menu-marketing-host"></div>
          <div class="items-grid" id="items-grid"></div>
        </div>

        <div class="cart-bar" id="cart-bar" style="display:none">
          <button class="btn btn-primary btn-pill btn-press cart-bar-btn" id="btn-checkout">
            <span class="cart-bar-inner">
              <span class="cart-bar-badge" id="cart-bar-badge" aria-hidden="true">
                <span class="cart-bar-icon">
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
                    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zM7.16 14l.84-2h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20.01 4H5.21l-.94-2H1v2h2l3.6 7.59-1.35 2.44C4.52 15.37 5.48 17 7 17h12v-2H7.42c-.14 0-.25-.11-.26-.25z"/>
                  </svg>
                </span>
                <span class="cart-bar-qty" id="cart-bar-qty">0</span>
              </span>
              <span class="cart-bar-btn-text" id="cart-bar-label">Оформить заказ</span>
              <span class="cart-bar-amount" id="cart-bar-total">0 р.</span>
            </span>
          </button>
        </div>

      </div>
    `;

    this.bindMenuEvents();
    this.renderMarketing();
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

  renderMarketing() {
    const host = document.getElementById('mkt-block-host');
    if (!host) return;

    const marketingCtx = {
      userGroupId: this._userGroupId || null,
      currentLocationId: getStoredLocationId(),
      allRules: this.allRules,
      slot: { date: cart.dateSlot, time: cart.timeSlot },
      device: 'lk',
    };
    const content = getVisibleMarketingContent(this._marketingBanners, marketingCtx);
    host.innerHTML = renderMarketingBlockHtml(content, marketingCtx);
    bindMarketingBlock(host, content.all);
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
      if (action === 'add') {
        const item = this.items.find(i => i.id === id);
        cart.add(id, name, Number(price), item?.nutrition || null);
      }
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
        cart.add(item.id, item.name, item.price, item.nutrition || null);
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
    const qty = document.getElementById('cart-bar-qty');
    const total = document.getElementById('cart-bar-total');
    if (!bar) return;

    const count = cart.count();
    if (count === 0) {
      bar.style.display = 'none';
    } else {
      bar.style.display = 'block';
      if (qty) qty.textContent = String(count);
      label.textContent = 'Оформить заказ';
      total.textContent = `${cart.total().toLocaleString('ru-RU')} р.`;
      total.style.display = '';
      const badge = document.getElementById('cart-bar-badge');
      if (badge) badge.style.display = '';
      if (qty) qty.style.display = '';
    }
  }

  async createOrderAndPay() {
    const btn = document.getElementById('btn-checkout');
    if (!btn || btn.disabled) return;
    if (cart.count() === 0) return;

    btn.disabled = true;
    btn.querySelector('#cart-bar-label').textContent = 'Создаём заказ…';
    btn.querySelector('#cart-bar-total').style.display = 'none';
    const badge = btn.querySelector('#cart-bar-badge');
    if (badge) badge.style.display = 'none';

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
        source: ORDER_SOURCE.WEB,
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(db, COL.ORDERS), orderData);
      this.navigate(`/payment?orderId=${ref.id}`);
    } catch (err) {
      console.error('Create order error:', err);
      alert('Не удалось создать заказ. Попробуйте ещё раз.');
      btn.disabled = false;
      btn.querySelector('#cart-bar-total').style.display = '';
      this.updateCartBar();
    }
  }

  destroy() {
    this._cartUnsub?.();
    document.getElementById('item-detail-modal')?.remove();
    document.getElementById('mkt-detail-modal')?.remove();
  }
}
