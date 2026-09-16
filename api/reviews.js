// 강사 검토가 필요한 제출건을 저장(POST), 목록/단건 조회(GET), 승인 후 삭제(DELETE)하는 함수입니다.
// 승인된 건은 기존 /api/results 로 별도 저장되고, 여기 대기열에서는 삭제됩니다.

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

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.items) {
      return res.status(400).json({ error: '저장할 데이터가 없습니다.' });
    }
    try {
      const id = generateId();
      await client.set('review:' + id, JSON.stringify(record));
      const meta = JSON.stringify({
        id,
        studentName: record.studentName,
        category: record.category,
        createdAt: record.createdAt
      });
      await client.hset('reviews_index', id, meta);
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
        const hash = await client.hgetall('reviews_index');
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
      const value = await client.get('review:' + id);
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
      await client.del('review:' + id);
      await client.hdel('reviews_index', id);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '삭제 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
