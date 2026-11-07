import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  getGeminiClient,
  getGeminiModel,
  GEMINI_FALLBACK_MODELS,
  classifyGeminiError,
} from "../config/gemini_config";

interface ExtractedDocument {
  text: string;
}

export const extractDocumentText = async (
  filePath: string,
  mimeType: string,
  providedTranscript?: string
): Promise<ExtractedDocument> => {
  const extension = path.extname(filePath).toLowerCase();

  // If a live/client-provided transcript is attached to this upload, use it directly
  if (providedTranscript && providedTranscript.trim()) {
    return {
      text: providedTranscript.trim(),
    };
  }

  // Audio files: transcribe using Gemini multimodal audio
  const audioExtensions = [".webm", ".wav", ".mp3", ".ogg", ".m4a", ".mp4", ".aac", ".flac"];
  if (mimeType.startsWith("audio/") || audioExtensions.includes(extension)) {
    return extractAudioText(filePath, mimeType);
  }

  if (mimeType === "application/pdf" || extension === ".pdf") {
    return extractPdfText(filePath);
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === ".docx"
  ) {
    return extractDocxText(filePath);
  }

  if (mimeType === "text/plain" || extension === ".txt") {
    return extractTxtText(filePath);
  }

  throw new Error("Unsupported document type");
};

const extractAudioText = async (
  filePath: string,
  mimeType: string
): Promise<ExtractedDocument> => {
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini AI API key is not configured for audio transcription. Please configure GEMINI_API_KEY.");
  }

  const audioBuffer = await fs.readFile(filePath);
  const base64Audio = audioBuffer.toString("base64");

  let resolvedMime = mimeType;
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm" || mimeType.includes("webm")) resolvedMime = "audio/webm";
  else if (ext === ".wav" || mimeType.includes("wav")) resolvedMime = "audio/wav";
  else if (ext === ".mp3" || mimeType.includes("mp3") || mimeType.includes("mpeg")) resolvedMime = "audio/mp3";
  else if (ext === ".ogg") resolvedMime = "audio/ogg";
  else if (ext === ".m4a") resolvedMime = "audio/x-m4a";
  else if (!resolvedMime || resolvedMime === "application/octet-stream") resolvedMime = "audio/webm";

  const primaryModel = getGeminiModel();
  const modelsToTry = [primaryModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== primaryModel)];

  let lastClassified: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: resolvedMime,
                  data: base64Audio,
                },
              },
              {
                text: "You are an expert classroom lecture transcriber. Accurately transcribe all spoken words in this audio recording. Format the transcript with clean timestamps where appropriate (e.g. [00:00 - 00:15] Teacher: ...). Return only the transcription text.",
              },
            ],
          },
        ],
      });

      const text = (response.text || "").trim();
      if (text.length > 0) {
        return { text };
      }
    } catch (error: any) {
      const classified = classifyGeminiError(error);
      lastClassified = classified;

      if (classified.kind === "AUTH_ERROR") {
        throw new Error(`Audio transcription failed (${classified.kind}): ${classified.safeMessage}`);
      }

      console.warn(`[extractAudioText] Model ${model} failed (${classified.kind}):`, classified.safeMessage);

      if (classified.kind === "QUOTA_EXHAUSTED") {
        await new Promise((r) => setTimeout(r, 1000));
      } else if (classified.kind === "MODEL_UNAVAILABLE") {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  const finalMessage = lastClassified?.safeMessage || "Audio transcription could not be completed at this time.";
  throw new Error(`Audio transcription failed (${lastClassified?.kind || "UNKNOWN"}): ${finalMessage}`);
};

const extractPdfText = async (
  filePath: string
): Promise<ExtractedDocument> => {
  const buffer = await fs.readFile(filePath);

  const parser = new PDFParse({
    data: buffer,
  });

  try {
    const result = await parser.getText();

    const text = result.text.trim();

    if (!text) {
      throw new Error(
        "No text could be extracted from the PDF. The PDF may contain scanned images."
      );
    }

    return {
      text,
    };
  } finally {
    await parser.destroy();
  }
};

const extractDocxText = async (
  filePath: string
): Promise<ExtractedDocument> => {
  const result = await mammoth.extractRawText({
    path: filePath,
  });

  const text = result.value.trim();

  if (!text) {
    throw new Error("No text could be extracted from the DOCX file.");
  }

  return {
    text,
  };
};

const extractTxtText = async (
  filePath: string
): Promise<ExtractedDocument> => {
  const text = (await fs.readFile(filePath, "utf-8")).trim();

  if (!text) {
    throw new Error("The text file is empty.");
  }

  return {
    text,
  };
};