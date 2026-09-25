// 질문 목록, 평가 기준, 프리셋, 검토 모드 여부 등 앱 설정을 저장/조회하는 함수입니다.
// 여러 강사가 함께 쓰므로, 강사별로 설정이 섞이지 않도록 t(강사 코드)로 키를 구분합니다.
// 보안 (2026-09-25): 조회는 학생 화면에도 필요해서 공개, 저장(POST)은 강사용 암호가 있어야 가능

import Redis from 'ioredis';
import { isStaff } from './_staff.js';

let redis;
function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL);
  }
  return redis;
}

function safeTeacherId(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9가-힣_-]/g, '').slice(0, 40);
}

export default async function handler(req, res) {
  const client = getRedis();
  const t = safeTeacherId(req.query.t);
  if (!t) return res.status(400).json({ error: 't(강사 코드) 파라미터가 필요합니다.' });
  const CONFIG_KEY = `interview_app_config:${t}`;

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
    try {
      if (!(await isStaff(req, client))) return res.status(401).json({ error: '강사용 암호가 필요합니다.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: '확인 중 오류가 발생했습니다.' });
    }
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
