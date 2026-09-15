// 학생별 모의면접 결과를 저장하고(POST), 링크로 불러오는(GET) 서버 함수입니다.
// Vercel KV(무료 저장소)를 사용합니다. Vercel 대시보드에서 KV를 연결하면 자동으로
// 아래 kv 객체가 사용할 수 있는 상태가 됩니다. (README 참고)

import { kv } from '@vercel/kv';

function generateId() {
  return 'res_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const record = req.body;
    if (!record || !record.items) {
      return res.status(400).json({ error: '저장할 결과 데이터가 없습니다.' });
    }
    try {
      const id = generateId();
      await kv.set(id, JSON.stringify(record));
      return res.status(200).json({ id });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '결과 저장 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'id가 필요합니다.' });
    }
    try {
      const value = await kv.get(id);
      if (!value) {
        return res.status(404).json({ error: '결과를 찾을 수 없습니다.' });
      }
      const record = typeof value === 'string' ? JSON.parse(value) : value;
      return res.status(200).json({ record });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '결과 조회 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
