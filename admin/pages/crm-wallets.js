import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createWalletsEditor } from '../components/wallets-editor.js';
import { openWalletDistributionModal } from '../components/wallet-distribution-modal.js';
import { ensureDefaultCrmRefs, fetchLoyaltyCategories, fetchUserGroups } from '../services/crm-ref-data.js';
import { fetchCrmUsers } from '../services/users-data.js';
import { fetchMenuSettings } from '../services/menu-settings-data.js';
import { ensureDefaultWallets, fetchWallets } from '../services/wallets-data.js';

export class CrmWalletsPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.editor = null;
    this.loading = true;
    this.error = null;
    this.init();
  }

  async init() {
    this.renderShell();
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    this.renderShell();
    try {
      await ensureDefaultCrmRefs();
      await ensureDefaultWallets();
      const [wallets, users, groups, loyaltyCategories, menuSettings] = await Promise.all([
        fetchWallets(),
        fetchCrmUsers(),
        fetchUserGroups(),
        fetchLoyaltyCategories(),
        fetchMenuSettings([]),
      ]);
      this.wallets = wallets;
      this.users = users;
      this.groups = groups;
      this.loyaltyCategories = loyaltyCategories;
      this.categoryGroups = menuSettings.categoryGroups || [];
      this.groupsById = new Map(groups.map(g => [g.id, g.name]));
      this.error = null;
    } catch (err) {
      console.error('[crm-wallets]', err);
      this.error = err.message || 'Не удалось загрузить кошельки';
    } finally {
      this.loading = false;
      this.renderShell();
    }
  }

  openDistribution(walletId = null) {
    openWalletDistributionModal({
      wallets: this.wallets,
      userGroups: this.groups,
      loyaltyCategories: this.loyaltyCategories,
      users: this.users,
      groupsById: this.groupsById,
      defaultWalletId: walletId,
      onComplete: () => this.loadData(),
    });
  }

  renderShell() {
    const bodyHtml = this.loading
      ? '<div class="admin-loading">Загрузка кошельков…</div>'
      : this.error
        ? `<div class="admin-error card">${this.error}</div>`
        : '<div class="avr-page card" id="wal-editor-host"></div>';

    this.container.innerHTML = renderAdminShell({
      active: 'crm-wallets',
      title: 'Кошельки',
      subtitle: 'Справочник кошельков и массовое распределение средств',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
    if (!this.loading && !this.error) this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#wal-editor-host');
    if (!host) return;
    this.editor = createWalletsEditor(host, {
      wallets: this.wallets,
      categoryGroups: this.categoryGroups,
      userGroups: this.groups,
      onSaved: () => this.loadData(),
      onDistribute: (walletId) => this.openDistribution(walletId),
    });
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
    document.getElementById('wallet-dist-modal')?.remove();
  }
}
