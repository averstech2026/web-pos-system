import { state } from '../core/state.js';
import {
  CATEGORIES,
  PRODUCTS,
} from '../services/catalog.js';
import {
  formatPrice,
  cartQtyControl,
} from '../core/format.js';
import {
  addToCart,
  setCartQty,
} from '../core/cart.js';
import {
  navigateTo,
  isVoiceScreenActive,
  showModal,
  hideModal,
} from '../core/navigation.js';
import {
  stopVoiceRecognition,
  voiceSession,
} from '../core/voiceSession.js';
import { filterProductsByQuery } from './search.js';

// ─── Голосовой поиск ───────────────────────────────────────────
const VOICE_DEMO_PHRASES = [
  'кофе растворимый',
  'салат цезарь',
  'бизнес ланч',
  'сырники',
  'чай чёрный',
  'каша',
  'напитки',
];

const VOICE_CATEGORY_TRIGGERS = [
  { categoryId: 'hot',       triggers: ['суп', 'супы', 'горячее', 'горячие', 'горячие блюда', 'второе'] },
  { categoryId: 'drinks',    triggers: ['напитки', 'напиток', 'питьё', 'питье'] },
  { categoryId: 'salads',    triggers: ['салат', 'салаты', 'закуски', 'салаты и закуски'] },
  { categoryId: 'breakfast', triggers: ['завтрак', 'завтраки', 'каши'] },
  { categoryId: 'bread',     triggers: ['хлеб', 'хлеба', 'булочки'] },
  { categoryId: 'pastry',    triggers: ['выпечка', 'пирожки', 'пирожок'] },
  { categoryId: 'desserts',  triggers: ['десерт', 'десерты', 'сладкое'] },
  { categoryId: 'sides',     triggers: ['гарнир', 'гарниры'] },
  { categoryId: 'fruits',    triggers: ['фрукты', 'фрукт'] },
  { categoryId: 'meals',     triggers: ['обед', 'обеды', 'ланч', 'комплекс', 'комплексное питание'] },
  { categoryId: 'toppings',  triggers: ['топинг', 'топинги', 'соусы'] },
  { categoryId: 'disposable',triggers: ['посуда', 'одноразовая посуда', 'контейнеры', 'контейнер'] },
];

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setVoiceStatus(status, message) {
  state.voiceStatus = status;
  const el = document.getElementById('voice-status-text');
  if (el) el.textContent = message;
  const wrap = document.getElementById('voice-mic-wrap');
  if (wrap) wrap.classList.toggle('is-listening', status === 'listening');
}

function updateVoiceTranscriptDisplay(text, isPlaceholder) {
  state.voiceTranscript = text;
  const box = document.getElementById('voice-transcript-box');
  const el = document.getElementById('voice-transcript');
  if (!el) return;
  if (isPlaceholder || !text.trim()) {
    el.textContent = '«Кофе», «салат цезарь», «бизнес ланч»…';
    el.className = 'text-[24px] text-gray-400 font-medium leading-snug';
    if (box) box.classList.remove('has-text');
  } else {
    el.textContent = `«${text}»`;
    el.className = 'text-[26px] text-navy font-semibold leading-snug';
    if (box) box.classList.add('has-text');
  }
}

function findVoiceCategoryMatch(query) {
  const q = query.trim().toLowerCase();
  return VOICE_CATEGORY_TRIGGERS.find(({ triggers }) =>
    triggers.some(t => q === t || q === t.replace(/ё/g, 'е'))
  ) || null;
}

function resolveVoiceQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return { type: 'none' };

  const exact = PRODUCTS.find(p => p.name.toLowerCase() === q);
  if (exact) return { type: 'exact', product: exact };

  const catMatch = findVoiceCategoryMatch(q);
  if (catMatch) {
    const cat = CATEGORIES.find(c => c.id === catMatch.categoryId);
    const products = PRODUCTS.filter(p => p.category === catMatch.categoryId);
    if (products.length) {
      return {
        type: 'category',
        products,
        title: cat?.label || 'Раздел',
        subtitle: `${products.length} ${products.length === 1 ? 'товар' : products.length < 5 ? 'товара' : 'товаров'}`,
      };
    }
  }

  const nameMatches = PRODUCTS.filter(p => p.name.toLowerCase().includes(q));
  if (nameMatches.length === 1) return { type: 'exact', product: nameMatches[0] };
  if (nameMatches.length > 1) {
    return {
      type: 'choice',
      products: nameMatches,
      title: 'Уточните товар',
      subtitle: `По запросу «${query.trim()}»`,
    };
  }

  const results = filterProductsByQuery(query);
  if (results.length === 1) return { type: 'exact', product: results[0] };
  if (results.length > 1) {
    return {
      type: 'choice',
      products: results,
      title: 'Уточните товар',
      subtitle: `По запросу «${query.trim()}»`,
    };
  }

  return { type: 'none' };
}

function addVoiceProduct(productId) {
  state.voiceList[productId] = (state.voiceList[productId] || 0) + 1;
  promoteVoiceItem(productId);
  highlightVoiceItem(productId);
  addToCart(productId, 1);
}

function voiceChoiceRow(p) {
  const qty = state.voiceList[p.id] || 0;
  return `
    <button type="button" data-action="voice-choice-add" data-product="${p.id}" class="voice-choice-row btn-press${qty > 0 ? ' has-qty' : ''}">
      <img src="${p.image}" alt="${p.name}" class="voice-choice-row-img" loading="lazy" />
      <div class="flex-1 min-w-0">
        <p class="voice-choice-row-name">${p.name}</p>
        <p class="voice-choice-row-price">${formatPrice(p.price)}</p>
      </div>
      <span class="voice-choice-row-badge${qty > 0 ? '' : ' is-placeholder'}" aria-hidden="${qty > 0 ? 'false' : 'true'}">${qty > 0 ? `${qty} шт.` : '0 шт.'}</span>
      <span class="voice-choice-row-add" aria-hidden="true">+</span>
    </button>`;
}

function renderVoiceChoicePanel() {
  const titleEl = document.getElementById('voice-choice-title');
  const subtitleEl = document.getElementById('voice-choice-subtitle');
  const listEl = document.getElementById('voice-choice-list');
  const dismissBtn = document.querySelector('[data-action="voice-choice-dismiss"]');
  if (!state.voiceChoice) {
    hideModal('modal-voice-choice');
    return;
  }

  const { type, products, title, subtitle } = state.voiceChoice;
  showModal('modal-voice-choice');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (dismissBtn) {
    dismissBtn.textContent = type === 'category' ? 'Готово' : 'Отмена';
    dismissBtn.classList.toggle('voice-choice-done-btn--secondary', type !== 'category');
  }
  if (listEl) listEl.innerHTML = products.map(p => voiceChoiceRow(p)).join('');
}

function dismissVoiceChoice(resumeListening) {
  state.voiceChoice = null;
  hideModal('modal-voice-choice');
  updateVoiceTranscriptDisplay('', true);
  if (resumeListening && isVoiceScreenActive()) {
    setVoiceStatus('idle', 'Назовите следующий товар');
    setTimeout(() => startVoiceRecognition(), 400);
  }
}

function pickVoiceChoiceProduct(productId) {
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return;

  addVoiceProduct(productId);
  renderVoiceResults();

  if (state.voiceChoice?.type === 'category') {
    renderVoiceChoicePanel();
    setVoiceStatus('idle', `Добавлено: ${product.name}`);
    return;
  }

  dismissVoiceChoice(true);
  setVoiceStatus('idle', `Добавлено: ${product.name}`);
}

function findBestVoiceProduct(query) {
  const resolution = resolveVoiceQuery(query);
  return resolution.type === 'exact' ? resolution.product : null;
}

