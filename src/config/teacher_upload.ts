import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const teacherId = req.teacherProfile?._id?.toString() || "default";
    const teacherUploadPath = path.join(uploadRoot, "temp", "curriculums", teacherId);

    fs.mkdirSync(teacherUploadPath, { recursive: true });
    cb(null, teacherUploadPath);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1_000_000_000)}${extension}`;
    cb(null, uniqueName);
  },
});

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const allowedExtensions = new Set([".pdf", ".docx", ".txt"]);

const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(extension)) {
    cb(new Error("Unsupported file type. Allowed formats for syllabus upload: PDF, DOCX, and TXT."));
    return;
  }

  cb(null, true);
};

export const teacherCurriculumUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB for curriculum/syllabus documents
  },
});

export default teacherCurriculumUpload;
