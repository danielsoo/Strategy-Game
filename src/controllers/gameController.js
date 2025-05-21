// src/controllers/gameController.js
import express from 'express';
import { createSession, appendChoice, getHistory } from '../services/sessionStore.js';
import { generateNextTurn } from '../services/openaiService.js';

const router = express.Router();

/**
 * POST /game/start
 * -> { sessionId, narrative: string, options: [{id, label}] }
 */
router.post('/start', async (_, res) => {
  const sessionId = createSession();
  // 첫 프롬프트: “게임 시작” 지시
  const initialPrompt = '당신은 텍스트 기반 선택형 탐정 게임의 스토리마스터입니다. ' +
    '“게임 시작” 역할로, 배경 설명과 첫 번째 선택지 3개(id, label)를 JSON으로 반환하세요.';
  const aiResponse = await generateNextTurn(initialPrompt);
  const { narrative, options } = JSON.parse(aiResponse);
  res.json({ sessionId, narrative, options });
});

/**
 * POST /game/choose
 * Body: { sessionId, choiceId }
 * -> { narrative, options }
 */
router.post('/choose', async (req, res) => {
  const { sessionId, choiceId } = req.body;
  if (!sessionId || choiceId == null) {
    return res.status(400).json({ error: 'sessionId와 choiceId가 필요합니다.' });
  }
  try {
    appendChoice(sessionId, choiceId);
    // 이 세션 이력과 마지막 선택지를 함께 프롬프트에 담아 보내기
    const history = getHistory(sessionId);
    const prompt = JSON.stringify({ history, lastChoice: choiceId });
    const aiResponse = await generateNextTurn(
      `세션 이력: ${prompt}\n` +
      '지금까지의 선택 이력을 반영해, 다음 스토리와 새 선택지(id, label) 3개를 JSON으로 반환하세요.'
    );
    const { narrative, options } = JSON.parse(aiResponse);
    res.json({ narrative, options });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'AI 생성 중 오류가 발생했습니다.' });
  }
});

export default router;
