import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const teacherId = req.teacherProfile?._id?.toString() || "shared";
    const materialUploadPath = path.join(uploadRoot, "materials", teacherId);

    fs.mkdirSync(materialUploadPath, { recursive: true });
    cb(null, materialUploadPath);
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
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
]);

const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(extension)) {
    cb(
      new Error(
        "Unsupported file type. Allowed formats: PDF, Slides (PPTX/PPT), Word (DOCX/DOC), Text (TXT/MD), and Images (PNG/JPG/WEBP)."
      )
    );
    return;
  }

  cb(null, true);
};

export const teacherMaterialUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

export default teacherMaterialUpload;
