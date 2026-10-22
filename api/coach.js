// api/coach.js  ← 모의면접 시뮬레이터 전용 (자소서 앱의 coach.js와 이름만 같고 내용이 다름, 서로 복사하지 말 것)
// 2026-09-26 추가
// - mode 'outline': "💡 답변 뼈대 잡기" — 학생 메모 4칸으로 30초 말하기 순서 + 초안 1개
// - mode 'defend' : "❓ 꼬리질문에 바로 답해보기" — 꼬리질문 답변이 처음 답변과 맞는지 한 줄 판정
// - 학생 화면에서 버튼을 누를 때만 호출됨 (AI 비용 보호를 위해 입력 길이 제한)

export const config = { maxDuration: 120 }; // 글자 수 맞추기 재시도 여유 (2026-10-05)

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
      throw new Error(aiErrorText(response.status, data));
    }
    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const parsed = parseAIJson(raw);
    if (parsed && isValid(parsed)) return parsed;
    console.error(`JSON 변환 실패 (${attempt}번째 시도):`, raw.slice(0, 400));
  }
  return null;
}

const JSON_RULE = `[JSON 작성 주의] 문자열 안에 큰따옴표를 쓰지 않는다(필요하면 작은따옴표나 「 」). 설명 문장이나 코드블록 없이 아래 JSON 하나만 출력한다.`;

const TONE_RULES = `
[담백하게 — 신파 금지 (2026-10-04)]
- 요즘 면접관은 고생담·감동 코드에 점수를 주지 않는다. 감정을 꾸미지 말고 행동과 결과로 말하게 한다.
- 상황 묘사는 첫 한 문장까지만. 바로 무엇을 했고 어떤 결과가 났는지로 넘어간다.
- 쓰지 않는 표현: 가난·고생·눈물·희생을 강조하는 서사, "처음으로 실감했습니다", "가슴이 뭉클" 같은 감정 과장, 비장한 자기 주문.
- 절약·인내·성실 같은 덕목은 '참고 아끼는 사람'이 아니라 '계획하고 관리하고 실행하는 사람'으로 연결한다.
- 마무리는 다짐만으로 끝내지 않고, 같은 태도가 드러난 다른 사례 한 줄이나 직무 연결로 맺는다.`;


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
import Redis from 'ioredis';
import { createHash } from 'crypto';
let redis;
function getRedis() { if (!redis) redis = new Redis(process.env.REDIS_URL); return redis; }

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 가능합니다.' });
  }
  const body = req.body || {};
  try {
    if (body.mode === 'outline') return await outline(body, res);
    if (body.mode === 'defend') return await defend(body, res);
    if (body.mode === 'finish') return await finish(body, res);
    // 🎁 무료 모의면접 1문항 체험 (2026-10-22): /free 페이지 — 1인 하루 1회, 전체 하루 30회, 답변 저장 안 함
    if (body.mode === 'freeInterview') return await freeInterview(req, body, res);
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
${TONE_RULES}
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

// ---------- 내 답변으로 완성하기 (mode: 'finish', 2026-10-02 · 자소서 앱과 세트) ----------
// 학생이 결과 화면에서 예시 답변의 형광펜 자리를 자기 경험으로 바꾼 뒤, 말하기 좋게 자연스럽게 이어 줌
async function finish(body, res) {
  const text = clip(body.text, 4000);
  const charLimit = parseInt(body.charLimit, 10) || null;
  if (!text || !/⟪[^⟫]+⟫/.test(text)) {
    return res.status(400).json({ error: '내 경험으로 바꾼 곳이 한 곳 이상 있어야 해요.' });
  }
  const systemPrompt = `당신은 면접 답변 코치입니다. 학생이 예시 답변의 예시 자리 일부를 자기 실제 경험으로 바꿨습니다.
- ⟪ ⟫ 안은 학생이 직접 넣은 자기 경험입니다. 그 내용(단어·숫자·이름)을 빠짐없이 살리고 ⟪ ⟫ 기호만 지웁니다. 단어만 적었으면 앞뒤와 이어지는 자연스러운 구절로 풀어 씁니다.
- {{ }} 안은 아직 바꾸지 않은 예시입니다. 내용과 {{ }} 기호를 그대로 둡니다(문장 연결을 위해 조사만 바꿀 수 있음).
- 학생이 넣은 내용과 예시가 어긋나 어색해지면 그 주변 문장만 학생 내용에 맞게 고칩니다. 새로운 사실·숫자·이름은 만들지 않습니다.
- 면접에서 말로 하기 좋은 1인칭 답변 본문만 씁니다.${charLimit ? ` 기호를 뺀 분량은 공백 포함 ${charLimit}자의 80~90%(${Math.round(charLimit * 0.8)}~${Math.round(charLimit * 0.9)}자)로 맞춥니다.` : ''}
${JSON_RULE}
{"text": "완성된 답변 본문"}`;
  const parsed = await askAI(systemPrompt, text, Math.min(8000, 1500 + Math.round((charLimit || 600) * 1.6)), (p) => p && p.text);
  if (!parsed) return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
  let out = String(parsed.text).replace(/[⟪⟫]/g, '').trim();
  if (charLimit) { const fx = await fitLength(out, charLimit, { kind: 'speech' }); if (fx) out = fx.text; } // 글자 수 맞추기
  return res.status(200).json({ text: out });
}


// ---------- 무료 모의면접 1문항 체험 (mode: 'freeInterview', 2026-10-22) ----------
// 공개 페이지(/free)용. 인스타 댓글 '면접체험' DM으로 들어옴. 자소서 앱 /free와 같은 규칙:
// 같은 사람(IP) 하루 1회, 전체 하루 30회. 답변은 저장하지 않음 (횟수 숫자만 이틀 뒤 자동 삭제)
const IV_FREE_TOTAL = 30;
const IV_FREE_PER_IP = 1;
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '');
async function ivFreeStat(r, ev) { try { if (r) await r.hincrby('moa_free_stats', ev + ':' + kstDay(), 1); } catch (e) {} }

