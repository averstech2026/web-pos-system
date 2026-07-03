import { bindAdminShell, renderAdminShell } from '../components/layout.js';
import {
  CLIENT_TEMPLATE_ROWS,
  importClientsFromRows,
  importProductsFromRows,
  PRODUCT_TEMPLATE_ROWS,
} from '../services/data-import.js';
import { downloadXlsxTemplate, parseSpreadsheetFile } from '../utils/spreadsheet.js';

/** @typedef {'idle' | 'loading' | 'success' | 'error'} ImportBlockState */

/**
 * @typedef {object} ImportBlockModel
 * @property {ImportBlockState} state
 * @property {string} [fileName]
 * @property {string} [error]
 * @property {{ processed: number, created: number, updated: number }} [stats]
 */

export class DataImportPage {
  constructor(container, navigate) {
    this.container = container;
    this.navigate = navigate;
    /** @type {ImportBlockModel} */
    this.products = { state: 'idle' };
    /** @type {ImportBlockModel} */
    this.clients = { state: 'idle' };
    this.dryRun = false;
    this.init();
  }

  init() {
    this.renderShell();
    this.bindEvents();
  }

  isDryRun() {
    return this.dryRun;
  }

  renderShell() {
    const bodyHtml = `
      <div class="di-page">
        <div class="di-options">
          <label class="di-check">
            <input type="checkbox" id="di-dry-run" ${this.dryRun ? 'checked' : ''} />
            <span>Режим тестирования (проверить файл на ошибки без записи в базу данных)</span>
          </label>
        </div>

        <div class="di-grid">
          ${this.renderImportBlock({
            id: 'products',
            title: 'Импорт товаров и категорий',
            hint: 'Файл должен содержать колонки: Артикул, Название, Категория, Цена, Штрихкод, Ед. измерения.',
            templateName: 'shablon-tovary.xlsx',
            block: this.products,
          })}
          ${this.renderImportBlock({
            id: 'clients',
            title: 'Импорт клиентов',
            hint: 'Файл должен содержать колонки: Номер телефона, Имя, Категория скидки/Кэшбэк, Номер карты.',
            templateName: 'shablon-klienty.xlsx',
            block: this.clients,
          })}
        </div>
      </div>
    `;

    this.container.innerHTML = renderAdminShell({
      active: 'data-import',
      title: 'Импорт данных',
      subtitle: 'Массовая загрузка номенклатуры и базы контрагентов через Excel-файлы',
      bodyHtml,
    });

    bindAdminShell(this.container, this.navigate);
  }

  /**
   * @param {object} p
   * @param {'products' | 'clients'} p.id
   * @param {string} p.title
   * @param {string} p.hint
   * @param {string} p.templateName
   * @param {ImportBlockModel} p.block
   */
  renderImportBlock({ id, title, hint, templateName, block }) {
    const isLoading = block.state === 'loading';

    return `
      <section class="di-card" data-import-block="${id}">
        <header class="di-card-head">
          <h2 class="di-card-title">${escapeHtml(title)}</h2>
        </header>

        <div class="di-card-body">
          <div class="di-instruction-row">
            <p class="di-hint">${escapeHtml(hint)}</p>
            <button type="button" class="di-template-link" data-template="${id}">
              ${DOC_ICON}
              <span>Скачать эталонный шаблон .xlsx</span>
            </button>
          </div>

          <div class="di-dropzone ${isLoading ? 'is-loading' : ''}" data-dropzone="${id}">
            <input
              type="file"
              class="di-file-input"
              id="di-file-${id}"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              ${isLoading ? 'disabled' : ''}
            />
            <div class="di-dropzone-inner">
              <div class="di-dropzone-icon" aria-hidden="true">${UPLOAD_ICON}</div>
              <p class="di-dropzone-title">
                ${isLoading ? 'Обработка файла…' : 'Перетащите файл сюда'}
              </p>
              <p class="di-dropzone-sub">
                ${isLoading
                  ? escapeHtml(block.fileName || '')
                  : 'или выберите файл Excel / CSV'}
              </p>
              ${!isLoading ? `
                <label class="di-file-btn" for="di-file-${id}">Выбрать файл Excel</label>
              ` : ''}
              <p class="di-dropzone-formats">Форматы: .xlsx, .xls, .csv</p>
            </div>
          </div>

          ${block.state === 'success' && block.stats ? this.renderSuccessWidget(block.stats, this.dryRun) : ''}
          ${block.state === 'error' && block.error ? this.renderErrorWidget(block.error) : ''}
        </div>
      </section>
    `;
  }

