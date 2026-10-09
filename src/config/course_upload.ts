import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.user?._id?.toString() || "marketplace";
    const courseUploadPath = path.join(uploadRoot, "courses", userId);

    fs.mkdirSync(courseUploadPath, { recursive: true });
    cb(null, courseUploadPath);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const cleanBaseName = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 50);
    const uniqueName = `${Date.now()}-${cleanBaseName}${extension}`;
    cb(null, uniqueName);
  },
});

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "text/plain",
  "text/markdown",
]);

const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".pdf",
    ".mp4",
    ".webm",
    ".txt",
    ".md",
  ]);

  if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(extension)) {
    cb(new Error("Unsupported file format for course asset."));
    return;
  }

  cb(null, true);
};

export const courseUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

export default courseUpload;