async function freeInterview(req, body, res) {
  const question = clip(body.question, 200);
  const answer = clip(body.answer, 1200);
  const job = clip(body.job, 40);
  if (!question) return res.status(400).json({ error: '면접 질문을 골라 주세요.' });
  if (answer.length < 20) return res.status(400).json({ error: '답변을 20자 이상 적어 주세요.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = createHash('sha256').update('moa-iv-free:' + ip).digest('hex').slice(0, 24);
  const day = kstDay();
  const ipKey = `iv_free:ip:${day}:${ipHash}`;
  const dayKey = `iv_free:day:${day}`;
  let r = null;
  try {
    r = getRedis();
    const ipCount = await r.incr(ipKey); await r.expire(ipKey, 172800);
    if (ipCount > IV_FREE_PER_IP) return res.status(429).json({ error: '무료 체험은 하루 1번이에요. 내일 다시 이용해 주세요.', limit: 'ip' });
    const dayCount = await r.incr(dayKey); await r.expire(dayKey, 172800);
    if (dayCount > IV_FREE_TOTAL) {
      await r.decr(ipKey);
      await ivFreeStat(r, 'iv_free_full');
      return res.status(429).json({ error: `오늘 준비한 무료 체험 ${IV_FREE_TOTAL}회가 모두 마감됐어요. 내일 다시 찾아 주세요.`, limit: 'day' });
    }
  } catch (e) {
    console.error('무료 체험 횟수 확인 실패:', e);
    return res.status(503).json({ error: '잠시 접속이 많아요. 조금 뒤 다시 눌러 주세요.' });
  }
  const refund = async () => { try { await r.decr(ipKey); await r.decr(dayKey); } catch (e) {} };

  const systemPrompt = `당신은 15년 경력의 면접관이자 면접 코치입니다. 처음 만난 지원자가 면접 질문 1개에 말하듯 답한 내용을 보내 무료 체험을 받습니다.
면접관 자리에서 들은 그대로 짧고 정확하게, 바로 고칠 수 있는 것만 알려 주세요. 지원자 답변에 없는 경험·숫자·이름은 지어내지 않습니다.
${TONE_RULES}

[점검 4가지 — 각각 status는 good(잘함) / fix(보완) 중 하나, note는 1문장]
1. answerFirst: 첫 문장에서 질문에 바로 답하는지 (두괄식)
2. concrete: 내가 한 행동·숫자·장면이 구체적인지
3. jobLink: 지원 분야(없으면 일반 직무)와 연결되는지
4. natural: 외운 듯한 문어체, '열정·소통 능력·최선' 같은 상투어 없이 말하듯 자연스러운지

[작성 규칙]
- 모든 문장은 지원자에게 말하듯 부드러운 존댓말. 큰따옴표 대신 작은따옴표를 쓴다. 지원자를 탓하거나 깎아내리지 않는다.
- first: 면접관이 첫 10초에 속으로 한 생각 한 문장 (예: '경험은 좋은데, 결론이 늦게 나와서 집중이 흐려졌어요')
- summary: 지금 답변의 상태 한 문장 (잘한 점 1 + 핵심 아쉬움 1)
- followUp: 이 답변을 들은 면접관이 이어서 물을 꼬리질문 1개 (답변의 실제 내용에서 나오는 질문)
- oneFix: 지금 하나만 고친다면 무엇을 어떻게 — 2문장 이내
- opener: 이렇게 첫 문장을 시작해 보라는 예시 한 문장. 지원자 답변에 없는 사실은 [빈칸]으로 둔다.

${JSON_RULE}
{"first":"","summary":"","checks":{"answerFirst":{"status":"good|fix","note":""},"concrete":{"status":"good|fix","note":""},"jobLink":{"status":"good|fix","note":""},"natural":{"status":"good|fix","note":""}},"followUp":"","oneFix":"","opener":""}`;

  const userMsg = `[지원 분야] ${job || '미입력'}\n[면접 질문] ${question}\n\n[지원자 답변]\n${answer}`;
  try {
    const parsed = await askAI(systemPrompt, userMsg, 1200, (p) => p && p.checks);
    if (!parsed) { await refund(); return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러 주세요.' }); }
    const keys = ['answerFirst', 'concrete', 'jobLink', 'natural'];
    const checks = {};
    keys.forEach((k) => {
      const c = (parsed.checks && parsed.checks[k]) || {};
      checks[k] = { status: c.status === 'good' ? 'good' : 'fix', note: clip(c.note, 200) };
    });
    await ivFreeStat(r, 'iv_free_use');
    return res.status(200).json({ first: clip(parsed.first, 200), summary: clip(parsed.summary, 300), checks, followUp: clip(parsed.followUp, 200), oneFix: clip(parsed.oneFix, 400), opener: clip(parsed.opener, 300) });
  } catch (err) {
    console.error('무료 체험 오류:', err);
    await refund();
    return res.status(500).json({ error: err.message || '서버 오류가 발생했습니다.' });
  }
}