function promoteVoiceItem(productId) {
  state.voiceListOrder = state.voiceListOrder.filter(id => id !== productId);
  state.voiceListOrder.unshift(productId);
}

function removeFromVoiceOrder(productId) {
  state.voiceListOrder = state.voiceListOrder.filter(id => id !== productId);
}

function highlightVoiceItem(productId) {
  voiceSession.highlightId = productId;
  if (voiceSession.highlightTimer) clearTimeout(voiceSession.highlightTimer);
  voiceSession.highlightTimer = setTimeout(() => {
    voiceSession.highlightId = null;
    const row = document.querySelector(`[data-voice-product="${productId}"]`);
    if (row) row.classList.remove('voice-result-row-new');
  }, 2000);
}

function commitVoiceRecognition(transcript) {
  const q = transcript.trim();
  if (!q) return false;

  const resolution = resolveVoiceQuery(q);

  if (resolution.type === 'exact') {
    addVoiceProduct(resolution.product.id);
    updateVoiceTranscriptDisplay('', true);
    renderVoiceResults();
    setVoiceStatus('idle', 'Добавлено — назовите следующий товар');
    return true;
  }

  if (resolution.type === 'choice' || resolution.type === 'category') {
    stopVoiceRecognition();
    state.voiceChoice = resolution;
    renderVoiceChoicePanel();
    if (resolution.type === 'category') {
      setVoiceStatus('idle', `Раздел «${resolution.title}» — нажмите для добавления`);
    } else {
      setVoiceStatus('idle', 'Выберите нужный товар из списка');
    }
    return true;
  }

  setVoiceStatus('idle', 'Не найдено — попробуйте ещё раз');
  return false;
}

function getVoiceSubtotal() {
  let total = 0;
  for (const [id, qty] of Object.entries(state.voiceList)) {
    const p = PRODUCTS.find(x => x.id === id);
    if (p) total += p.price * qty;
  }
  return total;
}

function getVoiceListCount() {
  return Object.values(state.voiceList).reduce((s, q) => s + q, 0);
}

function voiceQtyControl(id, qty) {
  return `
    <div class="flex items-center bg-gray-200 rounded-full shrink-0 px-1 py-1">
      <button data-action="voice-dec" data-product="${id}"
              class="btn-press cart-qty-btn w-12 h-12 text-[30px] font-bold text-gray-600 flex items-center justify-center rounded-full">−</button>
      <span class="bg-white min-w-[52px] h-12 mx-1 rounded-xl text-[26px] font-bold text-gray-800 flex items-center justify-center">${qty}</span>
      <button data-action="voice-inc" data-product="${id}"
              class="btn-press cart-qty-btn w-12 h-12 text-[30px] font-bold text-gray-600 flex items-center justify-center rounded-full">+</button>
    </div>`;
}

function voiceResultRow(p, qty, isNew) {
  return `
    <div class="search-result-row flex items-center gap-5 py-5 px-6 border-b border-gray-100${isNew ? ' voice-result-row-new' : ''}" data-voice-product="${p.id}">
      <img src="${p.image}" alt="${p.name}" class="w-[100px] h-[100px] object-cover rounded-xl shrink-0 bg-gray-50" loading="lazy" />
      <p class="flex-1 min-w-0 text-[26px] font-medium text-gray-800 leading-snug pr-2">${p.name}</p>
      <span class="text-[30px] font-extrabold text-navy shrink-0 w-[100px] text-right leading-none">${formatPrice(p.price)}</span>
      ${voiceQtyControl(p.id, qty)}
    </div>`;
}

function updateVoiceToolbarState() {
  const hasItems = Object.keys(state.voiceList).length > 0;
  document.querySelectorAll('[data-action="voice-clear-all"]').forEach(btn => {
    btn.disabled = !hasItems;
  });
}

