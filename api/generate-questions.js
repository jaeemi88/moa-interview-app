// 강사가 입력한 전공·지원직무를 바탕으로, "직무 특화 질문" 유형에 쓸 면접 질문 6개를
// AI로 생성해주는 서버 함수입니다.
// 2026-09-26 추가: mode가 'criteria'이면 질문 대신 "이 전공만의 평가 기준" 5~7줄을 만들어줍니다.
// 2026-09-26 추가: mode가 'redflag'이면 "결격 검증 질문" 6개 + 강사용 해설(걸러내는 것)을 만들어줍니다.
// (mode가 없으면 예전처럼 질문을 만듭니다.) 생성된 질문은 그 자리에서 저장되지 않고 클라이언트로
// 반환되며, 강사가 "설정 저장"을 눌러야 실제로 적용됩니다.
// 보안 (2026-09-25): 강사용 암호가 있어야 사용 가능 (AI 비용 보호)

import Redis from 'ioredis';
import { isStaff } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

function sanitizeJsonString(raw) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
      } else if (ch === '\\') {
        result += ch;
        escaped = true;
      } else if (ch === '"') {
        result += ch;
        inString = false;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    if (!(await isStaff(req, getRedis()))) return res.status(401).json({ error: '강사용 암호가 필요합니다.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '확인 중 오류가 발생했습니다.' });
  }

  const { targetField, mode } = req.body || {};
  if (!targetField || !String(targetField).trim()) {
    return res.status(400).json({ error: '전공·직무 정보가 필요합니다.' });
  }

  if (mode === 'criteria') {
    return generateCriteria(String(targetField).trim(), res);
  }
  if (mode === 'redflag') {
    return generateRedflag(String(targetField).trim(), res);
  }

  const systemPrompt = `당신은 15년 경력의 취업면접 코치입니다. 아래 전공·지원직무에 특화된 모의면접 질문 6개를 만들어주세요.

[전공·지원직무] ${targetField}

[질문 작성 원칙]
- 이 직무의 실제 업무 상황, 필요 역량, 자주 겪는 어려움을 반영한 구체적인 질문일 것
- "자기소개해주세요", "지원동기가 무엇인가요", "5년 후 모습은?" 같은 일반적인 질문은 피할 것 (다른 유형에 이미 있음)
- 6개 중 최소 1개는 실제 업무 중 발생할 수 있는 상황을 제시하고 대응을 묻는 상황형 질문일 것
- 6개 중 최소 1개는 이 직무에 필요한 역량 중 본인의 부족한 점을 묻는 질문일 것
- 존댓말로, 실제 면접관이 물어볼 법한 자연스러운 문장으로 작성

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트, 설명, 코드블록 없이 순수 JSON만 반환합니다.
{"questions": ["질문1", "질문2", "질문3", "질문4", "질문5", "질문6"]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `"${targetField}" 직무에 특화된 면접 질문 6개를 만들어주세요.` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: '질문 생성에 실패했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = JSON.parse(sanitizeJsonString(clean));
    }

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'AI가 올바른 형식의 질문을 만들지 못했습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json({ questions: parsed.questions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '질문 생성 중 오류가 발생했습니다.' });
  }
}

// ---------- 전공 평가 기준 만들기 (mode: 'criteria') ----------
async function generateCriteria(targetField, res) {
  const systemPrompt = `당신은 15년 경력의 취업면접 코치입니다. 모의면접 AI가 학생 답변을 평가할 때 참고할 "이 전공·직무만의 평가 기준"을 만들어주세요.

[전공·지원직무] ${targetField}

[중요] 아래 공통 기준은 이미 따로 적용되고 있으니 절대 다시 쓰지 마세요:
- 이미지메이킹·자신감·진정성, STAR 구조, 구체성(수치·경험), 경험의 크기보다 성찰과 성장, 완벽함보다 결격사유 없음, 면접관 시점 추론, 꼬리질문, 답변 형식(JSON)

[작성 원칙]
- 이 전공·직무 면접에서만 특히 중요하게 보는 점을 5~7개 쓸 것
- 각 줄은 "~인지 본다", "~면 높게 평가한다", "~는 감점 요인으로 짚는다"처럼 평가자가 바로 적용할 수 있는 문장으로 쓸 것
- 실제 업무 상황, 협업 대상, 안전·윤리·규정, 근무 환경 인식처럼 이 직무에서만 드러나는 요소를 담을 것
- 최소 1개는 이 직무 지원자가 자주 쓰는 막연한 표현(예: "최선을 다하겠습니다")을 짚는 감점 기준일 것
- 외모·키·체형·나이·성별에 관한 기준은 절대 넣지 말 것
- 한 줄은 60자 안팎으로 간결하게

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트, 설명, 코드블록 없이 순수 JSON만 반환합니다.
{"criteria": ["기준1", "기준2", "기준3", "기준4", "기준5"]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `"${targetField}" 전공·직무의 평가 기준을 만들어주세요.` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: '평가 기준 생성에 실패했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = JSON.parse(sanitizeJsonString(clean));
    }

    if (!Array.isArray(parsed.criteria) || parsed.criteria.length === 0) {
      return res.status(500).json({ error: 'AI가 올바른 형식의 기준을 만들지 못했습니다. 다시 시도해 주세요.' });
    }

    const lines = parsed.criteria
      .map((c) => String(c).trim().replace(/^[-•·\d.)\s]+/, ''))
      .filter(Boolean)
      .map((c) => '- ' + c);
    return res.status(200).json({ criteria: lines.join('\n') });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '평가 기준 생성 중 오류가 발생했습니다.' });
  }
}

