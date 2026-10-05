// api/feedback.js
// AI 피드백 생성 서버 함수 (공통 원칙 + 피드백 다양화 + 결격 신호 체크 버전, 2026-09-26)
// - 모든 요청에 [공통 원칙]과 [피드백 다양화 원칙]을 자동으로 붙임
// - ⚙ 설정의 프리셋에는 "전공별 기준"만 적으면 됨
// - 제출할 때마다 예시 영역 / 코칭 렌즈 / 도입 방식을 무작위로 골라 전달

// ───────────────────────────────────────────
// 0. 공통 원칙 (모든 전공·모든 요청에 자동 적용)
// ───────────────────────────────────────────
// Vercel 함수 최대 실행 시간 60초 (AI 답변이 길어져도 중간에 끊기지 않도록)
export const config = { maxDuration: 120 }; // 예시 답변 형광펜·보기 추가로 여유 있게 (2026-10-02)

const COMMON_RULES = `■ 공통 원칙 (면접관 시점)
- 학생 원문에 없는 경험·수치·사실은 절대 추가하지 않는다. 보완이 필요하면 "어느 문장 뒤에, 어떤 종류의 실제 경험을 넣으면 좋은지"를 구체적으로 안내한다.
- 채용은 뛰어난 인재를 골라내는 과정이라기보다, 결격사유가 있는 지원자를 걸러내고 남은 사람을 뽑는 과정이라는 관점으로 본다. 면접관은 모험하지 않고 최대한 보수적으로 판단한다.
- 면접관은 과거 경험으로 입사 후 행동을 예측한다. 각 경험이 "이 사람은 같은 상황에서 이렇게 행동하겠구나"라는 믿을 만한 예측으로 이어지는지 점검한다.
- 결격사유로 읽힐 수 있는 표현을 가장 먼저 찾아 짚고 순화안을 제시한다. (예: 책임을 남이나 환경 탓으로 돌리는 표현, 불평·부정적 감정 노출, 잦은 중도 포기, 조직·규칙에 대한 반감, 검증할 수 없는 과장)
- 튀는 표현이나 과한 자기 과시보다, 신뢰감·안정감·꾸준함이 드러나는 쪽으로 다듬는다. "일을 잘할 것 같고 크게 흠이 없는 사람"으로 읽히는 것이 목표다.
- 경험의 규모보다, 그 경험에서 느끼고 변화·성장한 점이 드러났는지를 본다.`;

// ───────────────────────────────────────────
// 1. 다양화 재료 (전공·과정에 맞게 자유롭게 수정하세요)
// ───────────────────────────────────────────
const DOMAINS = [
  '스포츠', '요리', '여행', '병원 현장', '카페 아르바이트',
  '항공 서비스', '동아리 활동', '드라마 한 장면'
];

const LENSES = [
  '면접관 첫인상', '직무 연결성', '구체성(숫자·장면)',
  '성장 스토리', '전달력', '결격사유 점검'
];

const OPENERS = [
  '장면 묘사형', '숫자 제시형', '질문형', '결론 먼저형', '가치관 한 문장형'
];

