import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response, NextFunction } from "express";
import { IAssignmentAttachment } from "../models/Assignment";
import { ISubmissionAttachment } from "../models/AssignmentSubmission";

/**
 * Root directory for private assignment storage.
 * Strictly stored under storage/assignments (OUTSIDE the public /uploads/ directory)
 * so that neither student submissions nor teacher materials are exposed through unrestricted static URLs.
 */
export const PRIVATE_ASSIGNMENT_STORAGE_ROOT = path.resolve(
  "storage",
  "assignments"
);

export const TEACHER_STORAGE_DIR = "teachers";
export const SUBMISSION_STORAGE_DIR = "submissions";

export const TEACHER_ASSIGNMENT_STORAGE_ROOT = path.join(
  PRIVATE_ASSIGNMENT_STORAGE_ROOT,
  TEACHER_STORAGE_DIR
);

export const SUBMISSION_ASSIGNMENT_STORAGE_ROOT = path.join(
  PRIVATE_ASSIGNMENT_STORAGE_ROOT,
  SUBMISSION_STORAGE_DIR
);

export const ASSIGNMENT_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * Strict mapping of allowed file extensions to their corresponding valid MIME types.
 * Both the extension and MIME type must be present, and they must match each other.
 */
export const ALLOWED_EXTENSION_TO_MIMES: Record<string, string[]> = {
  // Documents
  ".pdf": ["application/pdf"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".doc": ["application/msword"],
  ".pptx": [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  ".ppt": ["application/vnd.ms-powerpoint"],
  // Text & Data
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".csv": ["text/csv", "text/plain", "application/vnd.ms-excel"],
  // Images
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
  // Archives & Code
  ".zip": ["application/zip", "application/x-zip-compressed"],
};

export const ALLOWED_ASSIGNMENT_EXTENSIONS = new Set(
  Object.keys(ALLOWED_EXTENSION_TO_MIMES)
);

export const ALLOWED_ASSIGNMENT_MIME_TYPES = new Set(
  Object.values(ALLOWED_EXTENSION_TO_MIMES).flat()
);

/**
 * Multer file filter enforcing:
 * 1. Extension is in the allowlist.
 * 2. MIME type is in the allowlist.
 * 3. Extension and MIME type match (rejects extension/MIME mismatches).
 *
 * NOTE ON SECURITY:
 * Extension and MIME checks validate filename conventions and client-sent Content-Type headers.
 * They do NOT validate actual file content (headers can be forged).
 * To validate binary content signatures (magic numbers) and content policy,
 * validateUploadedFilesContent middleware is executed post-upload.
 */
export const assignmentFileFilter: multer.Options["fileFilter"] = (
  _req,
  file,
  cb
) => {
  const extension = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  const allowedMimes = ALLOWED_EXTENSION_TO_MIMES[extension];

  if (!allowedMimes) {
    cb(
      new Error(
        `Unsupported file extension '${extension}'. Allowed extensions: ${Array.from(
          ALLOWED_ASSIGNMENT_EXTENSIONS
        ).join(", ")}.`
      )
    );
    return;
  }

  if (!allowedMimes.includes(mimeType)) {
    cb(
      new Error(
        `MIME type mismatch: '${file.mimetype}' is not permitted for file extension '${extension}'. Expected: ${allowedMimes.join(
          ", "
        )}.`
      )
    );
    return;
  }

  cb(null, true);
};

/**
 * Format Validation & Content Policy Documentation:
 *
 * 1. Formats with strictly verified binary signatures (magic numbers):
 *    - PDF (.pdf): %PDF (0x25 0x50 0x44 0x46)
 *    - PNG (.png): \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
 *    - JPEG (.jpg, .jpeg): 0xFF 0xD8 0xFF
 *    - WEBP (.webp): RIFF (0x52 0x49 0x46 0x46) followed by WEBP (0x57 0x45 0x42 0x50)
 *    - ZIP (.zip) / DOCX (.docx) / PPTX (.pptx): PK\x03\x04 (0x50 0x4B 0x03 0x04)
 *    - Legacy MS Office (.doc, .ppt): OLE Compound File header (0xD0 0xCF 0x11 0xE0 0xA1 0xB1 0x1A 0xE1)
 *
 * 2. Formats that CANNOT be reliably validated via magic bytes (documented limitation):
 *    - Plain text (.txt), Markdown (.md), CSV (.csv):
 *      Plain text files lack standard binary file headers. Validation is enforced
 *      via content policy checking for absence of binary null bytes (0x00) in the header chunk.
 */
export const verifyFileContentSignature = async (
  filePath: string,
  extension: string
): Promise<{ valid: boolean; reason?: string }> => {
  const ext = extension.toLowerCase();
  let fileHandle: fs.promises.FileHandle | null = null;

  try {
    fileHandle = await fs.promises.open(filePath, "r");
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await fileHandle.read(buffer, 0, 16, 0);

    if (bytesRead < 4) {
      return {
        valid: false,
        reason: "File is too small to inspect binary content signature.",
      };
    }

    // PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
    if (ext === ".pdf") {
      const isPdf =
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46;
      return isPdf
        ? { valid: true }
        : { valid: false, reason: "Invalid PDF signature (missing %PDF header)." };
    }

    // PNG magic bytes: \x89PNG\r\n\x1a\n (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A)
    if (ext === ".png") {
      const isPng =
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a;
      return isPng
        ? { valid: true }
        : { valid: false, reason: "Invalid PNG signature." };
    }

    // JPEG magic bytes: 0xFF 0xD8 0xFF
    if (ext === ".jpg" || ext === ".jpeg") {
      const isJpeg =
        buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      return isJpeg
        ? { valid: true }
        : { valid: false, reason: "Invalid JPEG signature." };
    }

    // WEBP magic bytes: RIFF....WEBP
    if (ext === ".webp") {
      const isRiff =
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46;
      const isWebp =
        bytesRead >= 12 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50;
      return isRiff && isWebp
        ? { valid: true }
        : { valid: false, reason: "Invalid WEBP signature (missing RIFF/WEBP)." };
    }

    // ZIP, DOCX, PPTX magic bytes: PK\x03\x04 (0x50 0x4B 0x03 0x04)
    if (ext === ".zip" || ext === ".docx" || ext === ".pptx") {
      const isZip =
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        buffer[2] === 0x03 &&
        buffer[3] === 0x04;
      return isZip
        ? { valid: true }
        : { valid: false, reason: `Invalid archive/OOXML signature for ${ext}.` };
    }

    // Legacy Office (DOC, PPT): 0xD0 0xCF 0x11 0xE0 0xA1 0xB1 0x1A 0xE1
    if (ext === ".doc" || ext === ".ppt") {
      const isOle =
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0 &&
        buffer[4] === 0xa1 &&
        buffer[5] === 0xb1 &&
        buffer[6] === 0x1a &&
        buffer[7] === 0xe1;
      return isOle
        ? { valid: true }
        : { valid: false, reason: `Invalid Compound Document signature for ${ext}.` };
    }

    // Plain text / Markdown / CSV: content policy check for binary null bytes
    if (ext === ".txt" || ext === ".md" || ext === ".csv") {
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0x00) {
          return {
            valid: false,
            reason: "Text file contains binary null bytes.",
          };
        }
      }
      return { valid: true };
    }

    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      reason: `Signature inspection error: ${err.message}`,
    };
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
};

