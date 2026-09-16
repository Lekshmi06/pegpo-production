import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
  const studentId = Array.isArray(req.params.studentId)
  ? req.params.studentId[0]
  : req.params.studentId;

const studentUploadPath = path.join(
  uploadRoot,
  "students",
  studentId
);

    fs.mkdirSync(studentUploadPath, {
      recursive: true,
    });

    cb(null, studentUploadPath);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1_000_000_000
    )}${extension}`;

    cb(null, uniqueName);
  },
});

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".docx",
  ".txt",
  ".webm",
  ".wav",
  ".mp3",
  ".ogg",
  ".m4a",
  ".mp4",
  ".aac",
  ".flac",
]);

const fileFilter: multer.Options["fileFilter"] = (
  req,
  file,
  cb
) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(extension)) {
    cb(
      new Error(
        "Unsupported file type. Allowed formats: PDF, DOCX, TXT, and Audio (WEBM, WAV, MP3, M4A, OGG)."
      )
    );
    return;
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for lecture recordings & textbooks
  },
});

export default upload;