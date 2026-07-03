import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { createPresetConstructorEditor } from '../components/preset-constructor-editor.js';

export class PresetConstructorPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.editor = null;
    this.renderShell();
  }

  renderShell() {
    this.container.innerHTML = renderAdminShell({
      active: 'preset-constructor',
      title: 'Пресет демонстрации',
      subtitle: 'White-Label режим для быстрой кастомизации под нового заказчика',
      bodyHtml: '<div class="dpc-host" id="preset-constructor-host"></div>',
    });

    bindAdminShell(this.container, this.navigate);
    this.mountEditor();
  }

  mountEditor() {
    this.editor?.destroy();
    const host = this.container.querySelector('#preset-constructor-host');
    if (!host) return;
    this.editor = createPresetConstructorEditor(host);
  }

  destroy() {
    this.editor?.destroy();
    this.editor = null;
  }
}
