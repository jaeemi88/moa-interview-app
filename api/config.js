// 질문 목록, 평가 기준, 프리셋, 검토 모드 여부 등 앱 설정을 저장/조회하는 함수입니다.
// 예전에는 브라우저(localStorage)에만 저장되어 강사 기기에서 바꾼 설정이 학생 기기에는
// 전달되지 않는 문제가 있었습니다. 이제는 서버(Redis)에 저장해서 모든 기기가 같은 설정을
// 보게 됩니다.

import Redis from 'ioredis';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

const CONFIG_KEY = 'app_config';

export default async function handler(req, res) {
  const client = getRedis();

  if (req.method === 'GET') {
    try {
      const raw = await client.get(CONFIG_KEY);
      return res.status(200).json({ config: raw ? JSON.parse(raw) : null });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '설정 조회 중 오류가 발생했습니다.' });
    }
  }

  if (req.method === 'POST') {
    const config = req.body;
    if (!config) {
      return res.status(400).json({ error: '저장할 설정이 없습니다.' });
    }
    try {
      await client.set(CONFIG_KEY, JSON.stringify(config));
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '설정 저장 중 오류가 발생했습니다.' });
    }
  }

  return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
}
