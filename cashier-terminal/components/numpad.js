import { esc, escAttr } from '../core/format.js';

const AUTH_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'];

/**
 * @param {object} opts
 * @param {string} [opts.value]
 * @param {boolean} [opts.showDot]
 * @param {boolean} [opts.tallEnter]
 * @param {string} [opts.enterLabel]
 * @param {'auth'|'modal'|'payment'|'default'} [opts.layout]
 */
export function renderNumpad({
  value = '',
  showDot = true,
  tallEnter = true,
  enterLabel = 'ВВОД',
  layout = 'default',
} = {}) {
  if (layout === 'modal') {
    const dotCell = showDot
      ? '<button type="button" class="ct-numpad-key btn-press" data-numpad=".">.</button>'
      : '<span class="ct-numpad-spacer" aria-hidden="true"></span>';
    return `
      <div class="ct-numpad ct-numpad--modal-layout">
        <div class="ct-numpad-grid">
          ${AUTH_KEYS.slice(0, 3).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key ct-numpad-back btn-press" data-numpad="back" aria-label="Стереть">←</button>
          ${AUTH_KEYS.slice(3, 6).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          ${AUTH_KEYS.slice(6, 9).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key btn-press" data-numpad="0">0</button>
          ${dotCell}
          <button type="button" class="ct-numpad-key ct-numpad-cancel btn-press" data-numpad="cancel">ОТМЕНА</button>
          <button type="button" class="ct-numpad-key ct-numpad-enter btn-press" data-numpad="enter">${esc(enterLabel)}</button>
        </div>
        <input type="hidden" data-numpad-value value="${escAttr(value)}" />
      </div>
    `;
  }

  if (layout === 'payment') {
    const dotBtn = showDot
      ? '<button type="button" class="ct-numpad-key btn-press" data-numpad=".">.</button>'
      : '';
    const layoutModifier = showDot ? '' : ' ct-numpad--payment-layout--no-dot';
    return `
      <div class="ct-numpad ct-numpad--payment-layout${layoutModifier}">
        <div class="ct-numpad-grid">
          ${AUTH_KEYS.slice(0, 3).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key ct-numpad-back btn-press" data-numpad="back" aria-label="Стереть">←</button>
          ${AUTH_KEYS.slice(3, 6).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key ct-numpad-enter btn-press" data-numpad="enter">${esc(enterLabel)}</button>
          ${AUTH_KEYS.slice(6, 9).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          ${dotBtn}
          <button type="button" class="ct-numpad-key btn-press" data-numpad="0">0</button>
          <button type="button" class="ct-numpad-key ct-numpad-cancel btn-press" data-numpad="cancel">ОТМЕНА</button>
        </div>
        <input type="hidden" data-numpad-value value="${escAttr(value)}" />
      </div>
    `;
  }

  if (layout === 'auth') {
    return `
      <div class="ct-numpad ct-numpad--auth-layout">
        <div class="ct-numpad-grid">
          ${AUTH_KEYS.slice(0, 3).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key ct-numpad-back btn-press" data-numpad="back" aria-label="Стереть">←</button>
          ${AUTH_KEYS.slice(3, 6).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key ct-numpad-enter btn-press" data-numpad="enter">${esc(enterLabel)}</button>
          ${AUTH_KEYS.slice(6, 9).map(k => `
            <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
          `).join('')}
          <button type="button" class="ct-numpad-key btn-press" data-numpad="0">0</button>
          <button type="button" class="ct-numpad-key ct-numpad-cancel btn-press" data-numpad="cancel">ОТМЕНА</button>
        </div>
        <input type="hidden" data-numpad-value value="${escAttr(value)}" />
      </div>
    `;
  }

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0'];
  return `
    <div class="ct-numpad ${tallEnter ? 'ct-numpad--tall-enter' : ''}">
      <div class="ct-numpad-grid">
        ${keys.slice(0, 9).map(k => `
          <button type="button" class="ct-numpad-key btn-press" data-numpad="${escAttr(k)}">${k}</button>
        `).join('')}
        <button type="button" class="ct-numpad-key btn-press" data-numpad="0">0</button>
        ${showDot ? `<button type="button" class="ct-numpad-key btn-press" data-numpad=".">.</button>` : '<span></span>'}
        <button type="button" class="ct-numpad-key ct-numpad-back btn-press" data-numpad="back" aria-label="Стереть">←</button>
        <button type="button" class="ct-numpad-key ct-numpad-cancel btn-press" data-numpad="cancel">ОТМЕНА</button>
        <button type="button" class="ct-numpad-key ct-numpad-enter btn-press" data-numpad="enter">${esc(enterLabel)}</button>
      </div>
      <input type="hidden" data-numpad-value value="${escAttr(value)}" />
    </div>
  `;
}

/**
 * @param {HTMLElement} numpadRoot
 * @param {object} handlers
 * @param {(val: string) => void} handlers.onChange
 * @param {() => void} [handlers.onEnter]
 * @param {() => void} [handlers.onCancel]
 * @param {boolean} [handlers.replaceOnNextInput] When true, the next digit replaces the whole value.
 */
export function bindNumpad(numpadRoot, {
  onChange,
  onEnter,
  onCancel,
  replaceOnNextInput = false,
} = {}) {
  let value = numpadRoot.querySelector('[data-numpad-value]')?.value || '';
  let replaceNext = Boolean(replaceOnNextInput);

  const emit = () => onChange(value);

  const hasDecimalSeparator = () => value.includes('.') || value.includes(',');

  const applyDigit = (key) => {
    if (replaceNext) {
      replaceNext = false;
      value = key === '.' ? '0.' : key;
      emit();
      return;
    }
    if (key === '.' && hasDecimalSeparator()) return;
    if (value.length >= 12) return;
    value += key;
    emit();
  };

  numpadRoot.addEventListener('click', e => {
    const btn = e.target.closest('[data-numpad]');
    if (!btn) return;
    const key = btn.dataset.numpad;
    if (key === 'back') {
      replaceNext = false;
      value = value.slice(0, -1);
      emit();
      return;
    }
    if (key === 'cancel') {
      onCancel?.();
      return;
    }
    if (key === 'enter') {
      onEnter?.();
      return;
    }
    if (key === '.' || (key >= '0' && key <= '9')) {
      applyDigit(key);
    }
  });

  return {
    getValue: () => value,
    setValue: (v, { replaceOnNextInput: replace = false } = {}) => {
      value = v;
      replaceNext = replace;
      const hidden = numpadRoot.querySelector('[data-numpad-value]');
      if (hidden) hidden.value = v;
      emit();
    },
    armReplace: () => {
      replaceNext = true;
    },
    isReplacePending: () => replaceNext,
  };
}
