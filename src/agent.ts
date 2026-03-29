// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { getEventsTool } from "./tools/events.js";
import { searchFaqsTool } from "./tools/faqs.js";

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile", 
  temperature: 0,
  maxRetries: 2,
});

export const agent = createReactAgent({
  llm: llm,
  tools: [getEventsTool, searchFaqsTool],
});