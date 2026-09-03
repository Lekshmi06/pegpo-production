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
]);

const fileFilter: multer.Options["fileFilter"] = (
  req,
  file,
  cb
) => {
  if (!allowedMimeTypes.has(file.mimetype)) {
    cb(
      new Error(
        "Unsupported file type. Only PDF, DOCX, and TXT files are allowed."
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
    fileSize: 20 * 1024 * 1024,
  },
});

export default upload;