import { auth } from '../../shared/firebase.js';
import logoUrl from '../../shared/assets/logo-ifcm-tech.png';
import cardIconUrl from '../../kiosk/public/assets/card.png';
import {
  DEMO_VALIDATOR_CARDS,
  evaluateValidation,
  getDefaultValidationSuccessHeadline,
  resolveValidationDeniedHeadline,
  resolveValidationDisplayMs,
  resolveValidationSuccessHeadline,
} from '../../shared/validation-rules.js';
import { fetchAllValidationRules } from '../../admin/services/validation-rules-data.js';
import { fetchActiveAvailabilityRules } from '../../admin/services/availability-rules-data.js';
import { rulesToMap } from '../../shared/availability-rules.js';
import { fetchValidationLogs, persistValidationResult } from '../../admin/services/validation-logs-data.js';
import { fetchUserGroups } from '../../admin/services/crm-ref-data.js';
import { fetchAllItems } from '../../admin/services/products-data.js';
import { fetchWorkShifts } from '../../admin/services/work-shifts-data.js';

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
 * @param {object} demoCard
 * @param {Map<string, number>} demoClickCounts
 * @param {Map<string, string>} groupsById
 * @param {Map<string, import('../../shared/availability-rules.js').AvailabilityRuleDoc>} availabilityRulesById
 * @param {Map<string, object>} [shiftsById]
 * @param {import('../../shared/validation-rules.js').ValidationRuleDoc[]} [allRules]
 */
function runDemoValidation(demoCard, demoClickCounts, groupsById, availabilityRulesById, shiftsById = new Map(), allRules = []) {
  const card = DEMO_VALIDATOR_CARDS.find(c => c.id === demoCard.id);
  if (!card) return null;

  const persisted = card.rule?.id ? allRules.find(r => r.id === card.rule.id) : null;
  const rule = persisted ? { ...card.rule, ...persisted } : { ...card.rule };

  const user = { ...card.user };
  const clickCount = demoClickCounts.get(card.id) || 0;
  demoClickCounts.set(card.id, clickCount + 1);
  const groupName = groupsById.get(user.userGroupId)
    || (user.userGroupId === 'askona' ? 'Завод Аскона' : '—');

  if (card.id === 'demo-sidorov') {
    return {
      status: 'denied',
      denyReason: 'Ошибка: В выходные дни подходы не доступны по вашему тарифу',
      user,
      rule,
      userName: user.name,
      cardNumber: user.qrCode,
      groupName,
      channelPoint: CHANNEL_POINT,
    };
  }

  if (card.simulateLimitOnRepeat && clickCount >= 1) {
    return {
      status: 'denied',
      denyReason: `Превышен лимит подходов на сегодня (${clickCount} из ${rule.approachLimit} уже использован${clickCount === 1 ? '' : 'о'})`,
      user,
      rule,
      userName: user.name,
      cardNumber: user.qrCode,
      groupName,
      channelPoint: CHANNEL_POINT,
    };
  }

  if (card.id === 'demo-petrov') {
    const wallet = user.wallets?.dotation;
    const balance = Number(wallet?.balance) || 100;
    const amount = 300;
    const balanceAfter = balance - amount;
    user.wallets = {
      dotation: { ...wallet, balance: balanceAfter },
    };
    return {
      status: 'success',
      user,
      rule,
      userName: user.name,
      cardNumber: user.qrCode,
      groupName,
      channelPoint: CHANNEL_POINT,
      deductionType: 'money',
      deductionSummary: `Списано: ${amount} руб. (Баланс кошелька "${wallet?.name || 'Субсидия'}")`,
      balanceAfter,
      walletId: 'dotation',
      amount,
      approachesLeft: 0,
      allowOverdraft: true,
    };
  }

  if (card.id === 'demo-ivanov') {
    const mealLabel = (card.mealNames || []).join(', ');
    return {
      status: 'success',
      user,
      rule,
      userName: user.name,
      cardNumber: user.qrCode,
      groupName,
      channelPoint: CHANNEL_POINT,
      deductionType: 'meal_set',
      deductionSummary: `Списано: Обед составной (${mealLabel})`,
      approachesLeft: 0,
      itemIds: [],
    };
  }

  return evaluateValidation({
    user,
    rules: [rule],
    logs: [],
    itemsById: new Map(),
    groupsById,
    shiftsById,
    availabilityRules: availabilityRulesById,
    channelPoint: CHANNEL_POINT,
  });
}

