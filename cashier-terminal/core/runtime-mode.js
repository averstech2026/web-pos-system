import { isDesignPreviewActive } from './demo-preview.js';
import { isDemoModeActive } from '../services/dev-demo.js';
import { esc, escAttr } from './format.js';

let runtimeModeHidden = false;

export function isRuntimeModeHidden() {
  return runtimeModeHidden;
}

export function hideRuntimeModeBadge() {
  runtimeModeHidden = true;
}

/** @returns {{ id: string, label: string, hint: string, tone: 'demo'|'preview'|'live' }} */
export function getCashierRuntimeMode() {
  if (isDemoModeActive()) {
    return {
      id: 'demo',
      label: 'Демо-режим',
      hint: 'Без Firebase · заказы и платежи не сохраняются',
      tone: 'demo',
    };
  }

  if (isDesignPreviewActive()) {
    return {
      id: 'preview',
      label: 'Preview UI',
      hint: 'Макет для верстки · ?preview=1',
      tone: 'preview',
    };
  }

  return {
    id: 'live',
    label: 'Рабочий режим',
    hint: 'Firebase · заказы и платежи сохраняются',
    tone: 'live',
  };
}

export function renderRuntimeModeBadge() {
  if (runtimeModeHidden) return '';

  const mode = getCashierRuntimeMode();
  const text = `${mode.label} · ${mode.hint}`;
  return `
    <div class="ct-runtime-mode-wrap">
      <span class="ct-runtime-mode ct-runtime-mode--${escAttr(mode.tone)}" role="status" aria-label="${escAttr(text)}">${esc(text)}</span>
      <button type="button" class="ct-runtime-mode-hide btn-press" data-action="hide-runtime-mode" aria-label="Скрыть режим">Скрыть</button>
    </div>
  `;
}
