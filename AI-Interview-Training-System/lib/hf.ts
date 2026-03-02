import { HfInference } from "@huggingface/inference";

if (!process.env.HF_API_KEY) {
  throw new Error("HF_API_KEY is missing in environment variables");
}

export const hf = new HfInference(process.env.HF_API_KEY);