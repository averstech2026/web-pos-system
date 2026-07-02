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
    return `
      <div class="ct-numpad ct-numpad--payment-layout">
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
          <button type="button" class="ct-numpad-key btn-press" data-numpad=".">.</button>
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
 */
export function bindNumpad(numpadRoot, { onChange, onEnter, onCancel }) {
  let value = numpadRoot.querySelector('[data-numpad-value]')?.value || '';

  const emit = () => onChange(value);

  numpadRoot.addEventListener('click', e => {
    const btn = e.target.closest('[data-numpad]');
    if (!btn) return;
    const key = btn.dataset.numpad;
    if (key === 'back') {
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
    if (key === '.' && value.includes('.')) return;
    if (value.length >= 12) return;
    value += key;
    emit();
  });

  return {
    getValue: () => value,
    setValue: (v) => { value = v; emit(); },
  };
}
