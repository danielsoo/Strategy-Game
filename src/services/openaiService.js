// src/services/openaiService.js
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 게임 스토리의 다음 “턴”을 생성하는 공통 함수
 * @param {string} prompt – AI에게 보낼 전체 프롬프트(이미 JSON 형태로 감싸져 있거나, system/user 역할 포함)
 * @returns {Promise<string>} – AI가 반환한 문자열(JSON 직렬화된 narrative+options)
 */
export async function generateNextTurn(prompt) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "당신은 텍스트 기반 선택형 탐정 게임의 스토리마스터입니다." },
      { role: "user", content: prompt },
    ],
  });
  return completion.choices[0].message.content;
}

// (기존) 단일 문단 텍스트 생성용 함수
export async function fetchGameTextFromAI() {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "당신은 텍스트 기반 게임 내러티브 생성기입니다." },
      { role: "user", content: "새로운 게임 스토리 한 문단을 생성해줘." }
    ],
  });
  return completion.choices[0].message.content;
}
