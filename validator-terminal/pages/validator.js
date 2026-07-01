import { auth } from '../../shared/firebase.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';
import cardIconUrl from '../../kiosk/public/assets/card.png';
import {
  evaluateValidation,
  getDefaultValidationSuccessHeadline,
  resolveValidationDeniedHeadline,
  resolveValidationDisplayMs,
  resolveValidationSuccessHeadline,
} from '../../shared/validation-rules.js';
import { fetchAllValidationRules } from '../../admin/services/validation-rules-data.js';
import { fetchActiveAvailabilityRules } from '../../admin/services/availability-rules-data.js';
import { rulesToMap } from '../../shared/availability-rules.js';
import { fetchValidationLogs, persistValidationResult, resetValidatorDemoForUsers } from '../../admin/services/validation-logs-data.js';
import { fetchUserGroups } from '../../admin/services/crm-ref-data.js';
import { fetchAllItems } from '../../admin/services/products-data.js';
import { fetchWorkShifts } from '../../admin/services/work-shifts-data.js';
import { fetchCrmUsers } from '../../admin/services/users-data.js';
import { USER_STATUS } from '../../shared/schema.js';

const CHANNEL_POINT = 'Раздача №1';

function resultSuccessHeadline(result) {
  if (result?.rule) return resolveValidationSuccessHeadline(result.rule);
  return getDefaultValidationSuccessHeadline('meal_set');
}

function resultDeniedHeadline(result) {
  if (result?.rule) return resolveValidationDeniedHeadline(result.rule);
  return resolveValidationDeniedHeadline(null);
}

function resultDisplayMs(result) {
  if (result?.rule) return resolveValidationDisplayMs(result.rule);
  return resolveValidationDisplayMs(null);
}

/**
 * Клиенты, для группы которых есть хотя бы одно активное правило валидации.
 * @param {object[]} users
 * @param {import('../../shared/validation-rules.js').ValidationRuleDoc[]} rules
 */
