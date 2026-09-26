// api/coach.js  ← 모의면접 시뮬레이터 전용 (자소서 앱의 coach.js와 이름만 같고 내용이 다름, 서로 복사하지 말 것)
// 2026-09-26 추가
// - mode 'outline': "💡 답변 뼈대 잡기" — 학생 메모 4칸으로 30초 말하기 순서 + 초안 1개
// - mode 'defend' : "❓ 꼬리질문에 바로 답해보기" — 꼬리질문 답변이 처음 답변과 맞는지 한 줄 판정
// - 학생 화면에서 버튼을 누를 때만 호출됨 (AI 비용 보호를 위해 입력 길이 제한)

export const config = { maxDuration: 60 };

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

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// AI 호출 + JSON 읽기 (형식이 틀리면 한 번 더 시도)
async function askAI(systemPrompt, userMsg, maxTokens, isValid) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      throw new Error('AI 호출 중 오류가 발생했습니다.');
    }
    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const parsed = parseAIJson(raw);
    if (parsed && isValid(parsed)) return parsed;
    console.error(`JSON 변환 실패 (${attempt}번째 시도):`, raw.slice(0, 400));
  }
  return null;
}

const JSON_RULE = `[JSON 작성 주의] 문자열 안에 큰따옴표를 쓰지 않는다(필요하면 작은따옴표나 「 」). 설명 문장이나 코드블록 없이 아래 JSON 하나만 출력한다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }
  const body = req.body || {};
  try {
    if (body.mode === 'outline') return await outline(body, res);
    if (body.mode === 'defend') return await defend(body, res);
    return res.status(400).json({ error: '지원하지 않는 요청입니다.' });
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}

// ---------- 💡 답변 뼈대 잡기 ----------
async function outline(body, res) {
  const category = clip(body.category, 30) || '미지정';
  const question = clip(body.question, 300);
  const jobField = clip(body.jobField, 40);
  const blind = body.hiringType === 'blind';
  const memo = (Array.isArray(body.memo) ? body.memo : [])
    .slice(0, 6)
    .map((m) => ({ label: clip(m && m.label, 20), value: clip(m && m.value, 150) }))
    .filter((m) => m.value);
  if (memo.length < 2) return res.status(400).json({ error: '메모를 2칸 이상 채워주세요.' });

  const hiringRule = blind
    ? `[블라인드 면접] 학교명, 출신 지역이 드러나는 지명·지점명, 가족 관계·부모 직업은 쓰지 않는다. 메모에 있으면 일반 표현으로 바꾼다(예: ○○대학교 물리치료학과 → 재학 중인 학과). 과목명·활동명·자격증명은 그대로 쓴다.`
    : `[일반 면접] 메모에 있는 고유명사(과목명·프로젝트명·기관명·매장명·부서명·회사 사업명)는 그대로 살려 넣는다. 고유명사는 신뢰도를 높인다. 메모에 없으면 [여기에 프로젝트 이름]처럼 빈칸으로 남긴다.`;

  const systemPrompt = `당신은 15년 경력의 면접 코치입니다. 학생이 모의면접 질문에 답하기 전에 적은 짧은 메모로, 실제 면접에서 말할 순서를 잡아 줍니다.

[절대 원칙]
- 학생 메모에 없는 경험·수치·사람·감정·고유명사를 지어내지 않는다. 필요한 정보가 없으면 [대괄호 빈칸]으로 남긴다.
- 학생이 쓴 단어를 최대한 그대로 쓴다. "최고의", "누구보다", "최선을 다하겠습니다" 같은 표현은 쓰지 않는다.
- 남 탓·동료 비하로 들릴 표현은 상황 설명으로 순화한다.
- 글이 아니라 말이다. 짧은 문장, 입으로 말하기 쉬운 담백한 존댓말(~습니다). 결론을 먼저 말한다.

${hiringRule}

[질문 유형] ${category}
[면접 질문] ${question || '(질문 없음)'}${jobField ? `\n[지원 전공·직무] ${jobField}` : ''}

[출력]
- outline: 말하기 순서 4줄. 각 줄은 키워드 중심 20자 안팎 (예: 결론 — 역할표부터 만드는 사람)
- script: 30초 분량(공백 포함 180~250자) 답변 초안 1개

${JSON_RULE}
{"outline": ["1줄", "2줄", "3줄", "4줄"], "script": "30초 답변 초안"}`;

  const parsed = await askAI(systemPrompt, `[학생 메모]\n${memo.map((m) => `${m.label} ${m.value}`).join('\n')}`, 1200,
    (p) => Array.isArray(p.outline) && p.outline.length);
  if (!parsed) return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
  return res.status(200).json({
    outline: parsed.outline.map((t) => String(t).trim()).filter(Boolean).slice(0, 5),
    script: String(parsed.script || '').trim()
  });
}

// ---------- ❓ 꼬리질문에 바로 답해보기 ----------
async function defend(body, res) {
  const question = clip(body.question, 300);
  const answer = clip(body.answer, 2000);
  const followUp = clip(body.followUp, 300);
  const reply = clip(body.reply, 800);
  if (!question || !followUp || reply.length < 10) {
    return res.status(400).json({ error: '답변을 10자 이상 적어주세요.' });
  }

  const systemPrompt = `당신은 15년 경력의 면접관 겸 면접 코치입니다. 학생이 면접 질문에 처음 답한 뒤, 면접관이 꼬리질문을 했고 학생이 다시 답했습니다.
꼬리질문 답변을 면접관 시점에서 판정하세요. 면접관은 처음 답변과 꼬리질문 답변이 어긋나거나, 갑자기 부풀리거나, 구체적으로 설명하지 못하면 신뢰를 잃습니다.

[판정 기준 — verdict는 셋 중 하나]
- ok: 처음 답변과 일치하고, 본인이 한 일이 구체적으로 설명됨
- caution: 처음 답변에 없던 새 사실·숫자가 갑자기 나오거나, 처음보다 부풀려짐 또는 앞뒤가 다름
- weak: 꼬리질문에 답하지 못했거나 추상적이어서 본인 경험인지 확인이 안 됨

[comment 작성]
- 학생에게 직접 말하듯 부드러운 존댓말 2문장 이내. 첫 문장은 판정 이유, 둘째 문장은 바로 해볼 한 가지.
- 학생 답변의 단어를 1개 이상 인용한다. 없는 사실을 지어내지 않는다.

${JSON_RULE}
{"verdict": "ok|caution|weak", "comment": "판정 설명"}`;

  const userMsg = `[면접 질문]\n${question}\n\n[학생의 처음 답변]\n${answer || '(없음)'}\n\n[면접관 꼬리질문]\n${followUp}\n\n[학생의 꼬리질문 답변]\n${reply}`;
  const parsed = await askAI(systemPrompt, userMsg, 600, (p) => p.comment);
  if (!parsed) return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
  const verdict = ['ok', 'caution', 'weak'].includes(parsed.verdict) ? parsed.verdict : 'caution';
  return res.status(200).json({ verdict, comment: String(parsed.comment).trim() });
}
