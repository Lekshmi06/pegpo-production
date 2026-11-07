import dotenv from "dotenv";
import path from "path";
import { GoogleGenAI } from "@google/genai";

// Ensure environment variables are loaded
if (!process.env.GEMINI_API_KEY) {
  dotenv.config();
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}

export type GeminiErrorKind =
  | "AUTH_ERROR"
  | "QUOTA_EXHAUSTED"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "MALFORMED_OUTPUT"
  | "CONFIG_ERROR"
  | "UNKNOWN_ERROR";

export class GeminiServiceError extends Error {
  public readonly kind: GeminiErrorKind;
  public readonly statusCode?: number;
  public readonly modelAttempted?: string;

  constructor(message: string, kind: GeminiErrorKind, statusCode?: number, model?: string) {
    super(message);
    this.name = "GeminiServiceError";
    this.kind = kind;
    this.statusCode = statusCode;
    this.modelAttempted = model;
  }
}

/**
 * Returns the currently active GEMINI_API_KEY without exposing it.
 */
export function getGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || "").trim();
}

/**
 * Primary model: configurable via GEMINI_MODEL, defaults to gemini-3.5-flash.
 */
export function getGeminiModel(): string {
  return (process.env.GEMINI_MODEL || "gemini-3.5-flash").trim();
}

/**
 * Candidate fallback models verified to work with the official Gemini API.
 */
export const GEMINI_FALLBACK_MODELS: readonly string[] = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
];

let cachedClient: GoogleGenAI | null = null;
let lastApiKey = "";

/**
 * Dynamic client factory. Re-initializes if the environment variable changes.
 */
export function getGeminiClient(): GoogleGenAI | null {
  const key = getGeminiApiKey();
  if (!key) return null;
  if (cachedClient && lastApiKey === key) {
    return cachedClient;
  }
  cachedClient = new GoogleGenAI({ apiKey: key });
  lastApiKey = key;
  return cachedClient;
}

/**
 * Classifies raw SDK errors safely without exposing secrets in logs or messages.
 */
export function classifyGeminiError(err: any): {
  kind: GeminiErrorKind;
  isQuota: boolean;
  safeMessage: string;
  statusCode?: number;
} {
  const status =
    err?.status || err?.statusCode || (err?.response ? err.response.status : undefined);
  const rawMsg = String(err?.message || "");
  const sanitized = rawMsg.replace(/key=[^&\s"']+/gi, "key=REDACTED");
  const lower = sanitized.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("unauthenticated")
  ) {
    return {
      kind: "AUTH_ERROR",
      isQuota: false,
      safeMessage: "Gemini AI API authentication failed. Please verify your GEMINI_API_KEY configuration.",
      statusCode: status || 401,
    };
  }

  if (
    status === 429 ||
    lower.includes("429") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota exceeded")
  ) {
    return {
      kind: "QUOTA_EXHAUSTED",
      isQuota: true,
      safeMessage: "AI daily request quota or rate limit reached. Please wait a moment before trying again.",
      statusCode: 429,
    };
  }

  if (
    status === 503 ||
    lower.includes("503") ||
    lower.includes("unavailable") ||
    lower.includes("high demand")
  ) {
    return {
      kind: "MODEL_UNAVAILABLE",
      isQuota: false,
      safeMessage: "The AI service is temporarily experiencing high demand. Please try again in a few moments.",
      statusCode: 503,
    };
  }

  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return {
      kind: "TIMEOUT",
      isQuota: false,
      safeMessage: "AI request timed out. Please try your request again.",
      statusCode: 504,
    };
  }

  return {
    kind: "UNKNOWN_ERROR",
    isQuota: false,
    safeMessage: sanitized.slice(0, 200) || "An unexpected error occurred while communicating with the AI service.",
    statusCode: status || 500,
  };
}

/**
 * Robust JSON parser that handles code blocks, leading/trailing chatter, and trailing commas.
 */
export function safeExtractJsonFromModel<T = any>(rawText: string, contextDescription = "data"): T {
  if (!rawText || !rawText.trim()) {
    throw new GeminiServiceError(
      `AI returned empty content when structured ${contextDescription} was expected.`,
      "MALFORMED_OUTPUT"
    );
  }

  let text = rawText.trim();

  // Strip Markdown code fences if present
  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  // If text still contains non-JSON text, extract substring between first [ or { and last ] or }
  const firstSquare = text.indexOf("[");
  const firstBrace = text.indexOf("{");
  let startIdx = -1;

  if (firstSquare !== -1 && (firstBrace === -1 || firstSquare < firstBrace)) {
    startIdx = firstSquare;
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  }

  if (startIdx !== -1) {
    const isArray = text[startIdx] === "[";
    const lastIdx = isArray ? text.lastIndexOf("]") : text.lastIndexOf("}");
    if (lastIdx > startIdx) {
      text = text.substring(startIdx, lastIdx + 1);
    }
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // Attempt basic repair for trailing commas before closing braces/brackets
    const cleaned = text
      .replace(/,\s*([\]}])/g, "$1")
      .replace(/[\u201C\u201D]/g, '"'); // Smart quotes to normal quotes
    try {
      return JSON.parse(cleaned) as T;
    } catch (parseErr: any) {
      throw new GeminiServiceError(
        `Failed to parse AI output into valid ${contextDescription}: ${parseErr.message}`,
        "MALFORMED_OUTPUT"
      );
    }
  }
}

/**
 * Central caller that tries candidate models sequentially with error classification.
 */
export async function callGeminiWithFallback(
  prompt: string,
  preferredModel?: string
): Promise<{ text: string; modelUsed: string }> {
  const client = getGeminiClient();
  if (!client) {
    throw new GeminiServiceError(
      "Gemini AI API key is not configured or missing from backend environment.",
      "CONFIG_ERROR",
      500
    );
  }

  const primary = preferredModel || getGeminiModel();
  const modelsToTry = [primary, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primary)];

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
      });

      const text = (response.text || "").trim();
      if (text.length > 0) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      const classified = classifyGeminiError(err);

      // Auth errors cannot be fixed by switching models; fail fast
      if (classified.kind === "AUTH_ERROR") {
        throw new GeminiServiceError(classified.safeMessage, "AUTH_ERROR", classified.statusCode, model);
      }

      console.warn(
        `[GeminiConfig] Model ${model} failed (${classified.kind}: ${classified.safeMessage}), trying next candidate...`
      );

      // Brief backoff on rate limit before attempting next candidate model
      if (classified.kind === "QUOTA_EXHAUSTED") {
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Retry once on 503 high demand
      if (classified.kind === "MODEL_UNAVAILABLE") {
        console.warn(`[GeminiConfig] Retrying ${model} after brief backoff for 503 high demand...`);
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const retryRes = await client.models.generateContent({ model, contents: prompt });
          const text = (retryRes.text || "").trim();
          if (text.length > 0) return { text, modelUsed: model };
        } catch (retryErr) {
          lastError = retryErr;
        }
      }
    }
  }

  const finalClassified = classifyGeminiError(lastError);
  throw new GeminiServiceError(
    finalClassified.safeMessage,
    finalClassified.kind,
    finalClassified.statusCode,
    modelsToTry[modelsToTry.length - 1]
  );
}

/**
 * Health check helper to verify connection with live API.
 */
export async function verifyGeminiConnection(): Promise<{
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const res = await callGeminiWithFallback("Respond with 'PONG'");
    return {
      ok: true,
      model: res.modelUsed,
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      ok: false,
      model: getGeminiModel(),
      latencyMs: Date.now() - start,
      error: err.message,
    };
  }
}
