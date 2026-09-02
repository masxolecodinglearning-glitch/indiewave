const { GoogleGenAI } = require("@google/genai");

const configuredModel = String(process.env.GEMINI_MODEL || "").trim();
const AI_MODEL = configuredModel === "gemini-2.5-flash"
  ? "gemini-3.6-flash"
  : configuredModel || "gemini-3.6-flash";
const MAX_PROMPT_CHARS = 4000;

let aiClient = null;

function getClient() {
  if (aiClient) return aiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

function cleanPrompt(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (text.length > MAX_PROMPT_CHARS) {
    throw new Error(`${fieldName} is too long`);
  }
  return text;
}

function extractText(response) {
  const text = typeof response?.text === "string" ? response.text.trim() : "";
  if (text) return text;

  const parts = response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const merged = parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
    if (merged) return merged;
  }

  return "";
}

function buildSafeProviderDiagnostic(error) {
  const providerError = error?.response?.data?.error || error?.error || null;
  const errorMessage = typeof error?.message === "string" ? error.message : "Unknown error";

  return {
    model: AI_MODEL,
    endpointCategory: "models.generateContent",
    errorName: error?.name || "Error",
    errorMessage,
    httpStatus: error?.status ?? error?.response?.status ?? null,
    providerStatus: providerError?.status ?? null,
    providerErrorCode: providerError?.code ?? error?.code ?? null,
    providerErrorMessage: providerError?.message ?? null
  };
}

async function generateAiText({ systemInstruction, userPrompt, temperature = 0.7, maxOutputTokens = 700 }) {
  const prompt = cleanPrompt(userPrompt, "Prompt");
  const instruction = String(systemInstruction || "").trim();

  if (!instruction) {
    throw new Error("System instruction is required");
  }

  const ai = getClient();
  let response;
  try {
    response = await ai.models.generateContent({
      model: AI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: instruction,
        temperature,
        maxOutputTokens
      }
    });
  } catch (error) {
    console.error("[IndieWave AI] Gemini generateContent failed", buildSafeProviderDiagnostic(error));
    throw error;
  }

  const text = extractText(response);
  if (!text) {
    throw new Error("AI returned an empty response");
  }

  return text;
}

module.exports = {
  AI_MODEL,
  MAX_PROMPT_CHARS,
  generateAiText
};
