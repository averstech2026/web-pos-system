import { renderShellHeader, renderShellFooter } from '../components/shell.js';
import { resolveMaintenanceMessage } from '../../shared/sales-channels.js';

export class MaintenancePage {
  /** @param {HTMLElement} container */
  constructor(container, channel) {
    this.container = container;
    this.channel = channel;
    this.render();
  }

  render() {
    const message = resolveMaintenanceMessage(this.channel)
      || 'В данный момент терминал не работает или находится на техническом обслуживании.';
    this.container.innerHTML = `
      <div class="ct-auth-screen">
        ${renderShellHeader({ variant: 'auth' })}
        <main class="ct-auth-main">
          <div class="ct-maint-card">
            <div class="ct-maint-icon" aria-hidden="true">🔧</div>
            <p class="ct-maint-text">${message}</p>
          </div>
        </main>
        ${renderShellFooter()}
      </div>
    `;
  }

  destroy() {
    this.container.innerHTML = '';
  }
}
