// 공통 유틸: localStorage 저장/불러오기, 금액 포맷, 토스트
// 파일이 빠졌거나 스크립트 오류가 나면 화면 맨 위에 빨간 안내를 띄움 (GitHub 업로드 누락 확인용)
window.addEventListener('error', (e) => {
  const where = e.filename ? e.filename.split('/').pop() : '';
  showFatal(`오류: ${e.message}${where ? ` (${where})` : ''}`);
});
window.addEventListener('load', () => {
  const loaded = {
    'data.js': () => typeof FOODS !== 'undefined',
    'api.js': () => typeof getSettings !== 'undefined',
    'config.js': () => typeof window.POS_CONFIG !== 'undefined',
    'app.js': () => typeof onScan !== 'undefined',
  };
  const missing = [...document.scripts]
    .map((s) => (s.getAttribute('src') || '').split('/').pop())
    .filter((f) => loaded[f] && !loaded[f]());
  if (missing.length) showFatal(`파일을 못 불러왔어요: ${missing.join(', ')} — GitHub에 이 파일이 올라가 있는지 확인하세요`);
});
function showFatal(msg) {
  let bar = document.getElementById('fatalBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'fatalBar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:999;padding:12px 16px;background:#dc2626;color:#fff;font:700 16px sans-serif';
    document.body.appendChild(bar);
  }
  bar.textContent = '⚠️ ' + msg;
}

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
  return Number(n || 0).toLocaleString('ko-KR') + '달란트';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 물품 목록은 data.js 의 GOODS 고정값 사용
function loadProducts() {
  return typeof GOODS !== 'undefined' ? GOODS : [];
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
