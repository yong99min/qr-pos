// 메인 계산대: QR 인식 → 장바구니
const COOLDOWN_MS = 1500;
const AMOUNT_RE = /^AMT:(\d+)$/i;

let products = [];
let cart = load(KEYS.cart, []); // [{ key, name, price, qty }]
const lastScanAt = new Map();

const $ = (id) => document.getElementById(id);
const cameraPanel = $('cameraPanel');
const cartList = $('cartList');

// ---------- 장바구니 ----------
function saveCart() { save(KEYS.cart, cart); }

function renderCart(highlightKey) {
  cartList.innerHTML = cart.map((item) => `
    <li class="cart-item${item.key === highlightKey ? ' hl' : ''}" data-key="${escapeHtml(item.key)}">
      <div class="name">${escapeHtml(item.name)}</div>
      <div class="unit">${won(item.price)}</div>
      <div class="subtotal">${won(item.price * item.qty)}</div>
      <div class="qty-ctrl">
        <button data-act="minus" aria-label="수량 감소">−</button>
        <span class="qty">${item.qty}</span>
        <button data-act="plus" aria-label="수량 증가">+</button>
      </div>
    </li>`).join('');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const totalAmt = cart.reduce((s, i) => s + i.qty * i.price, 0);
  $('totalQty').textContent = totalQty + '개';
  $('totalAmt').textContent = won(totalAmt);
  $('cartEmpty').classList.toggle('hidden', cart.length > 0);
  $('payBtn').disabled = cart.length === 0;

  if (highlightKey) {
    const el = cartList.querySelector('.cart-item.hl');
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function addToCart(key, name, price) {
  const existing = cart.find((i) => i.key === key);
  if (existing) existing.qty += 1;
  else cart.push({ key, name, price, qty: 1 });
  saveCart();
  renderCart(key);
}

function changeQty(key, delta) {
  const item = cart.find((i) => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((i) => i !== item);
  saveCart();
  renderCart();
}

cartList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const key = btn.closest('.cart-item').dataset.key;
  changeQty(key, btn.dataset.act === 'plus' ? 1 : -1);
});

$('resetBtn').addEventListener('click', () => {
  if (cart.length === 0) return;
  if (!confirm('장바구니를 모두 비울까요?')) return;
  cart = [];
  saveCart();
  renderCart();
});

$('payBtn').addEventListener('click', () => {
  if (cart.length === 0) return;
  const total = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const sales = load(KEYS.sales, []);
  sales.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), total });
  save(KEYS.sales, sales);
  cart = [];
  saveCart();
  renderCart();
  showToast(`결제 완료 · ${won(total)}`, 'ok');
});

// ---------- 피드백 ----------
let audioCtx = null;
function getAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
// 브라우저 자동재생 정책 때문에 첫 사용자 입력 때 오디오를 깨워둠
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, getAudio, { once: true }));

// sounds 폴더에 파일을 넣으면 그 소리를 쓰고, 없으면 아래 합성음을 사용
const SOUND_FILES = { ok: 'sounds/scan.mp3', err: 'sounds/error.mp3' };
const soundBuffers = {};

async function loadSounds() {
  const ctx = getAudio();
  if (!ctx) return;
  for (const [name, url] of Object.entries(SOUND_FILES)) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      soundBuffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) { /* 파일 없음 → 합성음 */ }
  }
}

function playBuffer(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start();
}

// 사각파를 짧고 평평하게 울려야 마트 바코드 스캐너 같은 "삑" 소리가 남
function tone(ctx, freq, start, dur, volume = 0.3) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.frequency.value = 5000;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.005);
  gain.gain.setValueAtTime(volume, start + dur - 0.01);
  gain.gain.linearRampToValueAtTime(0, start + dur);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur);
}

function beep(ok = true) {
  const ctx = getAudio();
  if (!ctx) return;
  const buffer = soundBuffers[ok ? 'ok' : 'err'];
  if (buffer) return playBuffer(ctx, buffer);

  const t = ctx.currentTime;
  if (ok) {
    tone(ctx, 2700, t, 0.11); // 삑
  } else {
    tone(ctx, 420, t, 0.14, 0.25); // 삐-빅 (낮은 경고음 두 번)
    tone(ctx, 420, t + 0.2, 0.14, 0.25);
  }
}

function flash(cls) {
  cameraPanel.classList.remove('flash-ok', 'flash-err');
  void cameraPanel.offsetWidth; // 애니메이션 재시작
  cameraPanel.classList.add(cls);
}

