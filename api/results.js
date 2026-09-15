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
