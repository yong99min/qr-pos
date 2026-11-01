// 구글 시트(Apps Script) 연동 + 기기별 설정
const SETTINGS_KEY = 'pos_settings';
// 음식 메뉴는 data.js 의 FOODS 고정값 사용
function getSettings() {
  const s = load(SETTINGS_KEY, {});
  return {
    url: s.url || (window.POS_CONFIG && window.POS_CONFIG.sheetUrl) || '',
    key: s.key || '',
    device: s.device || '',
    mode: s.mode === 'food' ? 'food' : 'goods',
    foods: FOODS,
  };
}

function saveSettings(patch) {
  save(SETTINGS_KEY, Object.assign(load(SETTINGS_KEY, {}), patch));
}

function isTestMode(url = getSettings().url) {
  return String(url).trim().toLowerCase() === 'test';
}

// 카드 QR 내용 → 참가자 코드. 이름표 QR은 "…/wallet.html?c=코드" 형태
function parseCustomerCode(text) {
  const m = String(text).match(/[?&]c=([A-Za-z0-9]{6,16})(?:&|$)/) || String(text).match(/^U:([A-Za-z0-9]{6,16})$/i);
  return m ? m[1].toUpperCase() : null;
}

function newTxId(booth) {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${booth === 'food' ? 'F' : 'G'}-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function api(action, payload = {}, opts = {}) {
  const s = getSettings();
  const url = opts.url || s.url;
  const key = opts.key !== undefined ? opts.key : s.key;
  if (!url) return { ok: false, error: 'NO_URL' };
  if (isTestMode(url)) return mockApi(action, { ...payload, key });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    // text/plain 으로 보내야 CORS 사전요청 없이 Apps Script가 받고, 응답도 읽을 수 있음
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, key, ...payload }),
      signal: ctrl.signal,
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'NETWORK', message: String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// 참가자 "내 달란트" 화면용 조회 (비밀번호 불필요)
async function fetchWallet(code) {
  const url = getSettings().url;
  if (!url) return { ok: false, error: 'NO_URL' };
  if (isTestMode(url)) return mockApi('wallet', { code });
  try {
    const res = await fetch(`${url}?c=${encodeURIComponent(code)}`);
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'NETWORK' };
  }
}

const API_ERRORS = {
  NO_URL: '구글 시트 주소가 설정되지 않았어요',
  BAD_KEY: '판매처 비밀번호가 틀렸어요',
  UNKNOWN_CODE: '등록되지 않은 카드예요',
  INSUFFICIENT: '잔액이 부족해요',
  NETWORK: '인터넷 연결을 확인해주세요',
  SERVER: '시트 처리 중 오류가 났어요',
  NO_TX: '시트에서 거래를 찾지 못했어요',
};
function apiErrorText(r) { return API_ERRORS[r && r.error] || ('오류: ' + ((r && r.error) || '알 수 없음')); }

// ---------- 테스트 모드: 구글 시트 대신 localStorage ----------
const MOCK_KEY = 'pos_mock_db';
function mockDb() {
  return load(MOCK_KEY, null) || {
    key: '1234',
    people: [
      { code: 'TESTAAAA', grade: '3학년', name: '김철수', given: 300, used: 0 },
      { code: 'TESTBBBB', grade: '5학년', name: '이영희', given: 50, used: 0 },
      { code: 'TESTCCCC', grade: '중1', name: '박민수', given: 200, used: 0 },
    ],
    tx: [],
  };
}

async function mockApi(action, req) {
  await new Promise((r) => setTimeout(r, 300)); // 실제처럼 약간의 지연
  const db = mockDb();
  const done = (res) => { save(MOCK_KEY, db); return res; };
  const person = (code) => db.people.find((p) => p.code === String(code || '').toUpperCase());
  const info = (p) => ({ code: p.code, grade: p.grade, name: p.name, balance: p.given - p.used });

  if (action === 'wallet') {
    const p = person(req.code);
    if (!p) return { ok: false, error: 'UNKNOWN_CODE' };
    const history = db.tx.filter((t) => t.code === p.code).slice(-20).reverse();
    return { ok: true, ...info(p), history };
  }
  if (req.key !== db.key) return { ok: false, error: 'BAD_KEY' };

  const boothName = req.booth === 'food' ? '음식' : '물품';
  switch (action) {
    case 'ping': return { ok: true, title: '테스트 모드' };
    case 'roster': return { ok: true, people: db.people.map((p) => ({ code: p.code, grade: p.grade, name: p.name })) };
    case 'lookup': {
      const p = person(req.code);
      return p ? { ok: true, ...info(p) } : { ok: false, error: 'UNKNOWN_CODE' };
    }
    case 'pay': {
      const p = person(req.code);
      if (!p) return { ok: false, error: 'UNKNOWN_CODE' };
      if (db.tx.some((t) => t.id === req.txId)) return { ok: true, duplicate: true, ...info(p) };
      if (req.amount > p.given - p.used) return { ok: false, error: 'INSUFFICIENT', ...info(p) };
      p.used += req.amount;
      db.tx.push({ id: req.txId, time: new Date().toISOString(), booth: boothName, code: p.code, items: req.items, amount: req.amount, method: '카드', status: '정상' });
      return done({ ok: true, ...info(p) });
    }
    case 'cash': {
      if (!db.tx.some((t) => t.id === req.txId)) {
        db.tx.push({ id: req.txId, time: new Date().toISOString(), booth: boothName, code: '', items: req.items, amount: req.amount, method: '현금', status: '정상' });
      }
      return done({ ok: true });
    }
    case 'cancel': {
      const t = db.tx.find((x) => x.id === req.txId);
      if (!t) return { ok: false, error: 'NO_TX' };
      if (t.status === '취소') return { ok: true, already: true };
      t.status = '취소';
      const p = t.method === '카드' && person(t.code);
      if (p) p.used = Math.max(0, p.used - t.amount);
      return done({ ok: true, ...(p ? info(p) : {}) });
    }
    default: return { ok: false, error: 'UNKNOWN_ACTION' };
  }
}

// ---------- 시트로 못 보낸 판매 기록 재전송 ----------
async function syncPending() {
  const s = getSettings();
  if (!s.url || !s.key) return 0;
  const sales = load(KEYS.sales, []);
  let sent = 0;
  for (const sale of sales) {
    if (sale.synced || !sale.method) continue; // method 없는 건 시트 연동 전 기록
    let r;
    if (sale.status === 'cancel') r = await api('cancel', { txId: sale.id });
    else if (sale.method === 'card') continue; // 카드 결제는 결제 시점에 이미 시트에 기록됨
    else r = await api('cash', { txId: sale.id, amount: sale.total, items: sale.items || '', booth: sale.booth, device: s.device });
    if (r.ok || r.error === 'NO_TX') { sale.synced = true; sent++; }
    else if (r.error === 'NETWORK') break;
  }
  if (sent) save(KEYS.sales, sales);
  return sent;
}

function pendingCount() {
  return load(KEYS.sales, []).filter((s) => !s.synced && s.method && (s.method === 'cash' || s.status === 'cancel')).length;
}