const TONE_RULES = `
[담백하게 — 신파 금지 (2026-10-04)]
- 요즘 면접관은 고생담·감동 코드에 점수를 주지 않는다. 감정을 꾸미지 말고 행동과 결과로 말하게 한다.
- 상황 묘사는 첫 한 문장까지만. 바로 무엇을 했고 어떤 결과가 났는지로 넘어간다.
- 쓰지 않는 표현: 가난·고생·눈물·희생을 강조하는 서사, "처음으로 실감했습니다", "가슴이 뭉클" 같은 감정 과장, 비장한 자기 주문.
- 절약·인내·성실 같은 덕목은 '참고 아끼는 사람'이 아니라 '계획하고 관리하고 실행하는 사람'으로 연결한다.
- 마무리는 다짐만으로 끝내지 않고, 같은 태도가 드러난 다른 사례 한 줄이나 직무 연결로 맺는다.`;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ───────────────────────────────────────────
// 2. 피드백 다양화 원칙 (모든 요청에 자동 추가)
// ───────────────────────────────────────────
const DIVERSITY_RULES = `

[피드백 다양화 원칙]
목적: 같은 과정의 학생들이 결과를 서로 비교해도 "복사한 듯한" 느낌이 들지 않게 한다.
코칭 방향(평가 철학·기준)은 모든 학생에게 동일하게 유지하되,
표현·예시·비유·문장 구성은 학생마다 반드시 다르게 작성한다.

1. 학생 고유 재료에서 출발
- 모든 항목은 학생 답변 속 구체적인 단어·경험·장면·수치를 최소 1개 이상 직접 언급하며 시작한다.
- 답변과 무관한 일반론으로 시작하지 않는다.

2. 비유·예시는 [오늘의 예시 영역]에서 가져온다
- 아래 [오늘의 예시 영역]을 활용해 비교나 비유를 1개 이상 쓴다.
- 한 피드백 안에서 같은 비유를 두 번 쓰지 않는다.

3. 개선점의 첫 포인트는 [오늘의 코칭 렌즈]로 잡는다
- 아래 렌즈를 개선점의 첫 번째 관점으로 삼고, 나머지는 자유롭게 보완한다.

4. 상투 표현 금지
- 다음 문장은 쓰지 않는다: "전반적으로 잘 작성되었습니다", "~하면 더 좋을 것 같습니다",
  "구체적인 사례를 추가하세요", "자신감 있게 말하세요", "진정성이 느껴집니다".
- 대신 "무엇을, 어느 문장 뒤에, 어떻게" 넣을지 콕 집어 제시한다.

5. 다듬은 문장은 [오늘의 도입 방식]으로 시작한다
- 학생 본인의 경험을 살려 재구성하고, 정해진 템플릿 문장을 쓰지 않는다.

6. 답변이 짧거나 다른 학생과 비슷할 때
- 회피 문구 없이 모든 필드를 실질적인 내용으로 채운다.
- 학생의 전공·지원 직무·이름 등 입력 정보가 있으면 적극 활용해 차별화한다.

7. 위 원칙은 표현 방식에만 적용하며, 응답 형식(JSON 필드 구성)은 기존 지시를 그대로 따른다.`;


// ───────────────────────────────────────────
// ★ AI 응답 JSON 안전하게 읽기 (2026-09-26 추가)
//   - 앞뒤 설명 문장·코드블록 제거, 문자열 속 줄바꿈 정리
//   - 그래도 실패하면 한 번 더 요청 (재시도)
// ───────────────────────────────────────────
function sanitizeJsonString(raw) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { result += ch; escaped = false; }
      else if (ch === '\\') { result += ch; escaped = true; }
      else if (ch === '"') { result += ch; inString = false; }
      else if (ch === '\n') result += '\\n';
      else if (ch === '\r') result += '\\r';
      else if (ch === '\t') result += '\\t';
      else result += ch;
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

