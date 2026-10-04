// 학생 확인코드 (2026-10-05)
// 연락처(카톡·이메일) 없이도 학생이 스스로 결과를 찾아갈 수 있도록 6자리 짧은 코드를 만듭니다.
// 저장하는 것: 코드 → {상태, 검토/결과 id}만. 이름·연락처 같은 개인정보는 넣지 않습니다.
// 검토 대기(reviews.js)와 결과(results.js)가 같은 코드표를 함께 씁니다.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0·O·1·I 제외
const KEEP_SEC = 60 * 60 * 24 * 180; // 코드표는 180일 보관 (결과 자체의 조회 기간은 따로 적용)

export function codeKey(t, code) { return `interview_code:${t}:${code}`; }

export function normalizeCode(raw) {
  const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{6}$/.test(c) ? c : '';
}

function randomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// 겹치지 않는 새 코드를 만들어 바로 자리를 잡아 둠 (value: {s:'pending'|'done', id})
export async function newCode(client, t, value) {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const ok = await client.set(codeKey(t, code), JSON.stringify(value), 'EX', KEEP_SEC, 'NX');
    if (ok) return code;
  }
  return '';
}

export async function setCode(client, t, code, value) {
  await client.set(codeKey(t, code), JSON.stringify(value), 'EX', KEEP_SEC);
}

export async function readCode(client, t, code) {
  const raw = await client.get(codeKey(t, code));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
