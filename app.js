// 메인 계산대: QR 인식 → 장바구니
const COOLDOWN_MS = 1500;
const AMOUNT_RE = /^AMT:(\d+)$/i;

let products = [];
let cart = load(KEYS.cart, []); // [{ key, name, price, qty }]
const lastScanAt = new Map();
let settings = getSettings();
let busy = false;      // 카드 결제 요청 중에는 다른 손님 QR 무시
let pendingTx = null;  // 응답을 못 받은 결제 → 같은 손님이 다시 찍으면 같은 거래번호로 재시도(이중 차감 방지)

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
  $('cartEmpty').textContent = settings.mode === 'food' ? '음식 버튼을 눌러주세요' : '상품 QR을 찍어주세요';
  $('payBtn').disabled = cart.length === 0;
  const online = Boolean(settings.url && settings.key);
  $('payHint').classList.toggle('hidden', !online || cart.length === 0);
  $('payBtn').textContent = online ? '종이 달란트로 결제' : '결제 완료';
  $('payBtn').classList.toggle('secondary', online);
  renderFoodBadges();

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

function cartTotal() { return cart.reduce((s, i) => s + i.qty * i.price, 0); }
function cartItemsText() { return cart.map((i) => `${i.name} x${i.qty}`).join(', '); }

function recordSale(extra) {
  const sales = load(KEYS.sales, []);
  sales.push({ ts: new Date().toISOString(), total: cartTotal(), items: cartItemsText(), booth: settings.mode, status: 'ok', ...extra });
  save(KEYS.sales, sales);
  cart = [];
  pendingTx = null;
  saveCart();
  renderCart();
}

// 종이 달란트(현금) 결제: 기기에 저장 후 시트로 전송(실패하면 나중에 재전송)
$('payBtn').addEventListener('click', async () => {
  if (cart.length === 0 || busy) return;
  const total = cartTotal();
  recordSale({ id: newTxId(settings.mode), method: 'cash', synced: false });
  showToast(`결제 완료 · ${won(total)}`, 'ok');
  await syncPending();
  updateStatus();
});

// ---------- 손님 QR(달란트 카드) ----------
let overlayTimer = null;
function showOverlay(type, html, ms = 3500) {
  $('payBox').className = 'pay-box ' + type;
  $('payBox').innerHTML = html;
  $('payOverlay').classList.remove('hidden');
  clearTimeout(overlayTimer);
  if (ms) overlayTimer = setTimeout(hideOverlay, ms);
}
function hideOverlay() { $('payOverlay').classList.add('hidden'); }
$('payOverlay').addEventListener('click', hideOverlay);

function personLine(r) {
  return `<div class="who">${escapeHtml(r.grade || '')} <b>${escapeHtml(r.name || '')}</b></div>`;
}

async function handleCustomer(code) {
  if (busy) return;
  if (!settings.url || !settings.key) {
    beep(false);
    flash('flash-err');
    return showToast('설정에서 시트 주소·비밀번호를 먼저 입력하세요', 'error');
  }
  busy = true;
  try {
    if (cart.length === 0) {
      // 장바구니가 비어 있으면 잔액 조회만
      showOverlay('wait', '<div class="big">잔액 확인 중…</div>', 0);
      const r = await api('lookup', { code });
      if (!r.ok) return payFailed(r);
      beep(true);
      showOverlay('info', `${personLine(r)}<div class="label">현재 잔액</div><div class="big">${won(r.balance)}</div>`);
      return;
    }

    const amount = cartTotal();
    if (!pendingTx || pendingTx.code !== code || pendingTx.amount !== amount) {
      pendingTx = { txId: newTxId(settings.mode), code, amount };
    }
    showOverlay('wait', `<div class="big">결제 중…</div><div class="label">${won(amount)}</div>`, 0);
    const r = await api('pay', { code, amount, txId: pendingTx.txId, items: cartItemsText(), booth: settings.mode, device: settings.device });
    if (!r.ok) return payFailed(r, amount);

    recordSale({ id: pendingTx.txId, method: 'card', synced: true, code, name: r.name, grade: r.grade });
    beep(true);
    flash('flash-ok');
    showOverlay('ok', `<div class="label">결제 완료</div>${personLine(r)}
      <div class="big">− ${won(amount)}</div><div class="label">남은 잔액 <b>${won(r.balance)}</b></div>`, 4000);
  } finally {
    busy = false;
  }
}

function payFailed(r, amount) {
  beep(false);
  flash('flash-err');
  if (r.error === 'INSUFFICIENT') {
    pendingTx = null;
    return showOverlay('err', `<div class="label">잔액 부족</div>${personLine(r)}
      <div class="big">${won(r.balance)}</div>
      <div class="label">결제 금액 ${won(amount)} · <b>${won(amount - r.balance)} 부족</b></div>`, 6000);
  }
  if (r.error === 'NETWORK') {
    return showOverlay('err', `<div class="big">연결 실패</div><div class="label">인터넷 확인 후 손님 QR을 다시 찍어주세요<br>(다시 찍어도 두 번 결제되지 않아요)</div>`, 6000);
  }
  pendingTx = null;
  showOverlay('err', `<div class="big">${escapeHtml(apiErrorText(r))}</div>`, 5000);
}

