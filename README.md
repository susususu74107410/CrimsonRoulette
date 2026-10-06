# 칩 게임 사이트

정적 프론트엔드(HTML/CSS/JS, GitHub Pages·Netlify 등에 그대로 올릴 수 있음) +
Supabase(DB + Edge Functions)로 만든 다인용 칩 게임 사이트입니다.

칩 가치처럼 숨겨야 하는 값과 부정 방지가 필요한 로직(게임 판정, 쿨다운, 칩 차감)은
전부 서버(Edge Function)에서만 계산하고, 프론트엔드는 결과만 표시합니다.

## 1. 폴더 구조 (이 저장소 전체를 그대로 GitHub에 올리면 됩니다)

```
├── README.md
├── .gitignore
├── .github/workflows/deploy-functions.yml   ← (선택) push 시 백엔드 자동 배포
├── docs/                      ← 프론트엔드. GitHub Pages가 이 폴더를 그대로 서비스합니다
│   ├── index.html              (로그인 전 메인 — 공개 로그)
│   ├── login.html / dashboard.html / games.html / shop.html
│   ├── admin.html              (관리자 콘솔 — 러너에게 링크 공유 금지)
│   ├── .nojekyll
│   ├── css/style.css
│   └── js/                     (config.js ← 여기 한 줄만 수정)
└── supabase/                  ← 백엔드 (Supabase DB + Edge Functions)
    ├── schema.sql              (SQL Editor에서 실행할 테이블 정의)
    ├── config.toml
    └── functions/              (auth · data · game · economy · admin + _shared)
```

GitHub Pages는 정적 파일만 서비스하므로, 데이터베이스와 게임 판정 로직은
Supabase(무료 플랜 가능)에 두는 구조입니다. 총 4단계입니다.

## 2. 설정 순서

**① Supabase 프로젝트 만들고 테이블 생성**
1. https://supabase.com 에서 새 프로젝트 생성.
2. 좌측 **SQL Editor**에 `supabase/schema.sql` 내용을 붙여넣고 Run.
3. **Project Settings → Data API**에서 Project URL을 복사해 둡니다.
   (Functions 주소 = `Project URL/functions/v1`)

**② 관리자 비밀번호 등록**
- Supabase 대시보드 → **Edge Functions → Secrets**에서 `ADMIN_PASSWORD` 를 추가합니다.
  (관리자 콘솔 로그인에 쓰이는 값입니다)

**③ 백엔드(Edge Functions) 배포** — 아래 A 또는 B 중 하나
- **A. GitHub Actions 자동 배포 (권장, 컴퓨터에 아무것도 설치 안 해도 됨)**
  1. Supabase 대시보드 → Account → **Access Tokens**에서 토큰 발급.
  2. GitHub 저장소 → Settings → Secrets and variables → Actions에 두 개 등록:
     `SUPABASE_ACCESS_TOKEN`(발급한 토큰), `SUPABASE_PROJECT_REF`(프로젝트 참조 ID —
     대시보드 URL `.../project/여기` 부분).
  3. Actions 탭 → *Deploy Supabase Edge Functions* → **Run workflow**
     (이후에는 `supabase/functions` 를 수정해 push할 때마다 자동 배포됩니다).
  - 웹에서 `.github` 폴더 업로드가 안 되면: 저장소에서 **Add file → Create new file**로
    파일명에 `.github/workflows/deploy-functions.yml` 을 입력하고 내용을 붙여넣으세요.
- **B. CLI 수동 배포**
  ```bash
  supabase login
  supabase functions deploy --project-ref YOUR_PROJECT_REF --no-verify-jwt
  ```

> 이 앱은 Supabase Auth 대신 자체 로그인 토큰을 씁니다. 그래서 함수를
> `--no-verify-jwt`(config.toml에도 동일 설정)로 배포해야 합니다.

**④ 프론트엔드 연결 & Pages 켜기**
1. `docs/js/config.js` 의 `FUNCTIONS_URL` 을 `https://내프로젝트.supabase.co/functions/v1` 로 수정
   (GitHub 웹에서 파일을 열고 연필 아이콘으로 바로 수정 가능).
2. 저장소 → Settings → **Pages** → Source: *Deploy from a branch* →
   Branch `main` / 폴더 **`/docs`** → Save.
3. 잠시 후 `https://아이디.github.io/저장소이름/` 에서 접속됩니다.
   (모든 링크가 상대 경로라 하위 경로 주소에서도 동작합니다.)

선택: 배포 주소가 정해지면 `supabase/functions/_shared/cors.ts` 의
`Access-Control-Allow-Origin` 을 `https://아이디.github.io` 로 좁히면 더 안전합니다.

## 5. 관리자 콘솔로 초기 세팅

배포된 사이트의 `admin.html` 로 접속 → 위에서 설정한 `ADMIN_PASSWORD`로 로그인합니다.

1. **팀 만들기**: 팀 이름을 입력해 3팀(또는 원하는 수)을 만듭니다.
2. **러너 만들기**: 아이디/비밀번호/표시 이름/소속 팀과 시작 칩 개수(색상별)를
   입력합니다. 총합은 30개를 넘을 수 없습니다.
