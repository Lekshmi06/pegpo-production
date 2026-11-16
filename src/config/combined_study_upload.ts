import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads", "combined_study");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const rawProgramId = req.params.programId;
    const programId = Array.isArray(rawProgramId) ? rawProgramId[0] : rawProgramId || "general";
    const dirPath = path.join(uploadRoot, programId);
    fs.mkdirSync(dirPath, { recursive: true });
    cb(null, dirPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export const combinedStudyUpload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
  },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: '${file.mimetype}'. Allowed: PDF, Images (JPEG/PNG/WebP/GIF), and Video (MP4/WebM)`));
    }
  },
});