// ---------- 금액 직접 입력 (물품) ----------
let keypadValue = '';
function setKeypad(v) {
  keypadValue = v.replace(/^0+/, '').slice(0, 6);
  $('keypadValue').textContent = Number(keypadValue || 0).toLocaleString('ko-KR');
}
function openKeypad(first = '') {
  setKeypad(first);
  $('keypadModal').classList.remove('hidden');
}
function closeKeypad() { $('keypadModal').classList.add('hidden'); }
function keypadPress(k) {
  if (k === 'close') return closeKeypad();
  if (k === 'clear') return setKeypad('');
  if (k === 'back') return setKeypad(keypadValue.slice(0, -1));
  if (k === 'add') {
    const price = Number(keypadValue);
    if (!(price > 0)) return;
    addToCart('AMT:' + price, won(price), price); // 금액 QR과 같은 항목으로 합쳐짐
    beep(true);
    closeKeypad();
    return;
  }
  setKeypad(keypadValue + k);
}
$('keypadOpenBtn').addEventListener('click', () => openKeypad());
$('keypadModal').addEventListener('click', (e) => {
  if (e.target.id === 'keypadModal') return closeKeypad();
  const k = e.target.closest('[data-k]');
  if (k) keypadPress(k.dataset.k);
});
document.addEventListener('keydown', (e) => {
  const typing = e.target instanceof Element && e.target.matches('input, textarea');
  if (settings.mode !== 'goods' || typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const open = !$('keypadModal').classList.contains('hidden');
  if (/^[0-9]$/.test(e.key)) {
    if (!open) openKeypad(e.key);
    else keypadPress(e.key);
  } else if (open && e.key === 'Enter') { e.preventDefault(); keypadPress('add'); }
  else if (open && e.key === 'Backspace') keypadPress('back');
  else if (open && e.key === 'Escape') closeKeypad();
});

// ---------- 물품 / 음식 모드 ----------
function renderMode() {
  const food = settings.mode === 'food';
  document.body.classList.toggle('food-mode', food);
  $('foodGrid').classList.toggle('hidden', !food);
  $('keypadOpenBtn').classList.toggle('hidden', food);
  $('scanHint').textContent = food ? '손님 QR을 비춰주세요' : 'QR 코드를 네모 안에 비춰주세요';
  document.querySelectorAll('#modeSwitch button').forEach((b) => b.classList.toggle('active', b.dataset.mode === settings.mode));
  $('foodGrid').innerHTML = settings.foods.map((f, i) => `
    <button class="food-btn${f.price > 0 ? '' : ' off'}" data-food="${i}">
      <span class="badge hidden"></span>
      <span class="f-name">${escapeHtml(f.name)}</span>
      <span class="f-price">${f.price > 0 ? won(f.price) : '가격 미설정'}</span>
    </button>`).join('');
  renderCart();
}

function renderFoodBadges() {
  document.querySelectorAll('.food-btn').forEach((btn) => {
    const item = cart.find((c) => c.key === 'F:' + btn.dataset.food);
    const badge = btn.querySelector('.badge');
    badge.textContent = item ? item.qty : '';
    badge.classList.toggle('hidden', !item);
  });
}

$('foodGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.food-btn');
  if (!btn) return;
  const f = settings.foods[btn.dataset.food];
  if (!(f.price > 0)) return showToast('설정에서 가격을 먼저 정해주세요', 'error');
  addToCart('F:' + btn.dataset.food, f.name, f.price);
});

$('modeSwitch').addEventListener('click', (e) => {
  const mode = e.target.dataset.mode;
  if (!mode || mode === settings.mode) return;
  if (cart.length && !confirm('장바구니를 비우고 모드를 바꿀까요?')) return;
  cart = [];
  saveCart();
  saveSettings({ mode });
  settings = getSettings();
  renderMode();
});

function updateStatus() {
  const el = $('syncStatus');
  const n = pendingCount();
  let text;
  let cls;
  if (!settings.url || !settings.key) { text = '시트 미설정'; cls = 'warn'; }
  else if (isTestMode()) { text = '테스트 모드'; cls = 'test'; }
  else { text = navigator.onLine ? '시트 연결됨' : '오프라인'; cls = navigator.onLine ? 'ok' : 'warn'; }
  if (n) { text += ` · 미전송 ${n}건`; cls = 'warn'; }
  el.textContent = text;
  el.className = 'sync-status ' + cls;
}

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

  const code = parseCustomerCode(text);
  if (code) return handleCustomer(code);

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
  if (e.key === KEYS.cart) { cart = load(KEYS.cart, []); renderCart(); }
  if (e.key === SETTINGS_KEY) { settings = getSettings(); renderMode(); updateStatus(); }
});

async function resync() {
  await syncPending();
  updateStatus();
}
window.addEventListener('online', resync);
window.addEventListener('offline', updateStatus);

(async function init() {
  renderMode();
  updateStatus();
  products = loadProducts();
  loadSounds();
  startCamera();
  resync();
})();