// ---------- 결격 검증 질문 만들기 (mode: 'redflag') ----------
async function generateRedflag(targetField, res) {
  const systemPrompt = `당신은 15년 경력의 취업면접 코치입니다. 채용은 뛰어난 사람을 고르기보다 결격사유가 있는 지원자를 걸러내는 과정입니다.
아래 전공·직무의 면접관이 "이 사람은 걸러야겠다"고 판단하는 태도를 확인하기 위한 "결격 검증 질문" 6개를 만들어주세요.

[전공·지원직무] ${targetField}

[먼저 판단할 것] 이 직무의 업종이 아래 중 어디에 가까운지 판단하고, 그 업종의 치명타를 중심으로 질문을 만드세요.
- 보건의료: 경유지 태도(짧은 근속), 환자보다 내 편의
- 항공·서비스: 원칙 없는 친절(안전·규정보다 고객 기분 우선), 공감만 있고 해결 없음
- 사무행정·공공: 독불장군, 규정 경시
- 사회복지·상담: 시혜적 태도, 비밀보장 경계 모호
- 제조·기술·방위산업: 안전절차 경시, 보안 의식 부족
- 어디에도 딱 맞지 않으면 그 직무에서 가장 치명적인 태도 2가지를 스스로 정할 것

[질문 구성 — 6개]
- 3개: 위 업종 치명타를 확인하는 질문 (최소 2개는 "~하면 어떻게 하시겠어요?" 같은 상황형)
- 3개: 공통 결격 신호 중 이 직무에서 특히 중요한 것 (남 탓·환경 탓 / 동료 깎아내리기 / 회사·직무 무관심 / 과장 / 추상적 다짐 / 조기 이탈 중 선택)

[작성 원칙]
- 정답이 뻔히 보이는 유도 질문은 피하고, 평소 태도가 자연스럽게 드러나도록 물을 것
- 존댓말로, 실제 면접관이 물을 법한 자연스러운 한 문장 (50자 안팎)
- note는 그 질문이 걸러내려는 것을 20자 안팎 명사형으로 (예: "경유지 태도·짧은 근속")
- 외모·나이·성별·결혼·가족계획에 관한 질문은 절대 넣지 말 것

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트, 설명, 코드블록 없이 순수 JSON만 반환합니다.
{"items": [{"q": "질문1", "note": "걸러내는 것"}, {"q": "질문2", "note": "걸러내는 것"}]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `"${targetField}" 직무의 결격 검증 질문 6개를 만들어주세요.` }
        ]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: '결격 검증 질문 생성에 실패했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = JSON.parse(sanitizeJsonString(clean));
    }

    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .map((x) => ({
        q: String((x && x.q) || '').trim().replace(/\/\//g, '/'),
        note: String((x && x.note) || '').trim().replace(/\/\//g, '/')
      }))
      .filter((x) => x.q);

    if (!items.length) {
      return res.status(500).json({ error: 'AI가 올바른 형식의 질문을 만들지 못했습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json({ items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '결격 검증 질문 생성 중 오류가 발생했습니다.' });
  }
}
