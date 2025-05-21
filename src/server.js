// src/server.js
import express from "express";
import dotenv from "dotenv";
import gameController from "./controllers/gameController.js";
import { fetchGameTextFromAI } from "./services/openaiService.js";


dotenv.config();
const app = express();

app.use(express.json());
app.use("/api/game", gameController);

// 기존 /game → 텍스트 한 문단만 뱉는 용도라면
app.get("/game", async (req, res) => {
  console.log("📥 /game 호출 됨");
  try {
    const text = await fetchGameTextFromAI();
    res.json({ text });
  } catch (err){
    console.error("🚨 /game 에서 에러:", err);
    res.status(500).json({ error: "AI 생성 중 오류 발생" });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Listening on port 3000");
});
