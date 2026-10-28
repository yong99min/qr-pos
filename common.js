// 공통 유틸: localStorage 저장/불러오기, 금액 포맷, 토스트
const KEYS = {
  cart: 'pos_cart',
  products: 'pos_products',
  sales: 'pos_sales',
};

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('저장 실패', e);
  }
}

function won(n) {
  return Number(n || 0).toLocaleString('ko-KR') + '원';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function fetchDefaultProducts() {
  try {
    const res = await fetch('products.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (e) {
    console.warn('products.json 불러오기 실패', e);
    return [];
  }
}

// 상품 목록: localStorage 우선, 없으면 products.json을 기본값으로 저장
async function loadProducts() {
  const stored = load(KEYS.products, null);
  if (Array.isArray(stored)) return stored;
  const products = await fetchDefaultProducts();
  save(KEYS.products, products);
  return products;
}

let toastTimer = null;
function showToast(msg, type = 'info') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2000);
}

function pad(n) { return String(n).padStart(2, '0'); }

function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateTimeText(d) {
  return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
