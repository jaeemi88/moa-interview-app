// 강사가 입력한 전공·지원직무를 바탕으로, "직무 특화 질문" 유형에 쓸 면접 질문 6개를
// AI로 생성해주는 서버 함수입니다. 생성된 질문은 그 자리에서 저장되지 않고 클라이언트로
// 반환되며, 강사가 "설정 저장"을 눌러야 실제로 적용됩니다.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  const { targetField } = req.body || {};
  if (!targetField || !String(targetField).trim()) {
    return res.status(400).json({ error: '전공·직무 정보가 필요합니다.' });
  }

  const systemPrompt = `당신은 15년 경력의 취업면접 코치입니다. 아래 전공·지원직무에 특화된 모의면접 질문 6개를 만들어주세요.

[전공·지원직무] ${targetField}

[질문 작성 원칙]
- 이 직무의 실제 업무 상황, 필요 역량, 자주 겪는 어려움을 반영한 구체적인 질문일 것
- "자기소개해주세요", "지원동기가 무엇인가요", "5년 후 모습은?" 같은 일반적인 질문은 피할 것 (다른 유형에 이미 있음)
- 6개 중 최소 1개는 실제 업무 중 발생할 수 있는 상황을 제시하고 대응을 묻는 상황형 질문일 것
- 6개 중 최소 1개는 이 직무에 필요한 역량 중 본인의 부족한 점을 묻는 질문일 것
- 존댓말로, 실제 면접관이 물어볼 법한 자연스러운 문장으로 작성

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트, 설명, 코드블록 없이 순수 JSON만 반환합니다.
{"questions": ["질문1", "질문2", "질문3", "질문4", "질문5", "질문6"]}`;

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
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: `"${targetField}" 직무에 특화된 면접 질문 6개를 만들어주세요.` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API 오류:', data);
      return res.status(500).json({ error: '질문 생성에 실패했습니다.' });
    }

    const raw = (data.content || []).map((c) => c.text || '').join('').trim();
    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      parsed = JSON.parse(sanitizeJsonString(clean));
    }

    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      return res.status(500).json({ error: 'AI가 올바른 형식의 질문을 만들지 못했습니다. 다시 시도해 주세요.' });
    }

    return res.status(200).json({ questions: parsed.questions });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '질문 생성 중 오류가 발생했습니다.' });
  }
}
