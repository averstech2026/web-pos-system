import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import { loadKioskCatalogFromCode, runKioskCatalogImport, runKioskImagePatch } from '../services/kiosk-import-data.js';

export class DataImportPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    this.running = false;
    this.logLines = [];
    this.init();
  }

  init() {
    this.renderShell();
    this.bindEvents();
  }

  catalogStats() {
    try {
      const { categories, products } = loadKioskCatalogFromCode();
      return { categories: categories.length, products: products.length, error: null };
    } catch (err) {
      return { categories: 0, products: 0, error: err.message || String(err) };
    }
  }

  renderShell() {
    const stats = this.catalogStats();

    const bodyHtml = `
      <div class="ki-page card">
        <section class="ki-intro">
          <p>
            Перенос справочника из кода
            <a href="https://github.com/averstech2026/kioskprototype/blob/main/src/data/catalog.js" target="_blank" rel="noopener">kioskprototype</a>
            в Firestore портала. Данные уже загружены в <code>shared/kiosk-catalog-data.js</code>.
          </p>
          <ol class="ki-steps">
            <li>Откройте страницу и проверьте счётчик категорий/товаров ниже.</li>
            <li>Скачайте картинки: <code>npm run sync:kiosk-assets</code> (товары + иконки групп → <code>products/</code>).</li>
            <li>Нажмите <strong>Импортировать</strong> и затем <strong>Обновить картинки</strong> в Firestore.</li>
          </ol>
        </section>

        <div class="ki-preview card">
          ${stats.error
            ? `<strong>Ошибка в данных:</strong> ${escapeHtml(stats.error)}`
            : `<strong>В файле данных:</strong> ${stats.categories} категорий, ${stats.products} товаров`}
        </div>

        <div class="ki-options">
          <label class="ki-check">
            <input type="checkbox" id="ki-dry-run" />
            <span>Только просмотр (dry-run) — ничего не записывать в базу</span>
          </label>
        </div>

        <div class="ki-actions">
          <button type="button" class="btn btn-primary" id="ki-btn-import" ${this.running ? 'disabled' : ''}>
            ${this.running ? 'Импорт…' : 'Импортировать'}
          </button>
          <button type="button" class="btn btn-secondary" id="ki-btn-images" ${this.running ? 'disabled' : ''}>
            ${this.running ? '…' : 'Обновить картинки'}
          </button>
        </div>

        <div class="ki-log card" id="ki-log">
          ${this.logLines.length
            ? this.logLines.map(line => `<div class="ki-log-line">${escapeHtml(line)}</div>`).join('')
            : '<div class="ki-log-placeholder">Здесь появится журнал импорта</div>'}
        </div>
      </div>
    `;

    this.container.innerHTML = renderAdminShell({
      active: 'data-import',
      title: 'Импорт данных',
      subtitle: 'Перенос справочника из кода киоска в Firestore',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
  }

  bindEvents() {
    this.container.querySelector('#ki-btn-import')?.addEventListener('click', () => this.handleImport());
    this.container.querySelector('#ki-btn-images')?.addEventListener('click', () => this.handleImagePatch());
  }

  appendLog(msg) {
    this.logLines.push(msg);
    const logEl = this.container.querySelector('#ki-log');
    if (!logEl) return;
    logEl.innerHTML = this.logLines
      .map(line => `<div class="ki-log-line">${escapeHtml(line)}</div>`)
      .join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  async handleImport() {
    this.running = true;
    this.logLines = [];
    this.renderShell();
    this.bindEvents();

    const dryRun = this.container.querySelector('#ki-dry-run')?.checked === true;

    try {
      await runKioskCatalogImport({
        dryRun,
        onLog: msg => this.appendLog(msg),
      });
      this.appendLog(dryRun ? 'Готово (просмотр, без записи).' : 'Импорт завершён.');
    } catch (err) {
      console.error('[data-import]', err);
      this.appendLog(`Ошибка: ${err.message || err}`);
    } finally {
      this.running = false;
      this.renderShell();
      this.bindEvents();
    }
  }

  async handleImagePatch() {
    this.running = true;
    this.logLines = [];
    this.renderShell();
    this.bindEvents();

    const dryRun = this.container.querySelector('#ki-dry-run')?.checked === true;

    try {
      await runKioskImagePatch({
        dryRun,
        onLog: msg => this.appendLog(msg),
      });
      this.appendLog(dryRun ? 'Готово (просмотр картинок).' : 'Картинки обновлены в Firestore.');
    } catch (err) {
      console.error('[data-import/images]', err);
      this.appendLog(`Ошибка: ${err.message || err}`);
    } finally {
      this.running = false;
      this.renderShell();
      this.bindEvents();
    }
  }

  destroy() {}
}

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
