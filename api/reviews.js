// 강사 검토가 필요한 제출건을 저장(POST), 목록/단건 조회(GET), 승인 후 삭제(DELETE)하는 함수입니다.
// 승인된 건은 기존 /api/results 로 별도 저장되고, 여기 대기열에서는 삭제됩니다.
// 여러 강사가 함께 쓰므로, 강사별로 대기열이 섞이지 않도록 t(강사 코드)로 키를 구분합니다.
// (자소서 첨삭 앱과 동일한 방식)

import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

function generateId() {
  return 'rev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

// 검수 요청이 새로 들어오면, 강사가 설정해둔 이메일로 알림을 보냄.
// RESEND_API_KEY가 없거나 강사가 이메일을 설정하지 않았으면 조용히 건너뜀 (알림은 부가기능이라 실패해도 검수 요청 저장 자체는 막지 않음).
async function notifyByEmail(client, t, record) {
  try {
    if (!process.env.RESEND_API_KEY) { console.error('알림 건너뜀: RESEND_API_KEY 없음'); return; }
    const configRaw = await client.get(`interview_app_config:${t}`);
    const config = configRaw ? JSON.parse(configRaw) : null;
    const to = config && config.notifyEmail;
    if (!to) { console.error('알림 건너뜀: notifyEmail 미설정'); return; }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'MOA FORMULA <onboarding@resend.dev>',
        to: [to],
        subject: `[모의면접] ${record.studentName || '학생'}님의 검수 요청이 도착했어요`,
        text: `${record.studentName || '학생'}님이 모의면접 검토를 요청했어요.\n\n강사용 화면의 "검토 대기함"에서 확인해 주세요.`
      })
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend 발송 실패:', res.status, body);
    } else {
      console.log('Resend 발송 성공 (강사 알림):', to);
    }
  } catch (err) {
    console.error('알림 메일 발송 실패:', err);
  }
}

export default async function handler(req, res) {
  const client = getRedis();
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });

  const indexKey = `interview_reviews_index:${t}`;
  const itemKey = (id) => `interview_review:${t}:${id}`;

  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.items) {
      return res.status(400).json({ error: '저장할 데이터가 없습니다.' });
    }
    try {
      const id = generateId();
      await client.set(itemKey(id), JSON.stringify(record));
      const meta = JSON.stringify({
        id,
        studentName: record.studentName,
        category: record.category,
        createdAt: record.createdAt
      });
      await client.hset(indexKey, id, meta);
      notifyByEmail(client, t, record); // 응답을 기다리지 않고 백그라운드로 발송 시도
      return res.status(200).json({ id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '검토 요청 저장 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'GET') {
    const { id, list } = req.query;

    if (list === '1') {
      try {
        const hash = await client.hgetall(indexKey);
        const items = Object.values(hash)
          .map((v) => JSON.parse(v))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.status(200).json({ items });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: '목록 조회 중 오류가 발생했습니다.' });
      }
    }

    if (!id) {
      return res.status(400).json({ error: 'id가 필요합니다.' });
    }
    try {
      const value = await client.get(itemKey(id));
      if (!value) {
        return res.status(404).json({ error: '검토 항목을 찾을 수 없습니다.' });
      }
      return res.status(200).json({ record: JSON.parse(value) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id가 필요합니다.' });
    }
    try {
      await client.del(itemKey(id));
      await client.hdel(indexKey, id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
