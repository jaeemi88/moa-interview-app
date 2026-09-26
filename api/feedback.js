// api/feedback.js
// AI 피드백 생성 서버 함수 (공통 원칙 + 피드백 다양화 + 결격 신호 체크 버전, 2026-09-26)
// - 모든 요청에 [공통 원칙]과 [피드백 다양화 원칙]을 자동으로 붙임
// - ⚙ 설정의 프리셋에는 "전공별 기준"만 적으면 됨
// - 제출할 때마다 예시 영역 / 코칭 렌즈 / 도입 방식을 무작위로 골라 전달

// ───────────────────────────────────────────
// 0. 공통 원칙 (모든 전공·모든 요청에 자동 적용)
// ───────────────────────────────────────────
// Vercel 함수 최대 실행 시간 60초 (AI 답변이 길어져도 중간에 끊기지 않도록)
export const config = { maxDuration: 60 };

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
// 3. 서버 함수 본체
// ───────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }

  const { question, answer, systemPrompt } = req.body || {};

  if (!question) {
    return res.status(400).json({ error: '질문(문항) 내용이 없습니다.' });
  }

  // 이번 요청의 다양화 재료 (매번 무작위)
  const variety = `

[오늘의 예시 영역] ${pick(DOMAINS)}
[오늘의 코칭 렌즈] ${pick(LENSES)}
[오늘의 도입 방식] ${pick(OPENERS)}`;

  const majorRules = (systemPrompt || '').trim();
  const fullSystem =
    COMMON_RULES +
    (majorRules ? `\n\n[전공별 기준]\n${majorRules}` : '') +
    RED_FLAG_RULES +
    DIVERSITY_RULES +
    variety +
    JSON_SAFETY_RULE;

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
        max_tokens: 3000, // 결격 신호 추가로 여유 있게 (실제 쓴 만큼만 비용 발생)
        system: fullSystem,
        messages: [
          { role: 'user', content: `[질문]\n${question}\n\n[답변]\n${answer || ''}` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: 'AI 호출 중 오류가 발생했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    feedback = parseAIJson(raw);
    if (!feedback) {
      console.error(`JSON 변환 실패 (${attempt}번째 시도, 중단 이유: ${data.stop_reason}):`, raw.slice(0, 800));
    }
    } // 재시도 끝

    if (!feedback) {
      return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.' });
    }

    if (!Array.isArray(feedback.red_flags)) feedback.red_flags = [];

    return res.status(200).json(feedback);
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
