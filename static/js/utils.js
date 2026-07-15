/* Shared utilities: formatting, DOM helpers, toasts */

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', INR: '₹', ISK: 'kr', AUD: 'A$', CAD: 'C$' };

function fmtMoney(amount, currency) {
  currency = currency || (window.CURRENT_USER && window.CURRENT_USER.currency) || 'USD';
  const symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  return `${sign}${symbol}${abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function showToast(message, type = 'info') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const icons = { success: '✓', error: '✕', info: 'ⓘ' };
  const toast = el('div', { class: `toast ${type}` }, [
    el('span', {}, icons[type] || ''),
    el('span', {}, message)
  ]);
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 200ms ease';
    setTimeout(() => toast.remove(), 200);
  }, 3800);
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

const CATEGORY_ICONS = {
  Food: '🍽️', Shopping: '🛍️', Bills: '📄', Transportation: '🚗', Entertainment: '🎬',
  Healthcare: '⚕️', Education: '📚', Salary: '💼', Investments: '📈', Other: '📦'
};

function categoryIcon(cat) { return CATEGORY_ICONS[cat] || '•'; }