  /** @param {{ processed: number, created: number, updated: number }} stats @param {boolean} dryRun */
  renderSuccessWidget(stats, dryRun) {
    const title = dryRun
      ? 'Файл успешно проверен!'
      : 'Данные успешно импортированы!';
    const note = dryRun
      ? '<p class="di-success-note">Режим тестирования: изменения в базу не записывались.</p>'
      : '';

    return `
      <div class="di-success" role="status">
        <div class="di-success-icon" aria-hidden="true">${CHECK_ICON}</div>
        <div class="di-success-body">
          <p class="di-success-title">${title}</p>
          ${note}
          <ul class="di-success-stats">
            <li>Успешно обработано строк: <strong>${stats.processed}</strong></li>
            <li>Добавлено новых позиций: <strong>${stats.created}</strong></li>
            <li>Обновлено существующих: <strong>${stats.updated}</strong></li>
          </ul>
        </div>
      </div>
    `;
  }

  /** @param {string} message */
  renderErrorWidget(message) {
    return `
      <div class="di-error" role="alert">
        <div class="di-error-icon" aria-hidden="true">${ERROR_ICON}</div>
        <div class="di-error-body">
          <p class="di-error-title">Не удалось импортировать файл</p>
          <p class="di-error-text">${escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  bindEvents() {
    this.container.querySelector('#di-dry-run')?.addEventListener('change', event => {
      this.dryRun = event.target.checked;
    });

    this.container.querySelectorAll('[data-template]').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-template');
        this.downloadTemplate(kind);
      });
    });

    for (const kind of ['products', 'clients']) {
      const input = this.container.querySelector(`#di-file-${kind}`);
      input?.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) this.handleFile(kind, file);
        input.value = '';
      });

      const dropzone = this.container.querySelector(`[data-dropzone="${kind}"]`);
      if (!dropzone) continue;

      dropzone.addEventListener('dragover', event => {
        event.preventDefault();
        dropzone.classList.add('is-dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('is-dragover');
      });

      dropzone.addEventListener('drop', event => {
        event.preventDefault();
        dropzone.classList.remove('is-dragover');
        const file = event.dataTransfer?.files?.[0];
        if (file) this.handleFile(kind, file);
      });
    }
  }

  /** @param {string|null} kind */
  async downloadTemplate(kind) {
    try {
      if (kind === 'products') {
        await downloadXlsxTemplate(PRODUCT_TEMPLATE_ROWS, 'shablon-tovary.xlsx');
      } else if (kind === 'clients') {
        await downloadXlsxTemplate(CLIENT_TEMPLATE_ROWS, 'shablon-klienty.xlsx');
      }
    } catch (err) {
      console.error('[data-import/template]', err);
      alert(err.message || 'Не удалось скачать шаблон');
    }
  }

  /**
   * @param {'products' | 'clients'} kind
   * @param {File} file
   */
  async handleFile(kind, file) {
    const blockKey = kind === 'products' ? 'products' : 'clients';
    this[blockKey] = { state: 'loading', fileName: file.name };
    this.renderShell();
    this.bindEvents();

    const dryRun = this.dryRun;

    try {
      const { rows } = await parseSpreadsheetFile(file);
      const stats = kind === 'products'
        ? await importProductsFromRows(rows, { dryRun })
        : await importClientsFromRows(rows, { dryRun });

      this[blockKey] = { state: 'success', fileName: file.name, stats };
    } catch (err) {
      console.error(`[data-import/${kind}]`, err);
      this[blockKey] = {
        state: 'error',
        fileName: file.name,
        error: err.message || String(err),
      };
    }

    this.renderShell();
    this.bindEvents();
  }

  destroy() {}
}

const DOC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>`;

const UPLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`;

const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;

const ERROR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;

/** @param {string} s */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
