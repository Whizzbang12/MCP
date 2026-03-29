import "./firebase.js";
import express from "express";
import dotenv from "dotenv";
import { agent } from "./agent.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/", (_, res) => {
  res.json({ online: true });
});

app.post("/chatbot", async (req, res) => {
  const { query } = req.body;

  if (!query) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const result = await agent.invoke({
      messages: [{ role: "human", content: query }],
    });

    const messages = result.messages;
    const lastMessage = messages[messages.length - 1];
    const reply = lastMessage.content;

    res.json({ reply });
  } catch (err) {
    console.error("Agent error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.listen(PORT, () => {
  console.error(`Server running on http://localhost:${PORT}`);
});