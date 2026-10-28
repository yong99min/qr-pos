# QR 계산대 (POS)

노트북 전면 카메라로 QR 코드를 찍어 장바구니에 담는 간단한 계산대 웹앱입니다.
빌드 도구 없이 HTML + CSS + 바닐라 JS로 만들었고, 데이터는 모두 브라우저 localStorage에 저장됩니다.

## 실행 방법

카메라는 **localhost 또는 https**에서만 동작하고, `products.json`을 읽어야 하므로
파일을 더블클릭해서 열지 말고 로컬 서버로 열어주세요. 이 `qr-pos` 폴더에서:

```bash
npx serve .
```

또는

```bash
python -m http.server 8080
```

그다음 브라우저에서 `http://localhost:3000` (serve) 또는 `http://localhost:8080` (python)을 엽니다.
처음 열 때 카메라 권한을 **허용**해주세요.

> QR 라이브러리(html5-qrcode, qrcode.js)를 CDN에서 불러오므로 인터넷 연결이 필요합니다.

## 폰으로 접속하기

폰 브라우저는 **HTTPS 주소에서만** 카메라를 허용하므로 `http://192.168.x.x`로는 카메라가 켜지지 않습니다.
자체 서명 인증서로 HTTPS 서버를 띄웁니다. (PC와 폰이 **같은 와이파이**에 있어야 함)

1. 인증서 만들기 (최초 1회, 프로젝트 루트에서. IP는 `ipconfig`의 IPv4 주소로 바꾸세요)

   ```bash
   mkdir -p .qr-pos-cert && openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout .qr-pos-cert/key.pem -out .qr-pos-cert/cert.pem -subj "/CN=QR POS Local" -addext "subjectAltName=IP:192.168.200.100,DNS:localhost"
   ```

   인증서는 `qr-pos` 폴더 **밖**에 둬야 개인키가 웹으로 노출되지 않습니다.

2. HTTPS 서버 켜기 (프로젝트 루트에서)

   ```bash
   npx serve qr-pos --ssl-cert .qr-pos-cert/cert.pem --ssl-key .qr-pos-cert/key.pem -l tcp://0.0.0.0:8443
   ```

   Windows 방화벽 창이 뜨면 **개인 네트워크 허용**을 눌러주세요.

3. PC에서 `https://PC의IP:8443` 을 열고 → 인증서 경고에서 **고급 → 계속 진행**
4. 오른쪽 위 **📱 폰으로 열기** → 뜨는 QR을 폰 기본 카메라로 찍기
5. 폰에서도 인증서 경고 → **고급 → 계속 진행**(iPhone은 "세부사항 보기 → 이 웹 사이트 방문") → 카메라 **허용**

폰에서는 자동으로 후면 카메라를 쓰고, 카메라 화면 오른쪽 위 버튼으로 전면/후면을 바꿀 수 있습니다.
상품·장바구니·판매 내역은 **기기마다 따로** 저장됩니다(폰의 판매 내역은 PC에 안 보임).

## 페이지

| 파일 | 설명 |
| --- | --- |
| `index.html` | 계산대. 왼쪽 카메라(거울 모드) / 오른쪽 장바구니, 결제 완료·초기화 |
| `admin.html` | 상품 추가/수정/삭제, 상품별 QR 표시, [전체 QR 인쇄] |
| `금액QR_1000-100000달란트.pdf` | 1,000~100,000달란트 금액 QR 100개, A4 4×5 격자 5장 (인쇄용) |
| `sales.html` | 판매 내역, 오늘/전체 판매액, 날짜별 합계, 삭제, CSV 내보내기 |

## QR 형식

- **상품 QR**: 상품 ID 그대로 (예: `P001`). 상품 관리에 등록된 ID여야 함
- **금액 QR**: `AMT:금액` (예: `AMT:5000`) → 장바구니에 "5,000달란트" 항목으로 추가

같은 QR은 화면에서 1.5초 이상 사라졌다가 다시 보여야 또 인식됩니다. 미등록 QR은 빨간 테두리와 "미등록 상품" 안내가 뜹니다.

## 효과음

`sounds/scan.mp3`(인식 성공), `sounds/error.mp3`(미등록 상품) 파일을 넣으면 그 소리가 납니다.
파일이 없으면 마트 스캐너 같은 "삑" 소리를 프로그램이 직접 만들어 냅니다 (`app.js`의 `beep()`).

## 데이터 (localStorage)

| 키 | 내용 |
| --- | --- |
| `pos_products` | 상품 목록. 처음 실행 시 `products.json`으로 채워짐 |
| `pos_cart` | 현재 장바구니 (새로고침해도 유지) |
| `pos_sales` | 결제 내역 (날짜·시간 + 최종 합계) |

상품 관리의 [기본 상품으로 되돌리기]를 누르면 `products.json` 내용으로 다시 초기화됩니다.
브라우저 데이터를 지우면 판매 내역도 사라지니, 필요하면 판매 내역 페이지에서 CSV로 백업하세요.
