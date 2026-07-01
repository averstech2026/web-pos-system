/**
 * Validation & meal deduction rules (collection: validation_rules).
 * Used by cafeteria validator terminal and admin rule constructor.
 */

import { isAvailableByRule, rulesToMap } from './availability-rules.js';
import {
  createDefaultWorkShiftDoc,
  resolveUserWorkShift,
  shiftIntervalStartDate,
} from './work-shifts.js';

/** @typedef {'day'|'shift'|'week'|'month'|'period'|'total'} ApproachInterval */

/** @typedef {'meal_set'|'money'|'pass_only'} ValidationActionType */

/** @deprecated legacy field — use availabilityRuleId */
/** @typedef {'weekdays'|'everyday'|'lunch_hours'} ScheduleTemplate */

/**
 * @typedef {object} ValidationRuleDoc
 * @property {string} id
 * @property {string} name
 * @property {string[]} targetUserGroupIds
 * @property {string|null} availabilityRuleId - ref to availability_rules/{id}; null = always
 * @property {ScheduleTemplate|null} [scheduleTemplate] - legacy, read-only fallback
 * @property {number} approachLimit
 * @property {ApproachInterval} approachInterval
 * @property {string|null} [approachPeriodStart] - YYYY-MM-DD, for approachInterval === 'period'
 * @property {string|null} [approachPeriodEnd] - YYYY-MM-DD, for approachInterval === 'period'
 * @property {number} approachNumber
 * @property {ValidationActionType} actionType
 * @property {string[]} [itemIds] - meal_set
 * @property {number} [amount] - money
 * @property {string} [walletId] - money
 * @property {boolean} [allowOverdraft] - money
 * @property {boolean} isActive
 * @property {number} [resultDisplaySeconds] - время показа экрана результата на терминале (3–60 сек)
 * @property {string|null} [successHeadline] - заголовок «разрешено»; null = типовой по типу списания
 * @property {string|null} [deniedHeadline] - заголовок «запрещено»; null = типовой
 */

export const DEFAULT_VALIDATION_DISPLAY_SECONDS = 5;
export const DEFAULT_VALIDATION_DENIED_HEADLINE = 'Отказ в выдаче · Блокировка';

/** @deprecated use availability_rules catalog */
export const SCHEDULE_TEMPLATE_OPTIONS = [
  { id: 'weekdays', label: 'Только в будни' },
  { id: 'everyday', label: 'Каждый день' },
  { id: 'lunch_hours', label: 'Только обеденное время 12:00–16:00' },
];

export const APPROACH_INTERVAL_OPTIONS = [
  { id: 'day', label: 'В день' },
  { id: 'shift', label: 'В смену' },
  { id: 'week', label: 'В неделю' },
  { id: 'month', label: 'В месяц' },
  { id: 'period', label: 'В период' },
  { id: 'total', label: 'Всего' },
];

export const ACTION_TYPE_OPTIONS = [
  { id: 'meal_set', label: 'Списание пайки (Набор товаров)' },
  { id: 'money', label: 'Списание денежных средств' },
  { id: 'pass_only', label: 'Только факт прохода' },
];

const SCHEDULE_IDS = SCHEDULE_TEMPLATE_OPTIONS.map(o => o.id);
const INTERVAL_IDS = APPROACH_INTERVAL_OPTIONS.map(o => o.id);
const ACTION_IDS = ACTION_TYPE_OPTIONS.map(o => o.id);
const DISPLAY_SECONDS_MIN = 3;
const DISPLAY_SECONDS_MAX = 60;

/** @param {Partial<ValidationRuleDoc>|ValidationActionType|string|null|undefined} ruleOrAction */
export function getDefaultValidationSuccessHeadline(ruleOrAction) {
  const actionType = typeof ruleOrAction === 'string'
    ? ruleOrAction
    : ruleOrAction?.actionType;
  if (actionType === 'money') return 'Доступ разрешён · Списание выполнено';
  if (actionType === 'pass_only') return 'Доступ разрешён · Проход зафиксирован';
  return 'Доступ разрешён · Выдайте обед';
}

/** @param {Partial<ValidationRuleDoc>|null|undefined} rule */
export function resolveValidationSuccessHeadline(rule) {
  const custom = String(rule?.successHeadline || '').trim();
  return custom || getDefaultValidationSuccessHeadline(rule);
}