/**
 * Validates a single file and immediately deletes it from disk if invalid.
 */
export const verifyAndCleanupFile = async (
  filePath: string,
  extension: string
): Promise<{ valid: boolean; reason?: string }> => {
  const check = await verifyFileContentSignature(filePath, extension);
  if (!check.valid) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch {
      // Ignore unlink errors during cleanup
    }
  }
  return check;
};

/**
 * Reusable Express post-upload middleware.
 * Enforces binary content-signature validation on all uploaded files.
 * If any file fails validation, ALL uploaded files are deleted from disk,
 * and an HTTP 400 response is returned, halting the pipeline before metadata is saved.
 */
export const validateUploadedFilesContent = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const files: Express.Multer.File[] = [];

  if (req.file) {
    files.push(req.file);
  }
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === "object") {
    for (const key of Object.keys(req.files)) {
      files.push(...(req.files as Record<string, Express.Multer.File[]>)[key]);
    }
  }

  if (files.length === 0) {
    return next();
  }

  const cleanupAllFiles = async () => {
    for (const f of files) {
      if (f.path && fs.existsSync(f.path)) {
        try {
          await fs.promises.unlink(f.path);
        } catch {
          // ignore cleanup failures
        }
      }
    }
  };

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const result = await verifyFileContentSignature(file.path, ext);
    if (!result.valid) {
      await cleanupAllFiles();
      res.status(400).json({
        success: false,
        message: `File validation failed for '${file.originalname}': ${result.reason}`,
      });
      return;
    }
  }

  next();
};

const sanitizeFileName = (originalname: string): string => {
  const extension = path.extname(originalname).toLowerCase();
  const cleanBaseName = path
    .basename(originalname, extension)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 50);
  return `${Date.now()}-${cleanBaseName}${extension}`;
};

// Teacher assignment storage: strictly rejects upload if authenticated teacher profile ID is missing.
const teacherStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const teacherId = (req as any).teacherProfile?._id?.toString();
    if (!teacherId) {
      cb(
        new Error(
          "Unauthorized upload: Authenticated teacher profile ID is required for assignment attachment uploads. Fallback or anonymous storage is strictly rejected."
        ),
        ""
      );
      return;
    }
    const targetDir = path.join(TEACHER_ASSIGNMENT_STORAGE_ROOT, teacherId);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    cb(null, sanitizeFileName(file.originalname));
  },
});

