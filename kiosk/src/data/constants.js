/** Демо-клиент для оплаты дотацией (карта киоска). */
export const DEMO_CUSTOMER = {
  name: 'Петров Алексей Сергеевич',
  balance: 1250,
  email: 'petrova@ifcm.demo',
  userId: 'demo-client-002',
};

export const UPSELL_PRICE = 50;

export const EMAIL_KEYBOARD_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '_'],
];

export const SEARCH_KEYBOARD_ROWS = [
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х', 'ъ'],
  ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё'],
];

export const SEARCH_KB_ICON = {
  backspace: `<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6l6 6-6 6"/>
    <path d="M6 7h10a2 2 0 012 2v6a2 2 0 01-2 2H6l3.5-5L6 7z"/>
    <path d="M13.5 10.5l3 3M16.5 10.5l-3 3"/>
  </svg>`,
  enter: `<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9 10l-4 4 4 4"/><path stroke-linecap="round" d="M5 14h10a3 3 0 003-3V6"/>
  </svg>`,
  shift: `<svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4l8 8h-5v8H9v-8H4l8-8z"/>
  </svg>`,
  bookmark: `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="M7 4h10v16l-5-3-5 3V4z"/>
  </svg>`,
};