/** @param {Partial<ValidationRuleDoc>|null|undefined} rule */
export function resolveValidationDeniedHeadline(rule) {
  const custom = String(rule?.deniedHeadline || '').trim();
  return custom || DEFAULT_VALIDATION_DENIED_HEADLINE;
}

/** @param {Partial<ValidationRuleDoc>|null|undefined} rule */
export function resolveValidationDisplayMs(rule) {
  const sec = Number(rule?.resultDisplaySeconds);
  if (!Number.isFinite(sec)) return DEFAULT_VALIDATION_DISPLAY_SECONDS * 1000;
  return Math.min(DISPLAY_SECONDS_MAX, Math.max(DISPLAY_SECONDS_MIN, Math.round(sec))) * 1000;
}

/** @param {Partial<ValidationRuleDoc>|null|undefined} rule */
export function resolveValidationDisplaySeconds(rule) {
  const sec = Number(rule?.resultDisplaySeconds);
  if (!Number.isFinite(sec)) return DEFAULT_VALIDATION_DISPLAY_SECONDS;
  return Math.min(DISPLAY_SECONDS_MAX, Math.max(DISPLAY_SECONDS_MIN, Math.round(sec)));
}

/** @returns {ValidationRuleDoc} */
export function createDefaultValidationRule(id = '') {
  return normalizeValidationRuleDoc({
    id: id || `vld-${Date.now()}`,
    name: 'Новое правило',
    targetUserGroupIds: [],
    availabilityRuleId: null,
    approachLimit: 1,
    approachInterval: 'day',
    approachNumber: 1,
    actionType: 'meal_set',
    itemIds: [],
    amount: 0,
    walletId: 'dotation',
    allowOverdraft: false,
    isActive: true,
  }, id);
}

/** @param {Partial<ValidationRuleDoc>|null|undefined} raw @param {string} [fallbackId] */
export function normalizeValidationRuleDoc(raw, fallbackId = '') {
  const id = String(raw?.id || fallbackId || '').trim() || `vld-${Date.now()}`;
  const availabilityRuleId = raw?.availabilityRuleId ? String(raw.availabilityRuleId).trim() : null;
  const legacySchedule = !availabilityRuleId && SCHEDULE_IDS.includes(raw?.scheduleTemplate)
    ? raw.scheduleTemplate
    : null;
  const approachInterval = INTERVAL_IDS.includes(raw?.approachInterval)
    ? raw.approachInterval
    : 'day';
  const actionType = ACTION_IDS.includes(raw?.actionType) ? raw.actionType : 'meal_set';
  const approachPeriodStart = normalizeDateOnly(raw?.approachPeriodStart);
  const approachPeriodEnd = normalizeDateOnly(raw?.approachPeriodEnd);

  return {
    id,
    name: String(raw?.name || '').trim() || 'Без названия',
    targetUserGroupIds: Array.isArray(raw?.targetUserGroupIds)
      ? [...new Set(raw.targetUserGroupIds.filter(Boolean))]
      : [],
    availabilityRuleId: availabilityRuleId || null,
    scheduleTemplate: legacySchedule,
    approachLimit: Math.max(1, Number(raw?.approachLimit) || 1),
    approachInterval,
    approachPeriodStart: approachInterval === 'period' ? approachPeriodStart : null,
    approachPeriodEnd: approachInterval === 'period' ? approachPeriodEnd : null,
    approachNumber: Math.max(1, Number(raw?.approachNumber) || 1),
    actionType,
    itemIds: actionType === 'meal_set' && Array.isArray(raw?.itemIds)
      ? [...new Set(raw.itemIds.filter(Boolean))]
      : [],
    amount: actionType === 'money' ? Math.max(0, Number(raw?.amount) || 0) : 0,
    walletId: actionType === 'money' ? (raw?.walletId || 'dotation') : '',
    allowOverdraft: actionType === 'money' && raw?.allowOverdraft === true,
    isActive: raw?.isActive !== false,
    resultDisplaySeconds: resolveValidationDisplaySeconds({ resultDisplaySeconds: raw?.resultDisplaySeconds }),
    successHeadline: String(raw?.successHeadline || '').trim() || null,
    deniedHeadline: String(raw?.deniedHeadline || '').trim() || null,
  };
}

/** @param {unknown} value @returns {string|null} */
function normalizeDateOnly(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return raw;
}

