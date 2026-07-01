import { auth, db } from '../../shared/firebase.js';
import { signOut } from 'firebase/auth';
import {
  doc, getDoc, collection, query, where, onSnapshot,
} from 'firebase/firestore';
import { COL, ORDER_STATUS } from '../../shared/schema.js';
import { cancelUnpaidOrder } from '../../shared/orders.js';
import { cart } from '../store.js';
import { fmtDate, fmtDateTime, fmtMoney, orderStatusIcon, orderStatusLabel, orderTotal } from '../utils/format.js';
import { qrDataUrl } from '../utils/qr.js';
import { openOrderDetailModal } from '../components/order-detail.js';
import { bindScrollFade } from '../utils/scroll-fade.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';
import { fetchMarketingBannersForLk } from '../services/marketing-banners-data.js';
import { fetchAllAvailabilityRules } from '../services/availability-rules-data.js';
import { getStoredLocationId } from '../../shared/marketing-banners.js';
import {
  bindMarketingBlock,
  getVisibleMarketingContent,
  renderMarketingBlockHtml,
} from '../components/marketing-block.js';

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

export class HomePage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.user = null;
    this.userData = null;
    this._unsubOrders = null;
    this._unsubNotif = null;
    this._orderDocs = [];
    this._marketingBanners = [];
    this._availabilityRules = [];
    this.init();
  }

  async init() {
    this.user = auth.currentUser;
    if (!this.user) { this.navigate('/auth'); return; }

    const snap = await getDoc(doc(db, COL.USERS, this.user.uid));
    this.userData = snap.exists()
      ? snap.data()
      : { name: this.user.email.split('@')[0], balance: 0, role: 'client' };

    const qrData = `LK:${this.user.uid}`;
    [this.qrSmall, this.qrLarge] = await Promise.all([
      qrDataUrl(qrData, 64),
      qrDataUrl(qrData, 220),
    ]);

    try {
      [this._marketingBanners, this._availabilityRules] = await Promise.all([
        fetchMarketingBannersForLk(),
        fetchAllAvailabilityRules(),
      ]);
    } catch (err) {
      console.warn('[home] marketing banners load failed', err);
    }

    this.renderShell();
    this.subscribeOrders();
    this.subscribeUnreadCount();
  }

  renderShell() {
    const u = this.userData;
    const shortCode = this.user.uid.slice(0, 12).toUpperCase();
    const balanceDisplay = (u.balance ?? 0).toLocaleString('ru-RU', { minimumFractionDigits: 2 }) + ' ₽';

    const marketingCtx = {
      userGroupId: u.userGroupId || null,
      currentLocationId: getStoredLocationId(),
      allRules: this._availabilityRules,
      slot: { date: cart.dateSlot, time: cart.timeSlot },
      device: 'lk',
    };
    const marketingContent = getVisibleMarketingContent(this._marketingBanners, marketingCtx);
    const marketingHtml = renderMarketingBlockHtml(marketingContent, marketingCtx);

    this.container.innerHTML = `
      <div class="lk-shell">

        <header class="lk-header">
          <div class="lk-header-left">
            <button class="header-btn" id="btn-menu-toggle" aria-label="Меню">☰</button>
            <button class="header-profile-btn btn-press" id="btn-profile" type="button">
              <div class="header-avatar">${u.name.charAt(0).toUpperCase()}</div>
              <span class="header-name">${u.name}</span>
            </button>
          </div>
          <div class="lk-header-right">
            <button class="header-btn header-btn-notif btn-press" id="btn-notifications" aria-label="Уведомления">
              🔔
              <span class="notif-badge" id="notif-badge" style="display:none"></span>
            </button>
            <img class="header-logo" src="${logoUrl}" alt="iFCM TECH" />
          </div>
        </header>

        <main class="lk-main" id="lk-main">
          <div id="mkt-block-host">${marketingHtml}</div>

          <div class="lk-id-card">
            <div class="id-card-surface">
              <div class="id-card-pattern" aria-hidden="true"></div>
              <div class="id-card-content">
                <div class="id-card-info">
                  <div class="id-card-details" id="btn-show-qr" role="button" tabindex="0" aria-label="Показать QR-карту">
                    <div class="id-card-label">Карта питания:</div>
                    <div class="id-card-number">${shortCode}</div>
                    <div class="id-card-balance-row">
                      <span class="id-card-balance-label">Баланс:</span>
                      <span class="id-card-balance">${balanceDisplay}</span>
                    </div>
                  </div>
                  <button class="id-card-history-link btn-press" id="btn-history" type="button">Смотреть историю заказов &gt;</button>
                </div>
                <button class="id-card-qr btn-press" id="btn-show-qr-icon" type="button" aria-label="Показать QR-код">
                  <img src="${this.qrSmall}" alt="QR-код" loading="lazy" />
                </button>
              </div>
            </div>
          </div>

          <h3 class="section-title">Активные заказы:</h3>
          <div id="orders-list" class="orders-list">
            <div class="loading-text">Загрузка…</div>
          </div>
        </main>

        <div class="lk-scroll-fade" id="lk-scroll-fade" hidden aria-hidden="true"></div>

        <div class="lk-bottom-bar">
          <button class="btn btn-primary btn-pill btn-press new-order-btn" id="btn-new-order">Новый заказ</button>
        </div>

        <!-- Side drawer -->
        <div class="drawer-overlay" id="drawer-overlay" style="display:none"></div>
        <nav class="drawer" id="drawer" aria-label="Навигация">
          <div class="drawer-header">
            <div class="header-avatar">${u.name.charAt(0).toUpperCase()}</div>
            <div>
              <div class="drawer-name">${u.name}</div>
              <div class="drawer-email">${this.user.email}</div>
            </div>
          </div>
          <button class="drawer-item btn-press" data-route="/home">🏠 Главная</button>
          <button class="drawer-item btn-press" data-route="/history">📋 История заказов</button>
          <button class="drawer-item btn-press" data-route="/notifications">🔔 Уведомления</button>
          <button class="drawer-item btn-press" data-route="/profile">👤 Профиль</button>
          <button class="drawer-item drawer-item--danger btn-press" id="btn-drawer-logout">Выйти</button>
        </nav>

        <!-- QR Card modal -->
        <div class="modal-overlay" id="qr-modal" style="display:none" role="dialog" aria-modal="true">
          <div class="modal card qr-modal">
            <div class="modal-header qr-modal-header">
              <span class="modal-title">КАРТА</span>
              <button class="modal-close" id="btn-qr-close" aria-label="Закрыть">✕</button>
            </div>
            <div class="qr-modal-body">
              <p class="modal-subtitle">Покажите QR на кассе, чтобы получить заказ</p>
              <div class="qr-large-wrap">
                <img src="${this.qrLarge}" alt="QR-код" />
              </div>
              <div class="qr-code-row">
                <span class="qr-code-text">${shortCode}</span>
                <button class="qr-copy-btn" id="btn-copy-code" title="Скопировать код">⧉</button>
              </div>
            </div>
            <button class="btn btn-primary btn-pill btn-press qr-close-btn" id="btn-qr-close-2">Закрыть</button>
          </div>
        </div>

        <!-- Date / time slot picker modal -->
        <div class="modal-overlay" id="slot-modal" style="display:none" role="dialog" aria-modal="true">
          <div class="modal card">
            <div class="modal-header">
              <span class="modal-title">Новый заказ</span>
              <button class="modal-close" id="btn-slot-close" aria-label="Закрыть">✕</button>
            </div>
            <div class="form-stack">
            <div class="form-group">
              <label>Дата</label>
              <select id="slot-date">
                ${getDateOptions(7).map(d => {
                  const iso = d.toISOString().slice(0, 10);
                  const label = d.toLocaleDateString('ru-RU', {
                    weekday: 'short', day: '2-digit', month: '2-digit',
                  });
                  return `<option value="${iso}">${label}</option>`;
                }).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Время получения</label>
              <select id="slot-time">
                <option value="11:30">11:30</option>
                <option value="12:00" selected>12:00</option>
                <option value="12:30">12:30</option>
                <option value="13:00">13:00</option>
                <option value="13:30">13:30</option>
              </select>
            </div>
            <button class="btn btn-primary btn-pill btn-press" id="btn-go-menu">Выбрать блюда →</button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.bindEvents();
    this.bindMarketing();
  }

  bindMarketing() {
    const host = document.getElementById('mkt-block-host');
    if (!host) return;

    const marketingCtx = {
      userGroupId: this.userData?.userGroupId || null,
      currentLocationId: getStoredLocationId(),
      allRules: this._availabilityRules,
      slot: { date: cart.dateSlot, time: cart.timeSlot },
      device: 'lk',
    };
    const { all } = getVisibleMarketingContent(this._marketingBanners, marketingCtx);

    bindMarketingBlock(host, all);
  }

  bindEvents() {
    const showQR = () => (document.getElementById('qr-modal').style.display = 'flex');
    const hideQR = () => (document.getElementById('qr-modal').style.display = 'none');

    document.getElementById('btn-show-qr').addEventListener('click', showQR);
    document.getElementById('btn-show-qr-icon').addEventListener('click', showQR);
    document.getElementById('btn-qr-close').addEventListener('click', hideQR);
    document.getElementById('btn-qr-close-2').addEventListener('click', hideQR);
    document.getElementById('qr-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) hideQR();
    });

    document.getElementById('btn-history').addEventListener('click', () => this.navigate('/history'));
    document.getElementById('btn-profile').addEventListener('click', () => this.navigate('/profile'));
    document.getElementById('btn-notifications').addEventListener('click', () => this.navigate('/notifications'));

    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const code = this.user.uid.slice(0, 12).toUpperCase();
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('btn-copy-code');
        btn.textContent = '✓';
        setTimeout(() => (btn.textContent = '⧉'), 1500);
      });
    });

    const showSlot = () => (document.getElementById('slot-modal').style.display = 'flex');
    const hideSlot = () => (document.getElementById('slot-modal').style.display = 'none');

    document.getElementById('btn-new-order').addEventListener('click', showSlot);
    document.getElementById('btn-slot-close').addEventListener('click', hideSlot);
    document.getElementById('slot-modal').addEventListener('click', e => {
      if (e.target === e.currentTarget) hideSlot();
    });

    document.getElementById('btn-go-menu').addEventListener('click', () => {
      const dateSlot = document.getElementById('slot-date').value;
      const timeSlot = document.getElementById('slot-time').value;
      cart.clear();
      cart.setSlot(dateSlot, timeSlot);
      hideSlot();
      this.navigate('/menu');
    });

    // Drawer
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawer-overlay');
    const openDrawer = () => {
      overlay.style.display = 'block';
      drawer.classList.add('drawer--open');
    };
    const closeDrawer = () => {
      overlay.style.display = 'none';
      drawer.classList.remove('drawer--open');
    };

    document.getElementById('btn-menu-toggle').addEventListener('click', openDrawer);
    overlay.addEventListener('click', closeDrawer);
    drawer.querySelectorAll('[data-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        closeDrawer();
        this.navigate(btn.dataset.route);
      });
    });
    document.getElementById('btn-drawer-logout').addEventListener('click', async () => {
      closeDrawer();
      if (confirm('Выйти из системы?')) {
        await signOut(auth);
        this.navigate('/auth');
      }
    });

    this.bindScrollFade();
  }

  bindScrollFade() {
    this._scrollFadeCleanup?.();
    this._scrollFadeCleanup = bindScrollFade({
      shell: document.querySelector('.lk-shell'),
      main: document.getElementById('lk-main'),
      fade: document.getElementById('lk-scroll-fade'),
      footer: document.querySelector('.lk-bottom-bar'),
      classScrollHint: 'lk-shell--scroll-hint',
      classHasOverflow: 'lk-shell--has-overflow',
    });
  }

  subscribeOrders() {
    const statusesToShow = [ORDER_STATUS.PENDING, ORDER_STATUS.COOKING, ORDER_STATUS.READY];

    const q = query(
      collection(db, COL.ORDERS),
      where('userId', '==', this.user.uid),
      where('status', 'in', statusesToShow),
    );

    this._unsubOrders = onSnapshot(q, snap => {
      const el = document.getElementById('orders-list');
      if (!el) return;

      const docs = [...snap.docs].sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() ?? 0;
        const tb = b.data().createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      });

      this._orderDocs = docs;

      if (docs.length === 0) {
        el.innerHTML = `<p class="empty-text">Активных заказов нет</p>`;
        return;
      }

      el.innerHTML = docs.map(d => {
        const o = d.data();
        const total = orderTotal(o.items);
        const icon = orderStatusIcon(o.status);
        const label = orderStatusLabel(o.status);
        const actionEl = o.paymentStatus === 'unpaid'
          ? `<button class="order-status-pill order-status-pill--pay btn-press" type="button" data-orderid="${d.id}">Оплатить</button>`
          : `<span class="order-status-pill order-status-pill--${o.status}">${label}</span>`;

        const createdLabel = fmtDateTime(o.createdAt);
        const pickupLabel = [fmtDate(o.dateSlot), o.timeSlot].filter(Boolean).join(', ');

        return `
          <div class="order-card card btn-press" data-orderid="${d.id}" role="button" tabindex="0">
            <div class="order-card-icon">${icon}</div>
            <div class="order-card-info">
              <div class="order-card-meta">Заказ № ${o.orderNumber}${createdLabel ? ` · ${createdLabel}` : ''}</div>
              ${pickupLabel ? `<div class="order-card-submeta">Выдача: ${pickupLabel}</div>` : ''}
              <div class="order-card-total">${fmtMoney(total)}</div>
            </div>
            <span class="order-card-action">${actionEl}</span>
          </div>
        `;
      }).join('');

      el.querySelectorAll('.order-card').forEach(card => {
        const open = () => {
          const docSnap = this._orderDocs.find(d => d.id === card.dataset.orderid);
          if (!docSnap) return;
          openOrderDetailModal(
            { id: docSnap.id, data: docSnap.data() },
            {
              onPay: id => this.navigate(`/payment?orderId=${id}`),
              onCancel: id => cancelUnpaidOrder(id),
            },
          );
        };
        card.addEventListener('click', e => {
          if (e.target.closest('.order-status-pill[data-orderid]')) return;
          open();
        });
        card.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        });
      });

      el.querySelectorAll('.order-status-pill[data-orderid]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          this.navigate(`/payment?orderId=${btn.dataset.orderid}`);
        });
      });
    }, err => {
      console.error('Orders snapshot error:', err);
      const el = document.getElementById('orders-list');
      if (!el) return;
      if (err.code === 'permission-denied') {
        el.innerHTML = `
          <p class="empty-text">
            Не удалось загрузить заказы. Возможно, вы вошли под терминальным аккаунтом
            (киоск / очередь). Выйдите и войдите с клиентским email.
          </p>`;
      }
    });
  }

  subscribeUnreadCount() {
    const q = query(
      collection(db, COL.NOTIFICATIONS),
      where('userId', '==', this.user.uid),
      where('read', '==', false),
    );

    this._unsubNotif = onSnapshot(q, snap => {
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      const count = snap.size;
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }, () => {});
  }

  destroy() {
    this._scrollFadeCleanup?.();
    this._unsubOrders?.();
    this._unsubNotif?.();
    document.getElementById('order-detail-modal')?.remove();
    document.getElementById('mkt-detail-modal')?.remove();
  }
}
