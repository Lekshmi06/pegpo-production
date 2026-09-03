import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

interface ExtractedDocument {
  text: string;
}

export const extractDocumentText = async (
  filePath: string,
  mimeType: string
): Promise<ExtractedDocument> => {
  const extension = path.extname(filePath).toLowerCase();

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