/** @param {string|null|undefined} iso */
function parseDateOnly(iso) {
  const normalized = normalizeDateOnly(iso);
  if (!normalized) return null;
  const [y, m, d] = normalized.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @param {Date} date */
function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** @param {ValidationRuleDoc|Partial<ValidationRuleDoc>} rule */
export function validateValidationRuleDoc(rule) {
  const errors = [];
  if (!rule.name?.trim()) errors.push('Укажите название правила');
  if (!rule.targetUserGroupIds?.length) errors.push('Выберите хотя бы одну группу клиентов');
  if (rule.approachInterval === 'period') {
    if (!rule.approachPeriodStart || !rule.approachPeriodEnd) {
      errors.push('Укажите даты начала и окончания периода');
    } else if (rule.approachPeriodStart > rule.approachPeriodEnd) {
      errors.push('Дата начала периода не может быть позже даты окончания');
    }
  }
  if (rule.actionType === 'meal_set' && !rule.itemIds?.length) {
    errors.push('Добавьте товары для списания пайки');
  }
  if (rule.actionType === 'money') {
    if (!rule.amount || rule.amount <= 0) errors.push('Укажите сумму списания');
    if (!rule.walletId) errors.push('Выберите кошелёк');
  }
  const displaySec = Number(rule.resultDisplaySeconds);
  if (Number.isFinite(displaySec) && (displaySec < DISPLAY_SECONDS_MIN || displaySec > DISPLAY_SECONDS_MAX)) {
    errors.push(`Время показа результата: от ${DISPLAY_SECONDS_MIN} до ${DISPLAY_SECONDS_MAX} сек`);
  }
  return errors;
}

/** @param {ValidationRuleDoc|Partial<ValidationRuleDoc>} rule */
export function buildValidationRulePayload(rule) {
  const normalized = normalizeValidationRuleDoc(rule, rule.id);
  const { id, scheduleTemplate, ...payload } = normalized;
  void id;
  void scheduleTemplate;
  if (!payload.availabilityRuleId) delete payload.availabilityRuleId;
  if (payload.approachInterval !== 'period') {
    delete payload.approachPeriodStart;
    delete payload.approachPeriodEnd;
  }
  return payload;
}

/** @param {Date} now */
function slotFromDate(now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` };
}

/**
 * @param {ValidationRuleDoc} rule
 * @param {Date} now
 * @param {Map<string, import('./availability-rules.js').AvailabilityRuleDoc>} [availabilityRulesById]
 */
export function isValidationRuleAvailableAt(rule, now = new Date(), availabilityRulesById = new Map()) {
  if (rule.availabilityRuleId) {
    const availRule = availabilityRulesById.get(rule.availabilityRuleId);
    if (!availRule) return false;
    return isAvailableByRule(availRule, slotFromDate(now));
  }
  if (rule.scheduleTemplate) {
    return matchesScheduleTemplate(rule.scheduleTemplate, now);
  }
  return true;
}

/** @param {ValidationRuleDoc} rule */
export function formatValidationRuleApproachShort(rule) {
  const limit = Math.max(1, Number(rule.approachLimit) || 1);
  const intervalShort = {
    day: 'день',
    shift: 'смену',
    week: 'неделю',
    month: 'месяц',
    period: 'период',
    total: 'всего',
  };
  const key = INTERVAL_IDS.includes(rule.approachInterval) ? rule.approachInterval : 'day';
  const word = intervalShort[key] || 'интервал';
  return `${limit}× в ${word}`;
}

/** @param {ValidationRuleDoc} rule */
export function formatValidationRuleActionShort(rule) {
  const short = {
    meal_set: 'Пайка',
    money: 'Деньги',
    pass_only: 'Проход',
  };
  if (short[rule.actionType]) return short[rule.actionType];
  return ACTION_TYPE_OPTIONS.find(o => o.id === rule.actionType)?.label?.split('(')[0]?.trim() || '—';
}

/**
 * @param {ValidationRuleDoc} rule
 * @param {Map<string, string>} [groupsById]
 */
export function formatValidationRuleAudienceShort(rule, groupsById = new Map()) {
  const ids = rule.targetUserGroupIds || [];
  if (!ids.length) return 'Аудитория не задана';
  if (ids.length === 1) return groupsById.get(ids[0]) || ids[0];
  if (ids.length === 2) {
    return ids.map(id => groupsById.get(id) || id).join(' · ');
  }
  const first = groupsById.get(ids[0]) || ids[0];
  return `${first} · +${ids.length - 1}`;
}

/** @param {ValidationRuleDoc} rule @param {Map<string, string>} [groupsById] */
export function formatValidationRuleSummary(rule, groupsById = new Map()) {
  const audience = formatValidationRuleAudienceShort(rule, groupsById);
  return `${audience} · ${formatValidationRuleApproachShort(rule)} · ${formatValidationRuleActionShort(rule)}`;
}

/**
 * @param {ScheduleTemplate} template
 * @param {Date} [now]
 */
export function matchesScheduleTemplate(template, now = new Date()) {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (template === 'weekdays') {
    return day >= 1 && day <= 5;
  }
  if (template === 'lunch_hours') {
    const lunchStart = 12 * 60;
    const lunchEnd = 16 * 60;
    return minutes >= lunchStart && minutes < lunchEnd;
  }
  return true;
}

/**
 * @param {Date} date
 * @param {ApproachInterval} interval
 * @param {string|null} [periodStart]
 * @param {object|null} [shift] — рабочая смена пользователя (для interval === 'shift')
 */
export function intervalStartDate(date, interval, periodStart = null, shift = null) {
  const d = new Date(date);
  if (interval === 'shift') {
    return shiftIntervalStartDate(d, shift || createDefaultWorkShiftDoc());
  }
  if (interval === 'total') {
    return new Date(0);
  }
  if (interval === 'week') {
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  if (interval === 'month') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (interval === 'period') {
    const start = parseDateOnly(periodStart);
    if (start) {
      start.setHours(0, 0, 0, 0);
      return start;
    }
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {ValidationRuleDoc|Partial<ValidationRuleDoc>} rule @param {Date} [now] */
export function isNowWithinApproachPeriod(rule, now = new Date()) {
  if (rule.approachInterval !== 'period') return true;
  const start = parseDateOnly(rule.approachPeriodStart);
  const end = parseDateOnly(rule.approachPeriodEnd);
  if (!start || !end) return false;
  const t = now.getTime();
  return t >= start.getTime() && t <= endOfDay(end).getTime();
}

/** @param {ApproachInterval|string} interval */
export function approachIntervalScopeLabel(interval) {
  return APPROACH_INTERVAL_OPTIONS.find(o => o.id === interval)?.label?.toLowerCase() || 'в интервале';
}

/**
 * @param {Array<{ userId: string, ruleId: string, status: string, createdAt?: { toDate?: () => Date } }>} logs
 * @param {string} userId
 * @param {ValidationRuleDoc|string} ruleOrRuleId
 * @param {ApproachInterval|Date} [intervalOrNow]
 * @param {Date} [nowArg]
 * @param {{ user?: object, shiftsById?: Map<string, object>|Record<string, object> }|null} [shiftContext]
 */
export function countSuccessfulApproaches(logs, userId, ruleOrRuleId, intervalOrNow, nowArg, shiftContext = null) {
  /** @type {string} */
  let ruleId;
  /** @type {ApproachInterval} */
  let interval;
  /** @type {string|null} */
  let periodStart = null;
  /** @type {string|null} */
  let periodEnd = null;
  /** @type {Date} */
  let now;

  if (typeof ruleOrRuleId === 'object' && ruleOrRuleId?.id) {
    ruleId = ruleOrRuleId.id;
    interval = ruleOrRuleId.approachInterval || 'day';
    periodStart = ruleOrRuleId.approachPeriodStart || null;
    periodEnd = ruleOrRuleId.approachPeriodEnd || null;
    now = intervalOrNow instanceof Date ? intervalOrNow : new Date();
  } else {
    ruleId = String(ruleOrRuleId);
    interval = /** @type {ApproachInterval} */ (intervalOrNow || 'day');
    now = nowArg instanceof Date ? nowArg : new Date();
  }

  const start = intervalStartDate(
    now,
    interval,
    periodStart,
    interval === 'shift'
      ? resolveUserWorkShift(shiftContext?.user || { shiftId: null }, shiftContext?.shiftsById)
      : null,
  ).getTime();
  let end = Infinity;
  if (interval === 'period') {
    const endDate = parseDateOnly(periodEnd);
    if (endDate) end = endOfDay(endDate).getTime();
  }

  return logs.filter(log => {
    if (log.userId !== userId || log.ruleId !== ruleId || log.status !== 'success') return false;
    const ts = log.createdAt?.toDate?.()?.getTime?.() ?? log.createdAt?.getTime?.() ?? 0;
    return ts >= start && ts <= end;
  }).length;
}

/**
 * @typedef {object} ValidationEvalContext
 * @property {object} user
 * @property {ValidationRuleDoc[]} rules
 * @property {Array<object>} logs
 * @property {Map<string, string>} itemsById
 * @property {Map<string, string>} groupsById
 * @property {Map<string, object>|Record<string, object>} [shiftsById]
 * @property {Partial<import('./availability-rules.js').AvailabilityRuleDoc>[]|Map<string, import('./availability-rules.js').AvailabilityRuleDoc>} [availabilityRules]
 * @property {Date} [now]
 * @property {string} [channelPoint]
 */

/**
 * @param {ValidationEvalContext} ctx
 * @returns {object}
 */
export function evaluateValidation(ctx) {
  const {
    user,
    rules,
    logs,
    itemsById,
    groupsById,
    channelPoint = 'Раздача',
    availabilityRules = [],
    shiftsById = new Map(),
  } = ctx;
  const now = ctx.now || new Date();
  const availabilityRulesById = availabilityRules instanceof Map
    ? availabilityRules
    : rulesToMap(availabilityRules);

  if (!user) {
    return {
      status: 'denied',
      denyReason: 'Карта не найдена в системе',
      userName: 'Неизвестный',
      cardNumber: '—',
      groupName: '—',
    };
  }

  if (user.status && user.status !== 'active') {
    return {
      status: 'denied',
      denyReason: 'Пропуск заблокирован или сотрудник уволен',
      user,
      userName: user.name,
      cardNumber: user.qrCode || '—',
      groupName: groupsById.get(user.userGroupId) || '—',
    };
  }

  const applicable = rules
    .filter(r => r.isActive)
    .filter(r => !r.targetUserGroupIds.length || r.targetUserGroupIds.includes(user.userGroupId))
    .sort((a, b) => a.approachNumber - b.approachNumber);

  if (!applicable.length) {
    return {
      status: 'denied',
      denyReason: 'Нет подходящих правил для вашей группы',
      user,
      userName: user.name,
      cardNumber: user.qrCode || '—',
      groupName: groupsById.get(user.userGroupId) || '—',
      channelPoint,
    };
  }

  for (const rule of applicable) {
    if (!isValidationRuleAvailableAt(rule, now, availabilityRulesById)) {
      const availRule = rule.availabilityRuleId
        ? availabilityRulesById.get(rule.availabilityRuleId)
        : null;
      const scheduleLabel = availRule?.name
        || SCHEDULE_TEMPLATE_OPTIONS.find(o => o.id === rule.scheduleTemplate)?.label
        || 'Расписание';
      return {
        status: 'denied',
        denyReason: `Правило недоступно по расписанию (${scheduleLabel})`,
        user,
        rule,
        userName: user.name,
        cardNumber: user.qrCode || '—',
        groupName: groupsById.get(user.userGroupId) || '—',
        channelPoint,
      };
    }

    if (!isNowWithinApproachPeriod(rule, now)) {
      continue;
    }

    const used = countSuccessfulApproaches(logs, user.id, rule, now, undefined, { user, shiftsById });
    const nextApproach = used + 1;

    if (nextApproach !== rule.approachNumber) {
      continue;
    }

    if (used >= rule.approachLimit) {
      const scope = approachIntervalScopeLabel(rule.approachInterval);
      return {
        status: 'denied',
        denyReason: `Превышен лимит подходов ${scope} (${used} из ${rule.approachLimit} уже использован${used === 1 ? '' : 'о'})`,
        user,
        rule,
        userName: user.name,
        cardNumber: user.qrCode || '—',
        groupName: groupsById.get(user.userGroupId) || '—',
        channelPoint,
        approachesUsed: used,
        approachLimit: rule.approachLimit,
      };
    }

    if (rule.actionType === 'money') {
      const wallet = user.wallets?.[rule.walletId];
      const balance = Number(wallet?.balance) || 0;
      const amount = Number(rule.amount) || 0;
      const balanceAfter = balance - amount;

      if (balanceAfter < 0 && !rule.allowOverdraft) {
        return {
          status: 'denied',
          denyReason: 'Недостаточно средств на кошельке (Овердрафт запрещен)',
          user,
          rule,
          userName: user.name,
          cardNumber: user.qrCode || '—',
          groupName: groupsById.get(user.userGroupId) || '—',
          channelPoint,
          walletName: wallet?.name || rule.walletId,
          balance,
        };
      }

      return {
        status: 'success',
        user,
        rule,
        userName: user.name,
        cardNumber: user.qrCode || '—',
        groupName: groupsById.get(user.userGroupId) || '—',
        channelPoint,
        deductionType: 'money',
        deductionSummary: `Списано: ${amount} руб. (Баланс кошелька "${wallet?.name || rule.walletId}")`,
        balanceAfter,
        walletId: rule.walletId,
        amount,
        approachesLeft: rule.approachLimit - nextApproach,
        allowOverdraft: rule.allowOverdraft,
      };
    }

    if (rule.actionType === 'meal_set') {
      const names = (rule.itemIds || []).map(id => itemsById.get(id) || id);
      const mealLabel = names.length ? names.join(', ') : 'Набор товаров';
      return {
        status: 'success',
        user,
        rule,
        userName: user.name,
        cardNumber: user.qrCode || '—',
        groupName: groupsById.get(user.userGroupId) || '—',
        channelPoint,
        deductionType: 'meal_set',
        deductionSummary: `Списано: Обед составной (${mealLabel})`,
        approachesLeft: rule.approachLimit - nextApproach,
        itemIds: rule.itemIds,
      };
    }

    return {
      status: 'success',
      user,
      rule,
      userName: user.name,
      cardNumber: user.qrCode || '—',
      groupName: groupsById.get(user.userGroupId) || '—',
      channelPoint,
      deductionType: 'pass_only',
      deductionSummary: 'Зафиксирован факт прохода',
      approachesLeft: rule.approachLimit - nextApproach,
    };
  }

  return {
    status: 'denied',
    denyReason: 'Нет активного правила для текущего номера подхода',
    user,
    userName: user.name,
    cardNumber: user.qrCode || '—',
    groupName: groupsById.get(user.userGroupId) || '—',
    channelPoint,
  };
}

/** Demo profiles for validator terminal emulation */
export const DEMO_VALIDATOR_CARDS = [
  {
    id: 'demo-ivanov',
    label: 'Карта: Иванов (Завод)',
    user: {
      id: 'demo-vld-ivanov',
      name: 'Иванов Петр Сергеевич',
      qrCode: '048291',
      userGroupId: 'askona',
      status: 'active',
      wallets: { dotation: { balance: 0, name: 'Дотация', allowedCategories: [] } },
    },
    rule: {
      id: 'vld-demo-lunch-standard',
      name: 'Ланч Стандарт (Подход №1)',
      scheduleTemplate: 'everyday',
      approachLimit: 1,
      approachInterval: 'day',
      approachNumber: 1,
      actionType: 'meal_set',
      itemIds: [],
      isActive: true,
      targetUserGroupIds: ['askona', 'production'],
    },
    mealNames: ['Борщ', 'Пюре с котлетой'],
    simulateLimitOnRepeat: true,
  },
  {
    id: 'demo-petrov',
    label: 'Карта: Петров (Офис)',
    user: {
      id: 'demo-vld-petrov',
      name: 'Петров Алексей Иванович',
      qrCode: '048292',
      userGroupId: 'office_romashka',
      status: 'active',
      wallets: {
        dotation: { balance: 100, name: 'Субсидия предприятия', allowedCategories: [] },
      },
    },
    rule: {
      id: 'vld-demo-money-office',
      name: 'Списание 300₽ (Офис)',
      scheduleTemplate: 'everyday',
      approachLimit: 99,
      approachInterval: 'day',
      approachNumber: 1,
      actionType: 'money',
      amount: 300,
      walletId: 'dotation',
      allowOverdraft: true,
      isActive: true,
      targetUserGroupIds: ['office_romashka'],
    },
    simulateLimitOnRepeat: false,
  },
  {
    id: 'demo-sidorov',
    label: 'Карта: Сидоров (Выходной)',
    user: {
      id: 'demo-vld-sidorov',
      name: 'Сидоров Николай Петрович',
      qrCode: '048293',
      userGroupId: 'production',
      status: 'active',
      wallets: { dotation: { balance: 500, name: 'Дотация', allowedCategories: [] } },
    },
    rule: {
      id: 'vld-demo-weekdays-only',
      name: 'Будни только',
      scheduleTemplate: 'weekdays',
      approachLimit: 1,
      approachInterval: 'day',
      approachNumber: 1,
      actionType: 'pass_only',
      isActive: true,
      targetUserGroupIds: ['production'],
    },
    forceWeekendDeny: true,
    simulateLimitOnRepeat: false,
  },
];
