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
