import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const teacherId = req.teacherProfile?._id?.toString() || "default";
    const assessmentUploadPath = path.join(uploadRoot, "assessments", teacherId);

    fs.mkdirSync(assessmentUploadPath, { recursive: true });
    cb(null, assessmentUploadPath);
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
  "text/plain",
]);

const allowedExtensions = new Set([".pdf", ".docx", ".doc", ".txt"]);

const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(extension)) {
    cb(
      new Error(
        "Unsupported file type. Allowed formats for question paper upload: PDF, DOCX, DOC, and TXT."
      )
    );
    return;
  }

  cb(null, true);
};

export const assessmentUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
});

export default assessmentUpload;
