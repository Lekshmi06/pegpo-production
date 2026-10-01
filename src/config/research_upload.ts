import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads", "research", "documents");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(uploadRoot, { recursive: true });
    cb(null, uploadRoot);
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, extension).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
    const uniqueName = `${Date.now()}-${cleanBase}${extension}`;
    cb(null, uniqueName);
  },
});

const allowedExtensions = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".xlsx",
  ".xls",
  ".pptx",
  ".ppt",
  ".png",
  ".jpg",
  ".jpeg",
  ".md",
  ".zip",
]);

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.has(extension) || file.mimetype.startsWith("text/") || file.mimetype.startsWith("application/")) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported research file type. Supported formats: PDF, DOCX, TXT, CSV, JSON, XLSX, PPTX, MD, ZIP."));
  }
};

export const researchUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB for large academic datasets, dissertations, and slide decks
  },
});

export default researchUpload;
