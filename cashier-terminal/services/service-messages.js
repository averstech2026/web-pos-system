/** @typedef {'critical'|'warning'|'info'} ServiceMessageType */

/** @typedef {{ id: string, type: ServiceMessageType, text: string, unread: boolean }} ServiceMessage */

/** @type {ServiceMessage[]} */
export const DEMO_SERVICE_MESSAGES = [
  {
    id: 'hz-offline',
    type: 'critical',
    text: 'Нет связи с системой Честный Знак',
    unread: true,
  },
  {
    id: 'shift-ending',
    type: 'warning',
    text: 'Скоро заканчивается кассовая смена — не забудьте закрыть',
    unread: true,
  },
  {
    id: 'ofd-pending',
    type: 'warning',
    text: 'Не отправлены чеки в ОФД (3 шт.)',
    unread: true,
  },
  {
    id: 'menu-updated',
    type: 'info',
    text: 'Обновилось меню: добавлены сезонные позиции',
    unread: true,
  },
];

/** @param {ServiceMessage[]} messages */
export function getUnreadServiceMessageCount(messages) {
  return messages.filter(m => m.unread).length;
}

/** @param {ServiceMessage[]} messages @param {string} id */
export function markServiceMessageRead(messages, id) {
  const msg = messages.find(m => m.id === id);
  if (msg?.unread) {
    msg.unread = false;
    return true;
  }
  return false;
}

/** @param {ServiceMessage[]} messages */
export function resetServiceMessagesUnread(messages) {
  let changed = false;
  for (const msg of messages) {
    if (!msg.unread) {
      msg.unread = true;
      changed = true;
    }
  }
  return changed;
}
