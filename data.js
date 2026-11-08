// =====================================================================
//  고정 데이터 — 메뉴/물품/가격은 여기만 고치면 모든 기기에 똑같이 적용
//  (고친 뒤 GitHub에 data.js만 다시 올리면 됨)
// =====================================================================

// 🍢 음식 메뉴 (계산대 버튼 순서대로, 9개)
const FOODS = [
  { name: '닭꼬치', price: 40 },
  { name: '떡볶이', price: 30 },
  { name: '순대', price: 20 },
  { name: '어묵', price: 20 },
  { name: '라면', price: 20 },
  { name: '치킨팝', price: 40 }, // 콜팝 -> 치킨팝
  { name: '맛감자', price: 30 },
  { name: '음료', price: 10 },
  { name: '아이스티', price: 20 },
];

// 🎁 물품 목록 — id는 QR에 들어가는 값이라 겹치면 안 되고, 인쇄한 뒤에는 바꾸지 말 것
//    (가격·이름은 언제든 바꿔도 됨: 이미 붙인 QR도 새 가격으로 계산됨)
//    qty = 스티커 인쇄 기본 개수 (예상 판매 수량)
const GOODS = [
  // 01 의류
  { id: 'G001', name: '남성 양말', price: 50, qty: 20 },
  { id: 'G002', name: '여성 양말', price: 50, qty: 20 },
  { id: 'G003', name: '장갑', price: 100, qty: 5 },
  { id: 'G004', name: '도톰 목도리', price: 200, qty: 5 },
  { id: 'G005', name: '수면바지', price: 150, qty: 5 },
  { id: 'G006', name: '로카티', price: 140, qty: 10 },
  { id: 'G007', name: '캐시미어 목도리', price: 170, qty: 10 },
  { id: 'G008', name: '할머니조끼', price: 150, qty: 10 },
  { id: 'G009', name: '셔츠', price: 180, qty: 5 },
  { id: 'G010', name: '히트텍', price: 150, qty: 6 },
  { id: 'G011', name: '수면양말', price: 80, qty: 16 },
  // 02 헤어용품/악세사리/화장품
  { id: 'G012', name: '발을씻자', price: 80, qty: 3 },
  { id: 'G013', name: '신발탈취제', price: 80, qty: 3 },
  { id: 'G014', name: '다우니 스프레이', price: 50, qty: 3 },
  { id: 'G015', name: '메디힐 마스크팩', price: 30, qty: 20 },
  { id: 'G016', name: '토리든 세럼', price: 150, qty: 3 },
  { id: 'G017', name: '녹두 클렌징폼', price: 180, qty: 3 },
  { id: 'G018', name: '스키니 브로우', price: 130, qty: 3 },
  { id: 'G019', name: '파우더 블러쉬', price: 150, qty: 2 },
  { id: 'G020', name: '롬앤 틴트', price: 150, qty: 4 },
  { id: 'G021', name: '도브 바디워시', price: 100, qty: 2 },
  { id: 'G022', name: '자작나무 선크림', price: 170, qty: 4 },
  { id: 'G023', name: '헤어롤 50mm', price: 30, qty: 10 },
  { id: 'G024', name: '디즈니푸 헤어롤', price: 30, qty: 10 },
  { id: 'G025', name: '별패치 파스텔', price: 80, qty: 10 },
  { id: 'G026', name: '별패치 비비드', price: 80, qty: 10 },
  { id: 'G027', name: '바다포도 스킨팩', price: 90, qty: 10 },
  { id: 'G028', name: '핸드크림', price: 50, qty: 10 },
  // 03 디지털/가전
  { id: 'G029', name: '충전 손난로', price: 100, qty: 10 },
  { id: 'G030', name: '핸디 청소기', price: 130, qty: 2 },
  { id: 'G031', name: '무선 고데기', price: 150, qty: 2 },
  { id: 'G032', name: '블루투스 스피커', price: 130, qty: 2 },
  { id: 'G033', name: '무선이어폰', price: 130, qty: 2 },
  { id: 'G034', name: '무드등 가습기', price: 150, qty: 2 },
  // 04 문구/완구
  { id: 'G035', name: '왁뿌볼', price: 40, qty: 12 },
  { id: 'G036', name: '드로잉패드', price: 50, qty: 5 },
  { id: 'G037', name: '랜덤 아크릴키링', price: 10, qty: 60 },
  { id: 'G038', name: '스프링노트', price: 25, qty: 12 },
  { id: 'G039', name: '수정테이프', price: 20, qty: 10 },
  { id: 'G040', name: '필통', price: 20, qty: 10 },
  { id: 'G041', name: '2027 다이어리', price: 100, qty: 3 },
  { id: 'G042', name: '제트스트림 볼펜', price: 20, qty: 20 },
  { id: 'G043', name: '아코디언 파일', price: 80, qty: 6 },
  { id: 'G044', name: '도블 보드게임', price: 150, qty: 1 },
  { id: 'G045', name: '보난자 보드게임', price: 100, qty: 1 },
  { id: 'G046', name: '차오차오 게임', price: 160, qty: 1 },
  { id: 'G047', name: '스탠리 텀블러', price: 350, qty: 2 },
  { id: 'G048', name: '자동우산', price: 150, qty: 5 },
  { id: 'G049', name: '신발주머니', price: 20, qty: 100 },
  // 05 식품
  { id: 'G050', name: '프로틴 초코 2kg', price: 300, qty: 2 },
  { id: 'G051', name: '무설탕 사탕', price: 50, qty: 4 },
  { id: 'G052', name: '이클립스', price: 20, qty: 16 },
  { id: 'G053', name: '쫀드기', price: 20, qty: 12 },
  { id: 'G054', name: '우마이봉', price: 20, qty: 45 },
  { id: 'G055', name: '꾀돌이 외 과자', price: 30, qty: 15 },
  { id: 'G056', name: '에낙 라면과자', price: 30, qty: 8 },
  { id: 'G057', name: '오징어다리', price: 20, qty: 20 },
  { id: 'G058', name: '제티 코코아', price: 50, qty: 4 },
  { id: 'G059', name: '신라면', price: 60, qty: 8 },
  { id: 'G060', name: '바프 파티박스', price: 30, qty: 5 },
  { id: 'G061', name: '하몽칩', price: 30, qty: 10 },
  { id: 'G062', name: '차카니', price: 20, qty: 30 },
  { id: 'G063', name: '아폴로', price: 20, qty: 20 },
];
