import Groq from "groq-sdk";

// 🚀 Ensure API key exists
if (!process.env.GROQ_API_KEY) {
  throw new Error("Missing GROQ_API_KEY in environment variables");
}

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export default groq;

// ✅ Stable production model
export const GROQ_MODEL = "llama-3.1-8b-instant";

// Optional aliases
export const GROQ_MODEL_FAST = GROQ_MODEL;
export const GROQ_MODEL_BALANCED = GROQ_MODEL;


// ================= STREAMING RESPONSE =================
export async function streamGroq(
  prompt: string,
  model: string = GROQ_MODEL
) {
  return groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model,
    temperature: 0.7,
    max_tokens: 2048,
    stream: true,
  });
}


// ================= NORMAL RESPONSE =================
export async function queryGroq(
  prompt: string,
  model: string = GROQ_MODEL
) {
  return groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model,
    temperature: 0.7,
    max_tokens: 2048,
  });
}