3. 생성한 아이디/비밀번호를 각 러너에게 전달합니다 (러너는 `login.html`로 로그인).
4. **칩 가치 직접 설정**에서 게임 시작 전 원하는 초기 가치로 조정할 수 있습니다.
5. **현황판**에서 실시간 칩 가치·팀 순위·상점 누적 사용 횟수를 확인할 수 있습니다
   (이 화면은 관리자만 보는 화면이며, 러너에게는 노출되지 않습니다).

`admin.html`은 러너용 내비게이션 어디에도 링크되어 있지 않지만, 주소를 알면
누구나 접근할 수 있는 페이지이므로 비밀번호를 안전하게 관리하세요.

## 6. 이 구현이 규칙을 해석/설계한 부분 (요청서에 없던 세부 규칙)

요청서의 17개 규칙 중 실행 로직까지 정하지 않은 부분은 아래와 같이 구체화했습니다.
행사 성격에 안 맞으면 알려주시면 바로 조정해 드립니다.

- **칩 환전**: `보내는 개수 × (보내는 칩 가치 ÷ 받는 칩 가치)` 값을 내림(절삭)해서
  지급합니다. (규칙 7의 "소수점 절삭"이 발생하는 지점이 여기라고 해석했습니다.)
- **"총합"의 의미**: 개인 페이지의 "총합"은 보유 칩 개수가 아니라 **가치 기준
  합계**(개수 × 그 순간의 가치, 색상별 합산)입니다. 우승 조건(규칙 2)도 이 총합
  기준입니다.
- **칩 가치 바꾸기 아이템**: 구매자가 색상 1개와 원하는 새 가치를 직접 지정합니다
  (관리자가 정한 최소/최대 범위 안에서). 다른 방식(예: 범위 내 무작위, 상승만 가능
  등)을 원하시면 `economy/index.ts`의 `change_value` 분기만 바꾸면 됩니다.
- **PVP 참가 방식**: 참가자는 코드만 입력하면 되고, 베팅 칩 색상·수량은 방을 만든
  사람이 정한 값을 그대로 따릅니다(참가자가 색상/수량을 따로 지정하지 않음). 방은
  15분간 유효하며, 아무도 참가하지 않으면 자동으로 베팅 칩이 환불됩니다.
- **PVP 블랙잭 / 하이앤로우**: 대화형 히트·스탠드가 아니라, 두 사람 모두
  "16 이하면 자동으로 더 받고 17 이상이면 멈춘다"는 표준 규칙으로 패가 자동
  진행된 뒤 즉시 비교합니다(하이앤로우는 각자 1~100 난수 비교). 무승부는 베팅 반환.
- **러시안 룰렛**: 실제 총기 요소 없이 추상화한 "확률 도전" 미니게임입니다. 1~6칸
  중 1칸이 "위험 칸"이며, 도전 단계(1~5)를 미리 정해 생존 확률과 배당이 함께
  커지는 방식입니다. 배당은 공정 배당(1단계 1.2배 ~ 5단계 6배)이며 승리 시 최소 1개를 지급합니다 (자세한 확률식은 `_shared/games.ts` 주석 참고).
- **NVP 블랙잭**: 러너 vs 하우스도 위와 같은 자동 진행 방식이며, 블랙잭(카드 2장
  21)은 1.5배를 지급합니다.
- **하루 기준**: NVP 일일 3회 제한은 한국 표준시(KST) 자정 기준으로 초기화됩니다.
- **로그인 세션**: 러너 세션은 12시간, 관리자 세션은 24시간 후 만료됩니다.
- **상점의 "지정 1인 확인/교환" 대상 지정**: 대상은 로그인 아이디로 지정합니다.

## 7. 보안 메모

- 모든 테이블은 RLS가 켜져 있고 정책이 없어서, `anon` 키로는 아무 것도 직접
  읽거나 쓸 수 없습니다. 모든 접근은 서비스 롤 키를 쓰는 Edge Function을 통해서만
  이뤄집니다 — 칩 가치처럼 숨겨야 하는 데이터가 클라이언트로 새지 않습니다.
- 비밀번호는 PBKDF2(SHA-256, 10만 회 반복)로 해시되어 저장됩니다.
- 이 코드는 네트워크가 차단된 환경에서 작성되어 실제 Supabase 프로젝트에 대고
  직접 실행해보지는 못했습니다. **행사 전에 꼭 러너 계정 1~2개로 전체 플로우
  (로그인 → 게임 → 환전 → 상점 → 로그 확인)를 직접 테스트해보세요.**

## 8. 나중에 확장하고 싶다면

- PVP 블랙잭을 실시간 히트/스탠드 대화형으로 바꾸기 (현재는 자동 진행)
- 러시안 룰렛을 실시간으로 한 번씩 당길 때마다 멈출지 고를 수 있는 방식으로 바꾸기
- 관리자 콘솔에 러너 비밀번호 재설정, 러너 삭제 기능 추가
- CORS 출처를 배포 주소로 제한
