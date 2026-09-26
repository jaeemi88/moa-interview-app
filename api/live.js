// api/live.js  ← 모의면접 시뮬레이터 "🎯 면접관 체험 보드" (2026-09-26 추가)
// 수업 중 한 학생이 모의면접을 시연하면, 나머지 학생들이 면접관이 되어 휴대폰으로 "10자 한 줄 인상"을 보내고
// 강사 화면(프로젝터)에 키워드 보드로 모아 보여주는 기능
//
// - 강사(강사용 암호 필요): 보드 시작·다음 라운드·응답 보기·숨기기·AI 키워드 묶기
// - 학생(암호 없음): 보드 코드가 있어야 한 줄 보내기 가능, 라운드마다 기기당 1번, 10자 이내
// - 합격/보류/탈락 같은 평가 점수는 일부러 받지 않음 (학생 자신감 보호)
// - 모든 데이터는 하루 뒤 자동 삭제 (이름 등 개인정보는 받지 않음)

import Redis from 'ioredis';
import { isStaff } from './_staff.js';

export const config = { maxDuration: 60 };

let redis;
function getRedis() {
  if (!redis) redis = new Redis(process.env.REDIS_URL);
  return redis;
}

const TTL = 60 * 60 * 24;          // 하루
const MAX_LEN = 10;                // 한 줄 인상 최대 글자 수
const MAX_PER_ROUND = 300;         // 라운드당 최대 응답 수

const K = {
  session: (c) => `live:${c}`,
  msgs: (c, r) => `live:${c}:${r}:msgs`,
  ids: (c, r) => `live:${c}:${r}:ids`,
  hidden: (c, r) => `live:${c}:${r}:hidden`,
  summary: (c, r) => `live:${c}:${r}:summary`
};

