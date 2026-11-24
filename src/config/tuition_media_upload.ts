import multer from "multer";
import path from "path";
import fs from "fs";

// 1. General study materials, attachments & voice notes directory
const mediaUploadRoot = path.resolve("uploads", "tuition_media");
fs.mkdirSync(mediaUploadRoot, { recursive: true });

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(mediaUploadRoot, { recursive: true });
    cb(null, mediaUploadRoot);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}${ext}`;
    cb(null, unique);
  },
});

const allowedMediaMimeTypes = new Set([
  // Documents & Study Material
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  // Audio recordings / Voice notes
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/mp4",
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
]);

export const tuitionMediaUpload = multer({
  storage: mediaStorage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
  },
  fileFilter: (_req, file, cb) => {
    // If mime type or extension is audio/recording or valid media, accept
    const ext = path.extname(file.originalname).toLowerCase();
    const audioExts = [".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac"];
    if (allowedMediaMimeTypes.has(file.mimetype) || audioExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: '${file.mimetype}'. Allowed: PDFs, Documents, Images, and Audio/Voice Notes.`));
    }
  },
});

// 2. Student Assignment / Homework PDF Submissions directory
const submissionUploadRoot = path.resolve("uploads", "tuition_submissions");
fs.mkdirSync(submissionUploadRoot, { recursive: true });

const submissionStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const rawId = req.params.assessmentId || "general";
    const dir = path.join(submissionUploadRoot, Array.isArray(rawId) ? rawId[0] : rawId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const unique = `sub-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

export const tuitionSubmissionUpload = multer({
  storage: submissionStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF documents (.pdf) are allowed for homework and assignment submissions."));
    }
  },
});
