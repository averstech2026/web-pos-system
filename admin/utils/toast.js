let toastHost = null;
let hideTimer = null;

function ensureHost() {
  if (toastHost?.isConnected) return toastHost;
  toastHost = document.createElement('div');
  toastHost.className = 'admin-toast-host';
  toastHost.setAttribute('aria-live', 'polite');
  toastHost.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toastHost);
  return toastHost;
}

/**
 * @param {string} message
 * @param {{ duration?: number }} [opts]
 */
export function showToast(message, { duration = 3200 } = {}) {
  const host = ensureHost();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  host.innerHTML = `
    <div class="admin-toast card" role="status">
      <span class="admin-toast-text">${esc(message)}</span>
    </div>
  `;

  requestAnimationFrame(() => {
    host.querySelector('.admin-toast')?.classList.add('admin-toast--visible');
  });

  hideTimer = setTimeout(() => {
    const toast = host.querySelector('.admin-toast');
    if (!toast) return;
    toast.classList.remove('admin-toast--visible');
    setTimeout(() => {
      if (host.childElementCount) host.innerHTML = '';
    }, 280);
  }, duration);
}

/** @param {string} s */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