function renderVoiceResults() {
  const container = document.getElementById('voice-results');
  const countEl = document.getElementById('voice-results-count');
  const subtotalEl = document.getElementById('voice-subtotal');
  if (!container) return;

  const ids = state.voiceListOrder.filter(id => state.voiceList[id]);
  if (countEl) countEl.textContent = String(getVoiceListCount());
  if (subtotalEl) subtotalEl.textContent = formatPrice(getVoiceSubtotal());
  updateVoiceToolbarState();

  if (!ids.length) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full py-10 px-6 text-center gap-4">
        <span class="voice-hint-chip">Назовите товар вслух</span>
        <p class="text-[22px] text-gray-400 leading-relaxed">Каждое распознанное блюдо добавится в список</p>
      </div>`;
    return;
  }

  const highlightId = voiceSession.highlightId;
  container.innerHTML = ids.map(id => {
    const p = PRODUCTS.find(x => x.id === id);
    return p ? voiceResultRow(p, state.voiceList[id], id === highlightId) : '';
  }).join('');

  if (highlightId) {
    requestAnimationFrame(() => { container.scrollTop = 0; });
  }
}

function renderVoice() {
  updateVoiceTranscriptDisplay(state.voiceTranscript, !state.voiceTranscript.trim());
  renderVoiceResults();
}

function renderVoiceModal() {
  renderVoice();
}

function setVoiceQty(productId, qty) {
  const prev = state.voiceList[productId] || 0;
  if (qty <= 0) {
    if (prev > 0) setCartQty(productId, (state.cart[productId] || 0) - prev);
    delete state.voiceList[productId];
    removeFromVoiceOrder(productId);
  } else {
    const delta = qty - prev;
    state.voiceList[productId] = qty;
    if (delta > 0) addToCart(productId, delta);
    else if (delta < 0) setCartQty(productId, (state.cart[productId] || 0) + delta);
  }
  renderVoiceResults();
  if (state.voiceChoice) renderVoiceChoicePanel();
}

function clearVoiceList() {
  Object.entries(state.voiceList).forEach(([id, qty]) => {
    setCartQty(id, (state.cart[id] || 0) - qty);
  });
  state.voiceList = {};
  state.voiceListOrder = [];
  renderVoiceResults();
  if (state.voiceChoice) renderVoiceChoicePanel();
  setVoiceStatus('idle', 'Список очищен');
}

function startVoiceDemoRecognition() {
  setVoiceStatus('listening', 'Слушаю… (демо-режим)');
  state.voiceListening = true;
  const phrase = VOICE_DEMO_PHRASES[Math.floor(Math.random() * VOICE_DEMO_PHRASES.length)];
  let i = 0;
  const tick = () => {
    if (!state.voiceListening) return;
    i += 1;
    const partial = phrase.slice(0, Math.min(phrase.length, i * 3));
    updateVoiceTranscriptDisplay(partial, false);
    if (partial.length < phrase.length) {
      voiceSession.demoTimer = setTimeout(tick, 180);
    } else {
      commitVoiceRecognition(phrase);
      state.voiceListening = false;
      setTimeout(() => {
        if (isVoiceScreenActive() && !state.voiceChoice) {
          startVoiceRecognition();
        }
      }, 800);
    }
  };
  voiceSession.demoTimer = setTimeout(tick, 400);
}

function startVoiceRecognition() {
  if (state.voiceListening || state.voiceChoice) return;

  const SpeechRecognitionCtor = getSpeechRecognition();
  if (!SpeechRecognitionCtor) {
    startVoiceDemoRecognition();
    return;
  }

  stopVoiceRecognition();
  voiceSession.recognition = new SpeechRecognitionCtor();
  voiceSession.recognition.lang = 'ru-RU';
  voiceSession.recognition.continuous = true;
  voiceSession.recognition.interimResults = true;
  voiceSession.recognition.maxAlternatives = 1;

  voiceSession.recognition.onstart = () => {
    state.voiceListening = true;
    setVoiceStatus('listening', 'Слушаю…');
  };

  voiceSession.recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text;
      else interim += text;
    }
    const display = (finalText || interim).trim();
    updateVoiceTranscriptDisplay(display, !display);
    if (finalText.trim()) {
      commitVoiceRecognition(finalText.trim());
    }
  };

  voiceSession.recognition.onerror = (event) => {
    if (event.error === 'no-speech') {
      setVoiceStatus('idle', 'Не расслышал — попробуйте ещё раз');
    } else if (event.error === 'not-allowed') {
      setVoiceStatus('error', 'Нет доступа к микрофону');
    } else {
      setVoiceStatus('error', 'Ошибка распознавания');
    }
    state.voiceListening = false;
    const wrap = document.getElementById('voice-mic-wrap');
    if (wrap) wrap.classList.remove('is-listening');
  };

  voiceSession.recognition.onend = () => {
    state.voiceListening = false;
    const wrap = document.getElementById('voice-mic-wrap');
    if (wrap) wrap.classList.remove('is-listening');
    const voiceActive = isVoiceScreenActive();
    if (voiceActive && !state.voiceChoice && state.voiceStatus !== 'error' && voiceSession.recognition) {
      try { voiceSession.recognition.start(); } catch (_) { /* noop */ }
    } else if (state.voiceStatus === 'listening') {
      setVoiceStatus('idle', 'Запись остановлена');
    }
  };

  try {
    voiceSession.recognition.start();
  } catch (_) {
    startVoiceDemoRecognition();
  }
}

function toggleVoiceListening() {
  if (state.voiceListening) {
    stopVoiceRecognition();
    setVoiceStatus('idle', 'Запись остановлена');
    const wrap = document.getElementById('voice-mic-wrap');
    if (wrap) wrap.classList.remove('is-listening');
    return;
  }
  startVoiceRecognition();
}

function openVoiceSearch() {
  state.voiceTranscript = '';
  state.voiceList = {};
  state.voiceListOrder = [];
  state.voiceChoice = null;
  voiceSession.highlightId = null;
  if (voiceSession.highlightTimer) clearTimeout(voiceSession.highlightTimer);
  hideModal('modal-voice-choice');
  setVoiceStatus('idle', 'Скажите название товара');
  navigateTo('voice');
  setTimeout(() => startVoiceRecognition(), 350);
}

function closeVoiceSearch() {
  stopVoiceRecognition();
  hideModal('modal-voice-choice');
  state.voiceTranscript = '';
  state.voiceList = {};
  state.voiceListOrder = [];
  state.voiceChoice = null;
  voiceSession.highlightId = null;
  if (voiceSession.highlightTimer) clearTimeout(voiceSession.highlightTimer);
  setVoiceStatus('idle', 'Скажите название товара');
}

function applyVoiceToSearch() {
  const ids = Object.keys(state.voiceList);
  const query = state.voiceTranscript.trim() ||
    ids.map(id => PRODUCTS.find(x => x.id === id)?.name).filter(Boolean).join(' ');
  closeVoiceSearch();
  state.searchQuery = query;
  navigateTo('search');
}

export {
  getSpeechRecognition,
  stopVoiceRecognition,
  setVoiceStatus,
  updateVoiceTranscriptDisplay,
  findVoiceCategoryMatch,
  resolveVoiceQuery,
  addVoiceProduct,
  voiceChoiceRow,
  renderVoiceChoicePanel,
  dismissVoiceChoice,
  pickVoiceChoiceProduct,
  findBestVoiceProduct,
  promoteVoiceItem,
  removeFromVoiceOrder,
  highlightVoiceItem,
  commitVoiceRecognition,
  getVoiceSubtotal,
  getVoiceListCount,
  voiceQtyControl,
  voiceResultRow,
  updateVoiceToolbarState,
  renderVoiceResults,
  renderVoice,
  renderVoiceModal,
  setVoiceQty,
  clearVoiceList,
  startVoiceDemoRecognition,
  startVoiceRecognition,
  toggleVoiceListening,
  openVoiceSearch,
  closeVoiceSearch,
  applyVoiceToSearch,
};