const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
const charLen = (s) => Array.from(s).length;
// 같은 말 묶기용: 띄어쓰기·문장부호 제거
const normKey = (s) => String(s || '').replace(/[\s.,!?~·…'"()\[\]]/g, '').toLowerCase();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0/O, 1/I 제외
  let c = '';
  for (let i = 0; i < 5; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

async function touch(r, code, round) {
  await Promise.all([
    r.expire(K.session(code), TTL),
    r.expire(K.msgs(code, round), TTL),
    r.expire(K.ids(code, round), TTL),
    r.expire(K.hidden(code, round), TTL)
  ]);
}

export default async function handler(req, res) {
  const r = getRedis();
  try {
    // ---------- 학생·강사 공통: 현재 라운드 확인 (GET ?code=&peek=1) ----------
    if (req.method === 'GET' && req.query && req.query.peek) {
      const code = cleanCode(req.query.code);
      const s = code ? await r.hgetall(K.session(code)) : null;
      if (!s || !s.round) return res.status(404).json({ error: '보드를 찾을 수 없어요. 강사님께 QR을 다시 받아주세요.' });
      return res.status(200).json({ round: parseInt(s.round, 10), title: s.title || '' });
    }

    // ---------- 학생: 한 줄 보내기 ----------
    if (req.method === 'POST' && req.body && req.body.action === 'say') {
      const code = cleanCode(req.body.code);
      const round = parseInt(req.body.round, 10);
      const device = String(req.body.device || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
      const text = String(req.body.text || '').replace(/\s+/g, ' ').trim();
      const s = code ? await r.hgetall(K.session(code)) : null;
      if (!s || !s.round) return res.status(404).json({ error: '보드를 찾을 수 없어요.' });
      const cur = parseInt(s.round, 10);
      if (round !== cur) return res.status(409).json({ error: '새 라운드가 시작됐어요. 다시 적어주세요.', round: cur, title: s.title || '' });
      if (!text) return res.status(400).json({ error: '한 줄 인상을 적어주세요.' });
      if (charLen(text) > MAX_LEN) return res.status(400).json({ error: `${MAX_LEN}자 이내로 적어주세요.` });
      if (!device) return res.status(400).json({ error: '다시 시도해 주세요.' });
      const added = await r.sadd(K.ids(code, cur), device);
      if (!added) return res.status(409).json({ error: '이번 라운드에는 이미 보냈어요.', already: true });
      const count = await r.llen(K.msgs(code, cur));
      if (count >= MAX_PER_ROUND) return res.status(429).json({ error: '응답이 너무 많아요.' });
      await r.rpush(K.msgs(code, cur), text);
      await touch(r, code, cur);
      return res.status(200).json({ ok: true });
    }

    // ---------- 여기부터 강사 전용 ----------
    if (!(await isStaff(req, r))) return res.status(401).json({ error: '강사용 암호가 필요합니다.' });

    // 보드 보기 (GET ?code=)
    if (req.method === 'GET') {
      const code = cleanCode(req.query && req.query.code);
      const s = code ? await r.hgetall(K.session(code)) : null;
      if (!s || !s.round) return res.status(404).json({ error: '보드를 찾을 수 없어요.' });
      const cur = parseInt(s.round, 10);
      const [msgs, hidden, summary] = await Promise.all([
        r.lrange(K.msgs(code, cur), 0, -1),
        r.smembers(K.hidden(code, cur)),
        r.get(K.summary(code, cur))
      ]);
      const hiddenSet = new Set(hidden);
      return res.status(200).json({
        round: cur,
        title: s.title || '',
        total: msgs.length,
        msgs: msgs.filter((m) => !hiddenSet.has(normKey(m))),
        summary: summary ? JSON.parse(summary) : null
      });
    }

    const body = req.body || {};

    // 보드 시작 (새 코드)
    if (body.action === 'start') {
      let code = '';
      for (let i = 0; i < 5; i++) {
        const c = makeCode();
        if (!(await r.exists(K.session(c)))) { code = c; break; }
      }
      if (!code) return res.status(500).json({ error: '다시 시도해 주세요.' });
      const title = String(body.title || '').trim().slice(0, 40);
      await r.hset(K.session(code), { round: 1, title, createdAt: Date.now() });
      await r.expire(K.session(code), TTL);
      return res.status(200).json({ code, round: 1, title });
    }

    const code = cleanCode(body.code);
    const s = code ? await r.hgetall(K.session(code)) : null;
    if (!s || !s.round) return res.status(404).json({ error: '보드를 찾을 수 없어요.' });
    const cur = parseInt(s.round, 10);

    // 다음 라운드 (같은 QR 그대로, 학생 화면은 자동으로 새 입력칸)
    if (body.action === 'next') {
      const title = String(body.title || '').trim().slice(0, 40);
      await r.hset(K.session(code), { round: cur + 1, title });
      await r.expire(K.session(code), TTL);
      return res.status(200).json({ round: cur + 1, title });
    }

    // 라운드 제목 바꾸기
    if (body.action === 'title') {
      const title = String(body.title || '').trim().slice(0, 40);
      await r.hset(K.session(code), { title });
      return res.status(200).json({ ok: true, title });
    }

    // 부적절한 말 숨기기 (같은 말은 모두 숨김)
    if (body.action === 'hide') {
      const key = normKey(body.text);
      if (!key) return res.status(400).json({ error: '숨길 말을 찾지 못했어요.' });
      await r.sadd(K.hidden(code, cur), key);
      await r.del(K.summary(code, cur));
      await touch(r, code, cur);
      return res.status(200).json({ ok: true });
    }

    // AI로 키워드 묶기
    if (body.action === 'summarize') {
      const [msgs, hidden] = await Promise.all([
        r.lrange(K.msgs(code, cur), 0, -1),
        r.smembers(K.hidden(code, cur))
      ]);
      const hiddenSet = new Set(hidden);
      const list = msgs.filter((m) => !hiddenSet.has(normKey(m)));
      if (list.length < 3) return res.status(400).json({ error: '응답이 3개 이상 모이면 묶을 수 있어요.' });
      const summary = await summarize(list, s.title || '');
      if (!summary) return res.status(500).json({ error: 'AI 응답 형식이 올바르지 않습니다. 다시 눌러주세요.' });
      await r.set(K.summary(code, cur), JSON.stringify(summary), 'EX', TTL);
      return res.status(200).json({ summary });
    }

    return res.status(400).json({ error: '지원하지 않는 요청입니다.' });
  } catch (err) {
    console.error('live 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}

// ---------- AI 키워드 묶기 ----------
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

async function summarize(list, title) {
  const systemPrompt = `당신은 15년 경력의 면접 코치입니다. 수업에서 한 학생이 모의면접을 시연했고, 동료 학생들이 면접관이 되어 10자 이내의 한 줄 인상을 남겼습니다.
이 인상들을 비슷한 뜻끼리 묶어 키워드로 정리하세요.

[원칙]
- 비슷한 뜻의 말은 하나의 키워드로 묶는다 (예: 목소리작음, 소리가 작아요, 작게 말함 → 목소리 크기).
- type은 strength(잘한 점) 또는 improve(보완할 점) 중 하나.
- 키워드는 2~8자의 짧은 명사형. 보완 키워드도 비난이 아니라 다듬을 점으로 부드럽게 (예: 말이 빨라요 → 말 속도).
- 외모·체형·나이·성별에 관한 말, 욕설·비하는 키워드에서 제외하고 members에도 넣지 않는다.
- summary: 시연 학생에게 들려줄 한 문장 총평. 잘한 점을 먼저, 보완할 점은 성장 방향으로. 40자 안팎. 합격·탈락 같은 판정 표현은 절대 쓰지 않는다.
- members에는 원래 응답 문장을 그대로 넣는다.

[JSON 작성 주의] 문자열 안에 큰따옴표를 쓰지 않는다. 설명 없이 아래 JSON 하나만 출력한다.
{"groups": [{"keyword": "준비성", "type": "strength", "members": ["준비 잘함", "준비된 느낌"]}], "summary": "한 문장 총평"}`;

  const userMsg = `${title ? `[시연 질문] ${title}\n` : ''}[면접관 학생들의 한 줄 인상 ${list.length}개]\n${list.map((m) => '- ' + m).join('\n')}`;

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
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return null;
    }
    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const p = parseAIJson(raw);
    if (p && Array.isArray(p.groups)) {
      const groups = p.groups
        .map((g) => ({
          keyword: String((g && g.keyword) || '').trim().slice(0, 12),
          type: g && g.type === 'improve' ? 'improve' : 'strength',
          members: Array.isArray(g && g.members) ? g.members.map((m) => String(m).trim()).filter(Boolean) : []
        }))
        .filter((g) => g.keyword)
        .map((g) => ({ ...g, count: Math.max(1, g.members.length) }))
        .sort((a, b) => b.count - a.count);
      return { groups, summary: String(p.summary || '').trim() };
    }
    console.error(`키워드 묶기 JSON 변환 실패 (${attempt}번째 시도):`, raw.slice(0, 300));
  }
  return null;
}
