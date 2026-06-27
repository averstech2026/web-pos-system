import { auth, db } from '../../shared/firebase.js';
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, writeBatch, getDocs,
} from 'firebase/firestore';
import { COL, NOTIF_TYPE, createNotificationDoc } from '../../shared/schema.js';
import { fmtDateTime } from '../utils/format.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';

const NOTIF_ICON = {
  [NOTIF_TYPE.ORDER]: '📦',
  [NOTIF_TYPE.PROMO]: '🎁',
  [NOTIF_TYPE.SYSTEM]: '📢',
};

const DEMO_NOTIFICATIONS = [
  { type: NOTIF_TYPE.PROMO, title: 'Скидка 10% на салаты', body: 'До конца недели все салаты со скидкой 10%. Приятного аппетита!' },
  { type: NOTIF_TYPE.ORDER, title: 'Заказ готов к выдаче', body: 'Ваш заказ №042 готов. Покажите QR-код на кассе.' },
  { type: NOTIF_TYPE.SYSTEM, title: 'Обновление меню', body: 'В меню появились новые блюда: тыквенный крем-суп и стейк из лосося.' },
];

export class NotificationsPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this._unsub = null;
    this.init();
  }

  async init() {
    if (!auth.currentUser) { this.navigate('/auth'); return; }
    this.renderShell();
    try {
      await this.ensureDemoNotifications();
    } catch (err) {
      console.error('Demo notifications seed error:', err);
    }
    this.subscribeNotifications();
  }

  /** Seed demo notifications once per user if collection is empty */
  async ensureDemoNotifications() {
    const uid = auth.currentUser.uid;
    const q = query(
      collection(db, COL.NOTIFICATIONS),
      where('userId', '==', uid),
    );
    const snap = await getDocs(q);
    if (!snap.empty) return;

    const batch = writeBatch(db);
    for (const n of DEMO_NOTIFICATIONS) {
      const ref = doc(collection(db, COL.NOTIFICATIONS));
      batch.set(ref, createNotificationDoc({ userId: uid, ...n }));
    }
    await batch.commit();
  }

  renderShell() {
    this.container.innerHTML = `
      <div class="lk-shell subpage-shell">
        <header class="lk-header">
          <div class="lk-header-left">
            <button class="back-btn btn-press" id="btn-back" type="button" aria-label="Назад">←</button>
            <span class="subpage-title">Уведомления</span>
          </div>
          <div class="lk-header-right">
            <button class="header-btn header-btn-text btn-press" id="btn-mark-read">Прочитать все</button>
            <img class="header-logo" src="${logoUrl}" alt="iFCM TECH" />
          </div>
        </header>

        <main class="lk-main">
          <div id="notif-list" class="notif-list">
            <div class="loading-text">Загрузка…</div>
          </div>
        </main>
      </div>
    `;

    document.getElementById('btn-back').addEventListener('click', () => this.navigate('/home'));
    document.getElementById('btn-mark-read').addEventListener('click', () => this.markAllRead());
  }

  subscribeNotifications() {
    const q = query(
      collection(db, COL.NOTIFICATIONS),
      where('userId', '==', auth.currentUser.uid),
    );

    this._unsub = onSnapshot(q, snap => {
      const el = document.getElementById('notif-list');
      if (!el) return;

      const docs = [...snap.docs].sort((a, b) => {
        const ta = a.data().createdAt?.toMillis?.() ?? 0;
        const tb = b.data().createdAt?.toMillis?.() ?? 0;
        return tb - ta;
      }).slice(0, 50);

      if (docs.length === 0) {
        el.innerHTML = `<p class="empty-text">Уведомлений пока нет</p>`;
        return;
      }

      el.innerHTML = docs.map(d => {
        const n = d.data();
        const icon = NOTIF_ICON[n.type] || '📋';
        const unread = !n.read;
        return `
          <button class="notif-card card btn-press ${unread ? 'notif-card--unread' : ''}"
                  data-notifid="${d.id}" type="button">
            <div class="notif-icon">${icon}</div>
            <div class="notif-body">
              <div class="notif-title">${n.title}</div>
              <div class="notif-text">${n.body}</div>
              <div class="notif-date">${fmtDateTime(n.createdAt)}</div>
            </div>
            ${unread ? '<span class="notif-dot" aria-label="Непрочитано"></span>' : ''}
          </button>
        `;
      }).join('');

      el.querySelectorAll('[data-notifid]').forEach(btn => {
        btn.addEventListener('click', () => this.markRead(btn.dataset.notifid));
      });
    }, err => {
      console.error('Notifications snapshot error:', err);
      const el = document.getElementById('notif-list');
      if (el) el.innerHTML = `<p class="empty-text">Не удалось загрузить уведомления</p>`;
    });
  }

  async markRead(id) {
    try {
      await updateDoc(doc(db, COL.NOTIFICATIONS, id), { read: true });
    } catch (err) {
      console.error('Mark read error:', err);
    }
  }

  async markAllRead() {
    const q = query(
      collection(db, COL.NOTIFICATIONS),
      where('userId', '==', auth.currentUser.uid),
      where('read', '==', false),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.update(d.ref, { read: true }));
    await batch.commit();
  }

  destroy() {
    this._unsub?.();
  }
}
