import multer from "multer";
import path from "path";
import fs from "fs";

const uploadRoot = path.resolve("uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const teacherId = req.teacherProfile?._id?.toString() || "default";
    const teacherUploadPath = path.join(uploadRoot, "temp", "templates", teacherId);

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
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const fileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(extension)) {
    cb(
      new Error(
        "Unsupported file type. Allowed formats for template upload: PNG, JPG, JPEG, and WEBP."
      )
    );
    return;
  }

  cb(null, true);
};

export const teacherTemplateUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for template images
  },
});

export default teacherTemplateUpload;
