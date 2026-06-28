import { bindAdminShell, renderAdminShell } from '../components/layout.js';

function placeholderPage(active, title, description) {
  return class PlaceholderPage {
    constructor(container, navigate) {
      this.container = container;
      this.navigate = navigate;
      this.render(active, title, description);
    }

    render(active, title, description) {
      this.container.innerHTML = renderAdminShell({
        active,
        title,
        subtitle: description,
        bodyHtml: `
          <div class="placeholder-card card">
            <p class="placeholder-text">Раздел в разработке</p>
            <p class="placeholder-hint">Каркас навигации готов — содержимое будет добавлено на следующем этапе.</p>
          </div>
        `,
      });
      bindAdminShell(this.container, this.navigate);
    }

    destroy() {}
  };
}


export const UsersPage = placeholderPage(
  'users',
  'Пользователи',
  'CRM клиентов, баланс, доступ в ЛК и история заказов',
);

export const ReportsPage = placeholderPage(
  'reports',
  'Отчёты',
  'Заказ-наряд для кухни и финансовый отчёт по transactions',
);
