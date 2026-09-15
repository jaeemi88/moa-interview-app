// 학생 답변을 받아 Anthropic API로 AI 피드백을 생성하는 서버 함수입니다.
// API 키는 여기(서버)에서만 사용되고, 학생/강사 화면(브라우저)에는 절대 노출되지 않습니다.

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
        max_tokens: 1000,
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
    const feedback = JSON.parse(clean);

    return res.status(200).json(feedback);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'AI 피드백 생성 중 오류가 발생했습니다.' });
  }
}
