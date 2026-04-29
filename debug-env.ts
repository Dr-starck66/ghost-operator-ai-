import { GoogleGenAI } from '@google/genai';
try {
  console.log("creating GoogleGenAI");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log("created successfully");
} catch(e) {
  console.log("error:", e.message);
}