// Student submission storage: strictly rejects upload if authenticated student profile ID is missing.
const submissionStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const studentId = (req as any).studentProfile?._id?.toString();
    if (!studentId) {
      cb(
        new Error(
          "Unauthorized upload: Authenticated student profile ID is required for homework submission uploads. Fallback or anonymous storage is strictly rejected."
        ),
        ""
      );
      return;
    }
    const targetDir = path.join(SUBMISSION_ASSIGNMENT_STORAGE_ROOT, studentId);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    cb(null, sanitizeFileName(file.originalname));
  },
});

/**
 * Multer middleware for teacher assignment attachments.
 * Files are stored privately under storage/assignments/teachers/<teacherId>/
 * Rejects uploads without an authenticated teacher profile.
 */
export const assignmentTeacherUpload = multer({
  storage: teacherStorage,
  fileFilter: assignmentFileFilter,
  limits: {
    fileSize: ASSIGNMENT_MAX_FILE_SIZE,
    files: 10,
  },
});

/**
 * Multer middleware for student homework/assignment submissions.
 * Files are stored privately under storage/assignments/submissions/<studentId>/
 * Rejects uploads without an authenticated student profile.
 */
export const assignmentSubmissionUpload = multer({
  storage: submissionStorage,
  fileFilter: assignmentFileFilter,
  limits: {
    fileSize: ASSIGNMENT_MAX_FILE_SIZE,
    files: 10,
  },
});

/**
 * Hardened resolver for assignment storage paths.
 * Enforces:
 * - Non-empty string keys.
 * - Rejection of absolute paths.
 * - Rejection of Windows drive letters (e.g. C:, E:).
 * - Rejection of null bytes and path traversal patterns ('..', embedded '..').
 * - Verification that the resolved path strictly resides inside PRIVATE_ASSIGNMENT_STORAGE_ROOT.
 */
export const resolveAssignmentStoragePath = (storageKey: string): string => {
  if (!storageKey || typeof storageKey !== "string" || !storageKey.trim()) {
    throw new Error("Invalid storage key: key must be a non-empty string.");
  }

  // Reject absolute paths
  if (path.isAbsolute(storageKey)) {
    throw new Error(
      `Invalid storage key '${storageKey}': absolute paths are strictly rejected.`
    );
  }

  // Reject Windows drive letters
  if (/^[a-zA-Z]:/.test(storageKey)) {
    throw new Error(
      `Invalid storage key '${storageKey}': Windows drive letters are strictly rejected.`
    );
  }

  // Reject null bytes and path traversal patterns
  if (
    storageKey.includes("\0") ||
    storageKey.split(/[/\\]/).some((part) => part === ".." || part === ".")
  ) {
    throw new Error(
      `Invalid storage key '${storageKey}': path traversal or dot segments are strictly rejected.`
    );
  }

  // Resolve candidate path
  const candidatePath = path.resolve(PRIVATE_ASSIGNMENT_STORAGE_ROOT, storageKey);

  // Verify candidate strictly remains inside PRIVATE_ASSIGNMENT_STORAGE_ROOT
  const relative = path.relative(PRIVATE_ASSIGNMENT_STORAGE_ROOT, candidatePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal violation: storage key '${storageKey}' resolves outside assignment storage root.`
    );
  }

  return candidatePath;
};

/**
 * Helper to construct an IAssignmentAttachment record from an uploaded teacher file.
 * Uses storageKey as the canonical reference. Does not store redundant storagePath.
 */
export const buildTeacherAttachmentRecord = (
  file: Express.Multer.File,
  teacherId: string,
  assignmentId?: string
): IAssignmentAttachment => {
  const storageKey = [TEACHER_STORAGE_DIR, teacherId, file.filename].join("/");
  const fileUrl = assignmentId
    ? `/api/assignments/${assignmentId}/attachments/${file.filename}`
    : `/api/assignments/attachments/${file.filename}`;

  return {
    originalName: file.originalname,
    storedName: file.filename,
    storageKey,
    fileUrl,
    fileSize: file.size,
    mimeType: file.mimetype,
    uploadedAt: new Date(),
  };
};

/**
 * Helper to construct an ISubmissionAttachment record from an uploaded student file.
 * Uses storageKey as the canonical reference. Does not store redundant storagePath.
 */
export const buildSubmissionAttachmentRecord = (
  file: Express.Multer.File,
  studentId: string,
  assignmentId?: string,
  submissionId?: string
): ISubmissionAttachment => {
  const storageKey = [SUBMISSION_STORAGE_DIR, studentId, file.filename].join("/");
  const fileUrl =
    assignmentId && submissionId
      ? `/api/assignments/${assignmentId}/submissions/${submissionId}/attachments/${file.filename}`
      : `/api/assignments/submissions/attachments/${studentId}/${file.filename}`;

  return {
    originalName: file.originalname,
    storedName: file.filename,
    storageKey,
    fileUrl,
    fileSize: file.size,
    mimeType: file.mimetype,
    uploadedAt: new Date(),
  };
};
