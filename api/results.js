// 학생별 모의면접 결과를 저장하고(POST), 링크로 불러오는(GET) 서버 함수입니다.
// Vercel Redis(무료 저장소)를 사용합니다. Vercel 대시보드에서 Redis를 만들고
// "프로젝트에 연결"을 누르면 REDIS_URL이 자동으로 설정됩니다. (README 참고)

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

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.items) {
      return res.status(400).json({ error: '저장할 결과 데이터가 없습니다.' });
    }
    try {
      const id = generateId();
      await client.set(id, JSON.stringify(record));
      // 목록 화면에서 쓸 요약 정보를 별도로 인덱스에 남겨둡니다.
      const meta = JSON.stringify({
        id,
        studentName: record.studentName,
        category: record.category,
        createdAt: record.createdAt
      });
      await client.lpush('results_index', meta);
      await client.ltrim('results_index', 0, 499); // 최근 500건까지만 보관
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
        const raw = await client.lrange('results_index', 0, 199);
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
      const value = await client.get(id);
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
