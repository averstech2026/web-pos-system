/** @param {boolean} active */
export function renderFiltersResetBtn(active) {
  return `<button type="button" class="admin-filters-reset btn-press" data-action="reset-filters" aria-label="Сбросить фильтры"${active ? '' : ' hidden'}><span class="admin-filters-reset-icon" aria-hidden="true">✕</span> Сбросить</button>`;
}

/**
 * @param {ParentNode | null | undefined} root
 * @param {boolean} active
 */
export function syncFiltersResetBtn(root, active) {
  const btn = root?.querySelector('[data-action="reset-filters"]');
  if (btn) btn.hidden = !active;
}