function parseAIJson(raw) {
  let text = String(raw || '').replace(/```json|```/g, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try { return JSON.parse(text); } catch (e) {}
  try { return JSON.parse(sanitizeJsonString(text)); } catch (e) {}
  return null;
}

// ───────────────────────────────────────────
// ★ 답변 방향 단계 (2026-09-30 추가 · 모든 요청에 자동 적용, 강사 개인 프리셋 포함)
//   결과 화면에서 "경험 한 장면 → 그때 느낀 점 → …" 칩으로 보여주는 용도
//   sample_direction(설명 문장)은 그대로 두고 새 필드만 추가 → 예전 결과도 그대로 열림
// ───────────────────────────────────────────
const DIRECTION_STEPS_RULE = `

[답변 방향 단계 — direction_steps 필드, 반드시 채움]
sample_direction의 내용을 학생이 말하는 순서대로 3~4단계로 압축해 direction_steps 배열에 넣는다.
- 각 단계는 명사형 키워드 한 줄, 12자 안팎 (예: 「경험 한 장면」, 「그때 느낀 점」, 「기관과 연결」, 「입사 후 기여」)
- 정답 문장을 쓰지 않는다. 학생이 자기 경험을 채워 넣을 틀만 준다
- 학생 답변이 비어 있어도 질문에 맞는 일반적인 순서로 채운다
형식: "direction_steps": ["1단계", "2단계", "3단계", "4단계"]`;

const JSON_SAFETY_RULE = `

[JSON 작성 주의 — 매우 중요]
- 문자열 값 안에서는 큰따옴표를 절대 쓰지 않는다. 학생 답변을 인용하거나 강조할 때는 작은따옴표(' ')나 「 」를 쓴다.
- 응답은 { 로 시작해 } 로 끝나는 JSON 객체 하나뿐이다. 앞뒤에 설명 문장을 붙이지 않는다.`;

// ───────────────────────────────────────────
// ★ 결격 신호 체크 (2026-09-26 추가 · 모든 요청에 자동 적용)
//   업종 치명타 목록은 원장님 현장 경험에 맞게 자유롭게 고쳐 쓰셔도 됩니다.
// ───────────────────────────────────────────
const RED_FLAG_RULES = `

[결격 신호 체크 — 반드시 수행, 결과는 red_flags 필드에]
면접관이 「이 사람은 걸러야겠다」고 판단할 수 있는 표현을 답변에서 찾는다. 스펙과 내용이 좋아도 이런 신호 하나로 탈락할 수 있다.

■ 공통 결격 신호 6가지 (type에는 아래 이름을 그대로 쓴다)
1. 남 탓·환경 탓: 실패·어려움의 원인을 동료, 조직, 환경, 운으로 돌린다
2. 동료 깎아내리기: 다른 사람을 소극적·무능하게 묘사하며 자신을 부각한다
3. 회사·직무 무관심: 어느 회사에나 쓸 수 있는 지원동기, 회사·직무에 대한 이해가 드러나지 않는다
4. 과장·검증 불가: 「최고의」, 「완벽하게」, 「누구보다」처럼 확인할 수 없는 자기 과시, 역할에 비해 부풀린 성과
5. 추상적 다짐: 구체적 행동 없이 「최선을 다하겠습니다」, 「열심히 하겠습니다」로 끝난다
6. 조기 이탈 신호: 「경험을 쌓고 싶어서」, 「집이 가까워서」, 「안정적이라서」처럼 오래 다니지 않을 것 같은 동기

■ 업종 치명타 (전공·직무·채용공고 정보를 보고 해당하는 그룹 하나만 추가로 점검, type은 「업종: 이름」 형식)
- 보건의료(물리치료·간호·임상병리·보건 등): 「업종: 경유지 태도」(다른 병원으로 가기 전 거쳐 가는 곳처럼 읽힘), 「업종: 환자보다 내 편의」
- 항공·서비스(객실승무원·호텔·서비스 등): 「업종: 원칙 없는 친절」(안전·규정보다 고객 기분을 우선), 「업종: 공감만 있고 해결 없음」
- 사무행정·공공기관: 「업종: 독불장군」(혼자 결정·팀 무시), 「업종: 규정 경시」
- 사회복지·상담(사회복지사·직업상담사 등): 「업종: 시혜적 태도」(도와준다·베푼다는 시선), 「업종: 비밀보장 경계 모호」
- 제조·기술·방위산업: 「업종: 안전절차 경시」(빨리 끝내려고 절차를 생략), 「업종: 보안 의식 부족」
- 그 외이거나 전공 정보가 없으면: 공통 6가지만 점검

■ 판정 원칙
- 답변 원문에 실제로 있는 표현만 짚는다. 없는 신호를 억지로 만들지 않는다. 걸리는 것이 없으면 빈 배열 []로 둔다.
- 가장 치명적인 것부터 최대 3개.
- quote: 학생 답변에서 그대로 인용 (40자 이내).
- why: 「면접관은 ~로 읽을 수 있어요」처럼 면접관 시점 한 문장. 학생이 위축되지 않게 부드러운 존댓말로.
- fix: 학생 원문의 사실을 살린 대체 문장 한 줄. 없는 경험·수치는 만들지 않는다.
- 이 항목은 기존 JSON 응답에 「추가」되는 필드다. 다른 필드는 원래 지시대로 모두 채운다.

red_flags 형식: [{"type": "유형 이름", "quote": "학생 답변 인용", "why": "면접관 시점 한 문장", "fix": "대체 문장 한 줄"}]`;

// ───────────────────────────────────────────
// ★ 예시 답변 형광펜 (2026-10-02 추가 · 자소서 앱과 세트 · 강사 프리셋보다 우선)
//   rewritten을 빈칸 없이 끝까지 채우고, 학생 답변에 없는 부분만 {{ }}로 표시 → 결과 화면에서 형광펜·보기 3개
// ───────────────────────────────────────────
const EXAMPLE_RULES = `

[예시 채우기 — rewritten은 빈칸 없는 완성 답변 (가장 중요, 위 지침보다 우선)]
- rewritten에는 [ ] 대괄호 빈칸을 쓰지 않는다. 위 지침에서 대괄호 빈칸으로 남기라고 한 자리는 모두 이 규칙으로 바꿔 적용한다.
- 학생 답변에 없는 경험·장면·숫자·고유명사·인용 한마디가 필요한 자리는, 학생의 전공·지원 직무·신분(고등학생/대학생/경력자)에 맞는 흔하고 그럴듯한 예시로 문장을 끝까지 채우고 그 부분만 {{ }}로 감싼다. 예) 저는 {{고등학교 방송부에서 3년간 아침 방송을 맡으며}} 약속한 시간을 지키는 습관을 들였습니다.
- 학생 답변에서 온 사실은 {{ }}로 감싸지 않고, AI가 만든 사실은 반드시 {{ }} 안에만 둔다. 원문에 없는 「 」 인용 한마디는 따옴표 안쪽 전체를, 원문에 없는 인물·학년·기간·숫자도 {{ }} 안에 둔다. {{ }} 안은 구절 단위로 짧게(40자 이내) 쓰고 앞뒤 문장과 자연스럽게 잇는다.
- 다 쓴 뒤 {{ }} 밖의 문장을 한 번 더 읽고, 학생 답변에 근거 없는 구체적인 장면·행동·결과(예: 치료사가 설명해 주었다, 다시 뛸 수 있게 되었다)가 있으면 그 구절도 {{ }}로 감싼다.
- 예시 자리는 최대 6개. 학생 답변 재료가 충분하면 0개여도 된다. {{ }} 안에 또 괄호를 넣지 않는다.
- 지원 회사의 제도명·사업명·수치는 실제 이름처럼 단정하지 말고 일반 표현의 {{ }} 예시로 쓴다(예: {{신입 직무교육 과정}}).
- exampleSlots 필드: rewritten에 {{ }}가 나온 순서대로 하나씩 [{"example": "{{ }} 안 글과 똑같이", "hint": "이 자리에 학생이 넣을 것 15자 이내", "options": ["같은 자리에 그대로 끼워도 자연스러운 다른 흔한 경험 표현", "2", "3"]}]. {{ }}가 없으면 빈 배열.
- 분량: 질문에 글자수 제한(예: 500자 이내)이 있으면 {{ }} 기호를 뺀 글자 수로 제한의 80~90%를 채운다. 제한이 없으면 원래 지침의 말하기 분량을 따른다.
- 학생 답변이 매우 짧거나(50자 미만, 또는 글자수 제한의 절반 미만) 비어 있으면, improve 첫 문장에 지금 답변 길이를 알려 주고 「문장이 어려우면 키워드만이라도 말해 보세요」라고 안내한 뒤, 이 질문에 넣으면 좋은 키워드 3~5개(장소·활동 이름, 맡은 역할, 숫자로 된 결과, 배운 점, 직무 연결 단어)를 짧게 예시로 든다.
- 예시 자리가 있으면 improve에 「형광펜으로 표시된 예시 자리를 내 실제 경험으로 바꿔야 면접에서 흔들리지 않는다」는 점을 한 번 짚는다.`;

// ───────────────────────────────────────────
// ★ 2026 채용 트렌드 (2026-10-05 본부 인계 · 모든 요청에 자동 적용)
//   피드백 기준: 일관성·논리·진정성 + "외운 답변" 신호 + 서론-본론-결론 구조(AI면접 대비)
// ───────────────────────────────────────────
function trendRules({ answerSec, targetSec, resumeSentences, resumeOverlap }) {
  const sents = (Array.isArray(resumeSentences) ? resumeSentences : []).map((x) => String(x || '').slice(0, 160)).filter(Boolean).slice(0, 3);
  const sec = parseInt(answerSec, 10) || 0;
  const tgt = parseInt(targetSec, 10) || 0;
  return `

[2026 면접관 기준 — criteria 필드, 반드시 채움]
요즘 면접관은 화려한 말솜씨보다 일관성·논리·진정성을 본다. 답변을 이 세 기준으로 판정한다.
- consistency(일관성): 답변 안에서 앞뒤 말이 맞는지, 주장과 근거 경험이 서로 이어지는지${sents.length ? ', 아래 [자소서 핵심 문장]과 사실이 어긋나지 않는지' : ''}
- logic(논리): 결론→근거→사례 순서가 보이는지, 질문에 바로 답했는지
- sincerity(진정성): 본인이 실제로 겪은 장면·행동·느낀 점이 있는지, 누구나 할 수 있는 모범 답안 문장으로만 채워졌는지
- 각 기준: {"ok": true/false, "note": "학생 답변의 단어를 넣은 한 문장. ok면 잘된 점, 아니면 어떻게 고칠지"}
형식: "criteria": {"consistency": {"ok": true, "note": ""}, "logic": {"ok": true, "note": ""}, "sincerity": {"ok": true, "note": ""}}

[외운 답변 신호 — memorized 필드]
- 면접관은 외워 온 답변을 금방 알아챈다. 지나치게 매끄럽고 문어체이며(「~함으로써」, 「~하고자 합니다」 연속), 구체적인 장면 없이 모범 답안 문장만 이어지면 외운 답변 신호로 본다.${sents.length ? `
- 학생이 쓴 [자소서 핵심 문장]과 거의 같은 문장을 그대로 말했으면 외운 답변 신호다.${resumeOverlap ? ' (화면에서 자소서 문장과 많이 겹친다고 확인됨)' : ''}
[자소서 핵심 문장]
${sents.map((x) => '- ' + x).join('\n')}` : ''}
- 형식: "memorized": {"flag": true/false, "reason": "flag가 true일 때만, 어떤 점이 외운 것처럼 들리는지와 말하듯 바꾸는 방법 한 문장. false면 빈 문자열"}
- 의심만으로 단정하지 않는다. 학생이 위축되지 않게 「~처럼 들릴 수 있어요」로 부드럽게 쓴다.

[말하기 구조 — speech 필드 (AI면접·실전 대비)]
- 서론(질문에 대한 결론 한 문장) → 본론(근거가 되는 경험·행동) → 결론(직무 연결 또는 마무리 한 문장)이 있는지 본다.
- 형식: "speech": {"intro": true/false, "body": true/false, "conclusion": true/false, "note": "빠진 부분을 어디에 무엇으로 채울지 한 문장"}${sec ? `
- 학생은 이 답변을 약 ${sec}초 동안 했다${tgt ? `(목표 ${tgt}초)` : ''}. 목표보다 많이 길거나 짧으면 note 끝에 한마디 덧붙인다. 이 시간은 화면 타이머로 잰 실제 값이므로 글자 수로 시간을 다시 추정하지 않는다.` : `
- 답변 시간 정보가 없으면 시간(초)은 언급하지 않는다.`}`;
}

// ───────────────────────────────────────────
// 3. 서버 함수 본체
// ───────────────────────────────────────────

// AI 오류를 쉬운 말로 바꿔 줌 (2026-10-05) — 원인을 화면에서 바로 알 수 있게 (비밀값은 보내지 않음)
function aiErrorText(status, data) {
  const t = (data && data.error && (data.error.type || '')) || '';
  const m = String((data && data.error && data.error.message) || '');
  if (/credit balance|billing|purchase credits/i.test(m)) return `AI 사용 크레딧이 부족해요. 원장님이 Anthropic 콘솔(Plans & Billing)에서 충전해 주세요. (${status})`;
  if (status === 401 || t === 'authentication_error') return `AI 열쇠(ANTHROPIC_API_KEY)가 맞지 않아요. Vercel 환경변수를 확인해 주세요. (${status})`;
  if (status === 429 || t === 'rate_limit_error') return `AI 사용량 한도에 잠시 걸렸어요. 1분 뒤 다시 눌러 주세요. (${status})`;
  if (status === 529 || t === 'overloaded_error' || status >= 500) return `AI 서버가 잠시 붐벼요. 잠시 뒤 다시 눌러 주세요. (${status})`;
  if (t === 'not_found_error' || /model/i.test(m)) return `AI 모델 설정에 문제가 있어요: ${m.slice(0, 120)} (${status})`;
  return `AI 호출 중 오류가 발생했습니다. (${status} ${t} ${m.slice(0, 120)})`;
}

import { fitLength } from './_fitlen.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }

  const { question, answer, systemPrompt, hiringType, answerSec, targetSec, resumeSentences, resumeOverlap } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: '질문(문항) 내용이 없습니다.' });
  }

  // 이번 요청의 다양화 재료 (매번 무작위)
  const variety = `

[오늘의 예시 영역] ${pick(DOMAINS)}
[오늘의 코칭 렌즈] ${pick(LENSES)}
[오늘의 도입 방식] ${pick(OPENERS)}`;

  const majorRules = (systemPrompt || '').trim();

  // 면접 방식별 고유명사 규칙 (2026-09-26 추가)
  const hiringRules = hiringType === 'blind'
    ? `

[면접 방식: 블라인드 면접 — 반드시 반영]
- 학교명, 출신 지역이 드러나는 지명·지점명, 가족 관계·부모 직업처럼 블라인드 면접에서 말하면 안 되는 정보가 답변에 있으면 red_flags에 type을 「블라인드 위반」으로 넣고, fix에 그 이름을 뺀 일반 표현(예: 재학 중인 학과, 상급종합병원 임상실습)을 제시한다.
- 과목명·프로젝트명·활동명·자격증명처럼 학교가 드러나지 않는 고유명사는 그대로 살린다.
- rewritten에서도 금지된 이름은 일반 표현으로 바꾼다.`
    : `

[면접 방식: 일반 면접 — 고유명사로 신뢰도 높이기]
- 과목명·프로젝트명·기관명·매장명·부서명·회사의 실제 사업명처럼 답변에 있는 고유명사는 rewritten에서 반드시 살린다.
- 경험을 묻는 질문인데 고유명사가 하나도 없으면 improve에 어느 부분에 어떤 이름(예: 과목명, 기관명)을 넣으면 신뢰도가 올라가는지 한 줄로 안내하고, rewritten에는 {{ }} 예시 이름(일반적인 활동명)으로 채운다.
- 답변에 없는 고유명사를 지어내지 않는다.`;
  // 프롬프트 캐싱 (2026-10-05): 모든 학생에게 똑같은 긴 지침(고정 부분)을 앞에 두고 캐시 표시 →
  // 5분 안에 다시 쓰이면 그 부분은 원래 가격의 10%만 냄. 강사 기준·답변 시간·오늘의 재료처럼 바뀌는 부분은 뒤에.
  const staticSystem =
    COMMON_RULES +
    RED_FLAG_RULES +
    hiringRules +
    EXAMPLE_RULES +
    TONE_RULES +
    DIVERSITY_RULES +
    DIRECTION_STEPS_RULE +
    JSON_SAFETY_RULE;
  // 강사 평가 기준은 같은 수업·같은 유형이면 학생마다 똑같아서 두 번째 캐시 칸으로 둠
  const teacherBlock = majorRules ? `[강사 평가 기준 · 응답 형식 — 아래 JSON 필드를 모두 채우고, 위 규칙의 추가 필드(red_flags, exampleSlots, direction_steps)와 뒤의 criteria·memorized·speech도 함께 넣는다]\n${majorRules}` : '';
  const dynamicSystem =
    trendRules({ answerSec, targetSec, resumeSentences, resumeOverlap }) +
    variety;
  const systemBlocks = [
    { type: 'text', text: staticSystem, cache_control: { type: 'ephemeral' } },
    ...(teacherBlock ? [{ type: 'text', text: teacherBlock, cache_control: { type: 'ephemeral' } }] : []),
    { type: 'text', text: dynamicSystem }
  ];

  try {
    let feedback = null;
    for (let attempt = 1; attempt <= 2 && !feedback; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY, // 서버 환경변수 (프론트에 노출 안 됨)
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 5200, // 결격 신호·예시 보기 추가로 여유 있게 (실제 쓴 만큼만 비용 발생)
        system: systemBlocks,
        messages: [
          { role: 'user', content: `[질문]\n${question}\n\n[답변]\n${answer || ''}` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: aiErrorText(response.status, data) });
    }

    if (data.usage) console.log('면접 피드백 토큰', JSON.stringify(data.usage)); // cache_read_input_tokens로 캐시 효과 확인
    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    feedback = parseAIJson(raw);
    if (feedback && data.usage) feedback._usage = { in: data.usage.input_tokens, cached: data.usage.cache_read_input_tokens || 0, cacheWrite: data.usage.cache_creation_input_tokens || 0, out: data.usage.output_tokens };
    if (!feedback) {
      console.error(`JSON 변환 실패 (${attempt}번째 시도, 중단 이유: ${data.stop_reason}):`, raw.slice(0, 800));
    }
    } // 재시도 끝

    if (!feedback) {
      return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.' });
    }

    if (!Array.isArray(feedback.red_flags)) feedback.red_flags = [];
    feedback.exampleSlots = (Array.isArray(feedback.exampleSlots) ? feedback.exampleSlots : [])
      .filter((s) => s && s.example)
      .map((s) => ({ example: String(s.example), hint: String(s.hint || ''), options: (Array.isArray(s.options) ? s.options : []).map(String).filter(Boolean).slice(0, 3) }))
      .slice(0, 8);
    // 2026 트렌드 필드 정리 (2026-10-05)
    const crit = (feedback.criteria && typeof feedback.criteria === 'object') ? feedback.criteria : null;
    feedback.criteria = crit ? ['consistency', 'logic', 'sincerity'].reduce((o, k) => {
      const c = crit[k] || {}; o[k] = { ok: !!c.ok, note: String(c.note || '').slice(0, 200) }; return o;
    }, {}) : null;
    const mem = feedback.memorized || {};
    feedback.memorized = { flag: !!mem.flag, reason: mem.flag ? String(mem.reason || '').slice(0, 200) : '' };
    const sp = feedback.speech;
    feedback.speech = sp && typeof sp === 'object' ? { intro: !!sp.intro, body: !!sp.body, conclusion: !!sp.conclusion, note: String(sp.note || '').slice(0, 200) } : null;
    if (parseInt(answerSec, 10) > 0) feedback.answer_sec = Math.min(600, parseInt(answerSec, 10));
    if (parseInt(targetSec, 10) > 0) feedback.target_sec = Math.min(120, parseInt(targetSec, 10));
    feedback.direction_steps = Array.isArray(feedback.direction_steps)
      ? feedback.direction_steps.map(x => String(x || '').trim().slice(0, 24)).filter(Boolean).slice(0, 4)
      : [];

    // 글자 수 맞추기: 질문에 글자 수 제한(예: 500자 이내)이 있을 때만 (2026-10-05)
    const qLimit = (String(question).match(/(\d{2,5})\s*자/) || [])[1];
    if (qLimit && feedback.rewritten) {
      const fx = await fitLength(feedback.rewritten, qLimit, { kind: 'speech', slots: true });
      if (fx) {
        feedback.rewritten = fx.text;
        feedback.exampleSlots = (Array.isArray(fx.exampleSlots) ? fx.exampleSlots : []).filter((s) => s && s.example).map((s) => ({ example: String(s.example), hint: String(s.hint || ''), options: (Array.isArray(s.options) ? s.options : []).map(String).filter(Boolean).slice(0, 3) })).slice(0, 8);
      }
    }
    return res.status(200).json(feedback);
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
