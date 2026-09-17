// 학생별 모의면접 결과를 저장하고(POST), 링크로 불러오는(GET) 서버 함수입니다.
// 여러 강사가 함께 쓰므로, 강사별로 결과 목록이 섞이지 않도록 t(강사 코드)로 키를 구분합니다.
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
  return 'res_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

// 강사 검토 승인이 끝났을 때만(record.notify === true) 학생에게 결과 링크를 이메일로 보냄.
// 즉시모드(학생이 직접 링크를 만드는 경우)는 화면에 바로 링크가 뜨므로 중복 발송하지 않음.
// RESEND_API_KEY가 없거나 이메일을 안 남겼으면 조용히 건너뜀 (알림은 부가기능이라 실패해도 저장 자체는 막지 않음).
async function notifyStudentByEmail(t, id, record, host) {
  try {
    if (!process.env.RESEND_API_KEY) return;
    if (!record.notify) return;
    const to = record.studentEmail;
    if (!to) return;
    const link = `https://${host}/?t=${encodeURIComponent(t)}#result=${id}`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'MOA FORMULA <onboarding@resend.dev>',
        to: [to],
        subject: `[모의면접] ${record.studentName || '학생'}님의 결과가 도착했어요`,
        text: `${record.studentName || '학생'}님, 요청하신 모의면접 검토 결과가 준비됐어요.\n\n아래 링크에서 확인해 주세요.\n${link}`
      })
    });
  } catch (err) {
    console.error('학생 알림 메일 발송 실패:', err);
  }
}

export default async function handler(req, res) {
  const client = getRedis();
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });

  const indexKey = `interview_results_index:${t}`;
  const itemKey = (id) => `interview_result:${t}:${id}`;

  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.items) {
      return res.status(400).json({ error: '저장할 결과 데이터가 없습니다.' });
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
      await client.lpush(indexKey, meta);
      await client.ltrim(indexKey, 0, 499); // 최근 500건까지만 보관
      notifyStudentByEmail(t, id, record, req.headers.host); // 응답을 기다리지 않고 백그라운드로 발송 시도
      return res.status(200).json({ id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '결과 저장 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'GET') {
    const { id, list } = req.query;

    if (list === '1') {
      try {
        const raw = await client.lrange(indexKey, 0, 199);
        const items = raw.map((r) => JSON.parse(r));
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
        return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
      }
      const record = JSON.parse(value);
      return res.status(200).json({ record });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '결과 조회 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
