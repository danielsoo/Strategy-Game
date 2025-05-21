// src/services/sessionStore.js
const sessions = new Map();
/**
 * 새 세션 생성
 */
export function createSession() {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessions.set(id, { history: [] });
  return id;
}
/**
 * 이 세션에 선택 이력 추가
 */
export function appendChoice(sessionId, choiceId) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Invalid session');
  s.history.push(choiceId);
}
/**
 * 이 세션의 이력 가져오기
 */
export function getHistory(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new Error('Invalid session');
  return s.history;
}