function filterValidatorClients(users, rules) {
  const groupIdsWithRules = new Set(
    rules
      .filter(r => r.isActive && r.targetUserGroupIds?.length)
      .flatMap(r => r.targetUserGroupIds),
  );

  return users
    .filter(u =>
      u.status === USER_STATUS.ACTIVE
      && u.qrCode
      && u.userGroupId
      && groupIdsWithRules.has(u.userGroupId))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

/** @param {object} user @param {Map<string, string>} groupsById */
function clientButtonParts(user, groupsById) {
  const parts = String(user.name || '').trim().split(/\s+/).filter(Boolean);
  const name = parts[0] || user.name || '—';
  const tag = groupsById.get(user.userGroupId) || '';
  return { name, tag };
}

export class ValidatorPage {
  constructor(container) {
    this.container = container;
    this.state = 'idle';
    this.result = null;
    this.resetTimer = null;
    this.rules = [];
    this.logs = [];
    /** @type {object[]} */
    this.clients = [];
    this.itemsById = new Map();
    this.groupsById = new Map();
    /** @type {Map<string, object>} */
    this.shiftsById = new Map();
    /** @type {Map<string, import('../../shared/availability-rules.js').AvailabilityRuleDoc>} */
    this.availabilityRulesById = new Map();
    this.init();
  }

  async init() {
    this.render();
    await this.loadData();
  }

  async loadData() {
    try {
      const [rules, groups, items, logs, availabilityRules, workShifts, users] = await Promise.all([
        fetchAllValidationRules(),
        fetchUserGroups(),
        fetchAllItems(),
        fetchValidationLogs({ limitCount: 300 }),
        fetchActiveAvailabilityRules(),
        fetchWorkShifts(),
        fetchCrmUsers(),
      ]);
      this.rules = rules;
      this.logs = logs;
      this.groupsById = new Map(groups.map(g => [g.id, g.name]));
      this.shiftsById = new Map(workShifts.map(s => [s.id, s]));
      this.itemsById = new Map(items.map(i => [i.id, i.name]));
      this.availabilityRulesById = rulesToMap(availabilityRules);
      this.clients = filterValidatorClients(users, rules);
      this.updateToolbar();
    } catch (err) {
      console.warn('[validator] load failed', err);
    }
  }

  renderToolbarHtml() {
    if (!this.clients.length) {
      return `
        <p class="vtd-toolbar-empty">
          Нет клиентов с правилами валидации.
          Создайте клиента в CRM, назначьте группу и добавьте правило для этой группы.
        </p>
      `;
    }

    return `
      <div class="vtd-toolbar-inner">
        <div class="vtd-demo-btns">
          ${this.clients.map(client => {
            const { name, tag } = clientButtonParts(client, this.groupsById);
            return `
              <button type="button" class="vtd-demo-btn btn-press" data-user-id="${escAttr(client.id)}">
                <span class="vtd-demo-btn__name">${esc(name)}</span>
                ${tag ? `<span class="vtd-demo-btn__tag">${esc(tag)}</span>` : ''}
              </button>
            `;
          }).join('')}
        </div>
        <button type="button" class="vtd-reset-btn btn-press" data-action="reset-approaches"
                aria-label="Сбросить счётчики подходов" title="Сбросить счётчики подходов">×</button>
      </div>
    `;
  }

  bindToolbar() {
    this.container.querySelectorAll('[data-user-id]').forEach(btn => {
      btn.addEventListener('click', () => this.handleCard(btn.dataset.userId));
    });
    this.container.querySelector('[data-action="reset-approaches"]')?.addEventListener('click', () => {
      this.handleResetApproaches();
    });
  }

  updateToolbar() {
    const toolbar = this.container.querySelector('.vtd-toolbar');
    if (!toolbar) return;
    toolbar.innerHTML = this.renderToolbarHtml();
    this.bindToolbar();
  }

  render() {
    this.container.innerHTML = `
      <div class="vtd-shell">
        <div class="vtd-top">
          <header class="vtd-head">
            <img class="vtd-logo" src="${logoUrl}" alt="iFCM TECH" />
            <h1 class="vtd-head-title">Валидатор прохода</h1>
            <div class="vtd-head-meta">
              <span class="vtd-head-point">${esc(CHANNEL_POINT)}</span>
              <span class="vtd-head-user">${esc(auth.currentUser?.email || '')}</span>
            </div>
          </header>

          <div class="vtd-toolbar">
            ${this.renderToolbarHtml()}
          </div>
        </div>

        <main class="vtd-main">
          <section class="vtd-board" aria-live="polite">
            ${this.renderBoard()}
          </section>
        </main>
      </div>
    `;

    this.bindToolbar();
  }

  renderBoard() {
    if (this.state === 'idle') {
      return `
        <div class="vtd-idle">
          <img class="vtd-idle-logo" src="${logoUrl}" alt="iFCM TECH" />
          <div class="vtd-idle-prompt">
            <img class="vtd-idle-icon" src="${cardIconUrl}" alt="" width="340" height="303" />
            <p class="vtd-idle-text">Приложите пропуск</p>
          </div>
        </div>
      `;
    }

    const r = this.result;
    const isSuccess = r?.status === 'success';

    if (isSuccess) {
      const remainder = r.approachesLeft != null
        ? `${r.approachesLeft} подход${r.approachesLeft === 1 ? '' : 'ов'}`
        : r.balanceAfter != null
          ? `${r.balanceAfter} руб.${r.allowOverdraft && r.balanceAfter < 0 ? ' (разрешённый минус)' : ''}`
          : '';

      return `
        <article class="vtd-result-card card vtd-result-card--success">
          <header class="vtd-result-head">
            <span class="vtd-result-head-icon" aria-hidden="true">✓</span>
            <span class="vtd-result-head-title">${esc(resultSuccessHeadline(r))}</span>
          </header>
          <div class="vtd-result-body">
            <section class="vtd-result-section">
              <h2 class="vtd-result-section-title">Сотрудник</h2>
              <dl class="vtd-result-dl">
                <div class="vtd-result-field">
                  <dt>ФИО</dt>
                  <dd>${esc(r.userName)}</dd>
                </div>
                <div class="vtd-result-field">
                  <dt>Пропуск</dt>
                  <dd>№${esc(r.cardNumber)}</dd>
                </div>
                <div class="vtd-result-field">
                  <dt>Группа</dt>
                  <dd>${esc(r.groupName)}</dd>
                </div>
              </dl>
            </section>
            <section class="vtd-result-section">
              <h2 class="vtd-result-section-title">Операция</h2>
              <dl class="vtd-result-dl">
                <div class="vtd-result-field">
                  <dt>Правило</dt>
                  <dd>${esc(r.rule?.name || '—')}</dd>
                </div>
                <div class="vtd-result-field">
                  <dt>Списание</dt>
                  <dd>${esc(r.deductionSummary || '—')}</dd>
                </div>
                ${remainder ? `
                  <div class="vtd-result-field vtd-result-field--emph">
                    <dt>Остаток</dt>
                    <dd>${esc(remainder)}</dd>
                  </div>
                ` : ''}
              </dl>
            </section>
          </div>
        </article>
      `;
    }

    return `
      <article class="vtd-result-card card vtd-result-card--error">
        <header class="vtd-result-head">
          <span class="vtd-result-head-icon" aria-hidden="true">✕</span>
          <span class="vtd-result-head-title">${esc(resultDeniedHeadline(r))}</span>
        </header>
        <div class="vtd-result-body">
          <section class="vtd-result-section">
            <h2 class="vtd-result-section-title">Сотрудник</h2>
            <dl class="vtd-result-dl">
              <div class="vtd-result-field">
                <dt>ФИО</dt>
                <dd>${esc(r?.userName || 'Неизвестный')}</dd>
              </div>
              <div class="vtd-result-field">
                <dt>Пропуск</dt>
                <dd>№${esc(r?.cardNumber || '—')}</dd>
              </div>
            </dl>
          </section>
          <section class="vtd-result-section vtd-result-section--alert">
            <h2 class="vtd-result-section-title">Причина отказа</h2>
            <p class="vtd-result-alert">${esc(r?.denyReason || 'Ошибка валидации')}</p>
          </section>
        </div>
      </article>
    `;
  }

  async handleResetApproaches() {
    const btn = this.container.querySelector('[data-action="reset-approaches"]');
    if (!btn || btn.disabled || !this.clients.length) return;

    btn.disabled = true;
    try {
      await resetValidatorDemoForUsers({
        userIds: this.clients.map(c => c.id),
        performedBy: auth.currentUser?.email || 'validator-terminal',
      });
      await this.loadData();
    } catch (err) {
      console.warn('[validator] reset approaches failed', err.message);
    } finally {
      btn.disabled = false;
    }
  }

  async handleCard(userId) {
    clearTimeout(this.resetTimer);
    const user = this.clients.find(u => u.id === userId);
    if (!user) return;

    const result = evaluateValidation({
      user,
      rules: this.rules,
      logs: this.logs,
      itemsById: this.itemsById,
      groupsById: this.groupsById,
      shiftsById: this.shiftsById,
      availabilityRules: this.availabilityRulesById,
      channelPoint: CHANNEL_POINT,
    });

    this.state = 'result';
    this.result = result;
    this.updateBoard();

    try {
      await persistValidationResult(result, {
        performedBy: auth.currentUser?.email || 'validator-terminal',
        channelPoint: CHANNEL_POINT,
      });
      await this.loadData();
    } catch (err) {
      console.warn('[validator] log persist skipped', err.message);
    }

    this.resetTimer = setTimeout(() => {
      this.state = 'idle';
      this.result = null;
      this.updateBoard();
    }, resultDisplayMs(result));
  }

  updateBoard() {
    const board = this.container.querySelector('.vtd-board');
    if (board) board.innerHTML = this.renderBoard();
  }

  destroy() {
    clearTimeout(this.resetTimer);
    this.container.innerHTML = '';
  }
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;');
}