// ---------- QR 처리 ----------
function onScan(text) {
  text = String(text).trim();
  // 마지막으로 "보인" 시각을 매 프레임 갱신 → QR을 화면에 계속 대고 있으면 다시 인식하지 않고,
  // 화면에서 1.5초 이상 사라졌다가 다시 보여야 +1
  const now = Date.now();
  const lastSeen = lastScanAt.get(text) || 0;
  lastScanAt.set(text, now);
  if (now - lastSeen < COOLDOWN_MS) return;

  const amt = text.match(AMOUNT_RE);
  if (amt && Number(amt[1]) > 0) {
    const price = Number(amt[1]);
    addToCart('AMT:' + price, won(price), price);
    beep(true);
    flash('flash-ok');
    return;
  }

  const product = products.find((p) => p.id.toLowerCase() === text.toLowerCase());
  if (product) {
    addToCart(product.id, product.name, product.price);
    beep(true);
    flash('flash-ok');
  } else {
    beep(false);
    flash('flash-err');
    showToast('미등록 상품', 'error');
  }
}

// ---------- 카메라 ----------
function showCameraMsg(html) {
  const el = $('cameraMsg');
  el.innerHTML = html;
  el.classList.remove('hidden');
}

function isPermissionError(err) {
  const s = String((err && (err.name || err.message)) || err);
  return /NotAllowed|Permission|denied/i.test(s);
}

const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let facing = load('pos_facing', IS_MOBILE ? 'environment' : 'user');
let scanner = null;

function applyMirror() {
  // 전면 카메라일 때만 거울처럼 좌우 반전
  cameraPanel.classList.toggle('mirror', facing === 'user');
  $('switchCamBtn').textContent = facing === 'user' ? '📷 후면 카메라로' : '🤳 전면 카메라로';
}

$('switchCamBtn').addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  save('pos_facing', facing);
  if (scanner && scanner.isScanning) {
    try { await scanner.stop(); } catch (e) { /* 무시 */ }
  }
  startCamera();
});

async function startCamera() {
  $('cameraMsg').classList.add('hidden');
  applyMirror();

  if (!window.isSecureContext) {
    showCameraMsg(`<div class="icon">🔒</div>
      <div>카메라는 <b>localhost</b> 또는 <b>https</b> 주소에서만 사용할 수 있어요.<br>
      README의 실행 방법대로 로컬 서버로 열어주세요.</div>`);
    return;
  }
  if (typeof Html5Qrcode === 'undefined') {
    showCameraMsg(`<div class="icon">⚠️</div><div>QR 인식 라이브러리를 불러오지 못했어요.<br>인터넷 연결을 확인해주세요.</div>
      <button onclick="location.reload()">새로고침</button>`);
    return;
  }

  if (!scanner) {
    scanner = new Html5Qrcode('reader', {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
  }
  const config = { fps: 12 };

  try {
    await scanner.start({ facingMode: facing }, config, onScan, () => {});
  } catch (err) {
    if (isPermissionError(err)) return showPermissionDenied();
    // facingMode 미지원 카메라면 첫 번째 카메라로 재시도
    try {
      const cams = await Html5Qrcode.getCameras();
      if (!cams.length) throw new Error('NoCamera');
      await scanner.start(cams[0].id, config, onScan, () => {});
    } catch (err2) {
      if (isPermissionError(err2)) return showPermissionDenied();
      console.error(err2);
      showCameraMsg(`<div class="icon">📷</div>
        <div>카메라를 찾을 수 없거나 다른 프로그램이 사용 중이에요.</div>
        <button onclick="location.reload()">다시 시도</button>`);
    }
  }
}

function showPermissionDenied() {
  showCameraMsg(`<div class="icon">🚫</div>
    <div><b>카메라 권한이 거부되었어요.</b><br>
    주소창 왼쪽의 자물쇠(사이트 정보) 아이콘 → 카메라 → <b>허용</b>으로 바꾼 뒤<br>새로고침 해주세요.</div>
    <button onclick="location.reload()">새로고침</button>`);
}

// ---------- 폰으로 열기 ----------
$('phoneLink').addEventListener('click', (e) => {
  e.preventDefault();
  const url = location.origin + location.pathname;
  const box = $('phoneQr');
  box.innerHTML = '';
  if (typeof QRCode !== 'undefined') {
    new QRCode(box, { text: url, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
  }
  $('phoneUrl').textContent = url;
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  $('phoneWarn').classList.toggle('hidden', !isLocal && location.protocol === 'https:');
  $('phoneModal').classList.remove('hidden');
});
$('phoneModal').addEventListener('click', (e) => {
  if (e.target.id === 'phoneModal' || e.target.dataset.close !== undefined) $('phoneModal').classList.add('hidden');
});

// ---------- 시작 ----------
window.addEventListener('storage', (e) => {
  if (e.key === KEYS.products) products = load(KEYS.products, []);
  if (e.key === KEYS.cart) { cart = load(KEYS.cart, []); renderCart(); }
});

(async function init() {
  renderCart();
  products = await loadProducts();
  loadSounds();
  startCamera();
})();
