# MOA FORMULA 모의면접 시뮬레이터 — 배포 안내

## 폴더 구성
- `index.html` : 학생/강사가 보는 화면
- `api/feedback.js` : AI 피드백을 만드는 서버 함수
- `api/results.js` : 학생별 결과 링크를 저장·조회하는 서버 함수
- `package.json` : 필요한 부품 목록

## 배포 후 꼭 해야 할 설정 2가지

### 1) API 키 등록
Vercel 프로젝트 → **Settings → Environment Variables** 에서:
- Key: `ANTHROPIC_API_KEY`
- Value: (Anthropic 콘솔에서 발급받은 sk-ant-로 시작하는 키)

저장 후 반드시 **Redeploy(재배포)** 한 번 눌러주세요.

### 2) 학생 결과 저장소(Vercel KV) 연결
Vercel 프로젝트 → **Storage** 탭 → **Create Database** → **KV** 선택 → 프로젝트에 연결.
연결하면 필요한 값들이 자동으로 설정되어, 별도로 입력할 게 없습니다.

이 2가지가 끝나면 학생 링크와 AI 피드백이 정상 작동합니다.
