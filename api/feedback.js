// 학생 답변을 받아 Anthropic API로 AI 피드백을 생성하는 서버 함수입니다.
// API 키는 여기(서버)에서만 사용되고, 학생/강사 화면(브라우저)에는 절대 노출되지 않습니다.

// AI가 만든 JSON 응답 안에 줄바꿈이 이스케이프 없이 그대로 들어가는 경우가 있어
// (문자열 안의 실제 개행문자), JSON.parse가 "Unterminated string" 오류를 내는 걸 막기 위한
// 안전장치입니다. 문자열(따옴표) 안에 있는 개행·탭만 골라 \n, \t로 바꿔줍니다.
function sanitizeJsonString(raw) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
      } else if (ch === '\\') {
        result += ch;
        escaped = true;
      } else if (ch === '"') {
        result += ch;
        inString = false;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    } else {
      if (ch === '"') inString = true;
      result += ch;
    }
  }
  return result;
}

function parseAiJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(sanitizeJsonString(raw));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const { question, answer, systemPrompt } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: '질문과 답변이 필요합니다.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1800,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `[질문]\n${question}\n\n[수강생 답변]\n${answer}` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: 'AI 피드백 생성에 실패했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    const feedback = parseAiJson(clean);

    return res.status(200).json(feedback);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'AI 피드백 생성 중 오류가 발생했습니다.' });
  }
}
