import { state } from '../core/state.js';
import { formatPrice } from '../core/format.js';

function updateCustomerStatus() {
  const line = state.customer
    ? `${state.customer.name}, баланс на карте ${formatPrice(state.customer.balance)}`
    : '';
  document.querySelectorAll('[data-customer-panel]').forEach((bar) => {
    const lineEl = bar.querySelector('[data-customer-line]');
    if (!lineEl) return;
    const isFixedSlot = bar.hasAttribute('data-customer-panel-fixed');
    if (state.customer) {
      lineEl.textContent = line;
      if (isFixedSlot) {
        bar.classList.remove('invisible', 'opacity-0', 'pointer-events-none');
      } else {
        bar.classList.remove('hidden');
      }
      bar.classList.add('flex');
    } else {
      if (isFixedSlot) {
        bar.classList.add('invisible', 'opacity-0', 'pointer-events-none');
      } else {
        bar.classList.add('hidden');
      }
      bar.classList.remove('flex');
    }
  });
}

export { updateCustomerStatus };
