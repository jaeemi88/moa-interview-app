# MOA FORMULA 모의면접 시뮬레이터 (moa-interview-app)

## 앱 정보
- 진로모아커리어센터 "면접스킬" 앱 묶음의 하나. 학생이 면접 질문에 답하면 AI가 피드백
- Vercel 프로젝트: moa-interview-app (https://moa-interview-app.vercel.app) / GitHub: jaeemi88
- 파일은 저장소 최상위에 바로 있음 (public 폴더 아님)
  - index.html: 학생·강사 화면 전체 / api/: 서버 함수 / moa-ui.css·moa-ui.js: 공용 디자인 키트
  - vercel.json: /go/:키 → index.html (네이버 예약 안내용 자동 입장 링크)
- 화면 구분
  - 학생: ?t=강사코드 (허브에서 들어오면 #moa-s=로 이름·숫자 4자리 전달)
  - 강사: ?admin=1 → staff-guard.js(admin 모드) 잠금. 원장님 암호(STAFF_PIN) 또는 강사 개인 승인 링크(?k=)
  - 유료 개인 고객: ?shop=키 또는 /go/키 (네이버 예약) → 확인코드로 입장, 항상 심화 진행
- AI: Anthropic API (api/feedback.js, generate-questions.js, coach.js, live.js, _company.js, _fitlen.js)
- 환경변수: ANTHROPIC_API_KEY, REDIS_URL, STAFF_PIN, MASTER_ADMIN_PASSWORD, RESEND_API_KEY, ADMIN_EMAIL

## 디자인 규칙
- 대표색: 블루 #295BF2 (잠금 화면·앱 구분용). 화면 톤은 공용 디자인 키트(남색 #141A2E + 라임 #C0D904)
- 폰트: Noto Sans KR / 흰 배경 / 상단 "MOA FORMULA" 로고
- 버튼·카드 모양은 다른 면접스킬 앱과 통일
- 학생용 버튼은 대표색 채움, 강사용은 같은 색 테두리 + 자물쇠 아이콘
- 소속 강사 명칭은 "파트너강사" ("파견강사" 사용 금지)

## 반드시 유지할 기능 (2026-10-06 기준, index.html 약 5,427줄 — 이보다 크게 줄면 옛 버전으로 돌아간 것)
- 학생: 직무·카테고리 선택 → 질문 답변 → AI 피드백 → 결과 화면 (screen-select, screen-chat, screen-result)
- 학생 답변 임시 저장·결과 확인코드로 다시 보기 (stuSaveAnswers, lookupResultCode, showMyCodeScreen)
- 기업 심화 분석 카드 ('심화' 수업·유료 고객) (companyDeepOn, attachCompanyBrief)
- 강사 설정: 질문 패키지·오늘 수업·레드플래그·자유 입력 (openSettings, renderPackageTab, renderTodayTab)
- 실시간 보드(라이브) (openLiveBoard, renderLiveBoard)
- 원장님 강사 명단 관리 (renderMasterTeacherList)
- 유료 고객 모드: 확인코드·결과 보기·최종 제출·환불 (initClientMode, clientFinalSubmit, refundSubmitConfirm)

## 작업 원칙
- 수정 전 항상 현재 저장소의 최신 index.html을 기준으로 작업 (예전 버전 덮어쓰기 금지)
- 수정본은 저장소 최상위에 저장 (이 앱은 public 폴더를 쓰지 않음)
- 수정 후 줄 수가 크게 줄었거나 위 기능이 사라졌으면 작업 중단하고 알릴 것
- api/teacher-registry.js는 모의면접·자소서·트래커 공용 최신 버전 유지 (같은 Redis 강사 명단·초대코드 공유)
- staff-guard.js, moa-ui.css, moa-ui.js도 여러 앱 공용 파일. 고칠 때는 다른 앱의 같은 파일과 함께 맞출 것
- 큰 변경은 먼저 계획을 보여주고 승인받은 뒤 진행
- 결과물은 모바일에서도 정상 표시되어야 함