export class ValidatorPage {
  constructor(container) {
    this.container = container;
    this.state = 'idle';
    this.result = null;
    this.resetTimer = null;
    this.rules = [];
    this.logs = [];
    this.itemsById = new Map();
    this.groupsById = new Map();
    /** @type {Map<string, object>} */
    this.shiftsById = new Map();
    /** @type {Map<string, import('../../shared/availability-rules.js').AvailabilityRuleDoc>} */
    this.availabilityRulesById = new Map();
    /** @type {Map<string, number>} */
    this.demoClickCounts = new Map();
    this.init();
  }

  async init() {
    this.render();
    await this.loadData();
  }

  async loadData() {
    try {
      const [rules, groups, items, logs, availabilityRules, workShifts] = await Promise.all([
        fetchAllValidationRules(),
        fetchUserGroups(),
        fetchAllItems(),
        fetchValidationLogs({ limitCount: 300 }),
        fetchActiveAvailabilityRules(),
        fetchWorkShifts(),
      ]);
      this.rules = rules;
      this.logs = logs;
      this.groupsById = new Map(groups.map(g => [g.id, g.name]));
      this.shiftsById = new Map(workShifts.map(s => [s.id, s]));
      this.itemsById = new Map(items.map(i => [i.id, i.name]));
      this.availabilityRulesById = rulesToMap(availabilityRules);
    } catch (err) {
      console.warn('[validator] load failed, demo mode only', err);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="vtd-shell">
        <header class="vtd-head">
          <img class="vtd-logo" src="${logoUrl}" alt="iFCM TECH" />
          <h1 class="vtd-head-title">Валидатор прохода</h1>
          <div class="vtd-head-meta">
            <span class="vtd-head-point">${esc(CHANNEL_POINT)}</span>
            <span class="vtd-head-user">${esc(auth.currentUser?.email || '')}</span>
          </div>
        </header>

        <main class="vtd-main">
          <section class="vtd-board" aria-live="polite">
            ${this.renderBoard()}
          </section>

          <aside class="vtd-demo">
            <h2 class="vtd-demo-title">Эмуляция карт (тест демо)</h2>
            <div class="vtd-demo-cards">
              ${DEMO_VALIDATOR_CARDS.map(card => `
                <button type="button" class="vtd-demo-card btn-press" data-demo-card="${escAttr(card.id)}">
                  <span class="vtd-demo-card__label">${esc(card.label)}</span>
                </button>
              `).join('')}
            </div>
          </aside>
        </main>
      </div>
    `;

    this.container.querySelectorAll('[data-demo-card]').forEach(btn => {
      btn.addEventListener('click', () => this.handleDemoCard(btn.dataset.demoCard));
    });
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

  async handleDemoCard(cardId) {
    clearTimeout(this.resetTimer);
    const result = runDemoValidation(
      { id: cardId },
      this.demoClickCounts,
      this.groupsById,
      this.availabilityRulesById,
      this.shiftsById,
      this.rules,
    );
    if (!result) return;

    this.state = 'result';
    this.result = result;
    this.updateBoard();

    try {
      await persistValidationResult(result, {
        performedBy: auth.currentUser?.email || 'validator-terminal',
        channelPoint: CHANNEL_POINT,
      });
      if (result.status === 'success' && result.deductionType === 'money' && result.user?.id?.startsWith('demo-')) {
        const card = DEMO_VALIDATOR_CARDS.find(c => c.id === cardId);
        if (card?.user?.wallets?.dotation) {
          card.user.wallets.dotation.balance = result.balanceAfter;
        }
      }
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
