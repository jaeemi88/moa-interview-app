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
