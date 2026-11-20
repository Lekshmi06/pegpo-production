import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import contentController from "../controllers/content_controller";
import { authenticateUser, requireTuitionPlatformAdmin } from "../middlewares/auth_middleware";

const router = Router();

// Multer storage for CMS media uploads
const cmsUploadDir = path.resolve("uploads", "cms");
fs.mkdirSync(cmsUploadDir, { recursive: true });

const cmsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, cmsUploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `cms-${Date.now()}-${Math.round(Math.random() * 1_000_000)}${ext}`;
    cb(null, unique);
  },
});

const cmsUpload = multer({
  storage: cmsStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// ============================================================================
// Public Endpoints
// ============================================================================

// GET all site content sections
router.get("/", contentController.getAllContent);

// GET CMS landing page data (?mode=draft|published)
router.get("/landing-page", contentController.getLandingPageCms);

// GET content for specific key (e.g., hero, tuitionBanner, announcements)
router.get("/:key", contentController.getContentByKey);

// ============================================================================
// Protected Admin CMS Endpoints
// ============================================================================

// Save landing page draft
router.put("/landing-page", authenticateUser, requireTuitionPlatformAdmin, contentController.saveLandingPageDraft);

// Publish landing page live
router.post("/landing-page/publish", authenticateUser, requireTuitionPlatformAdmin, contentController.publishLandingPage);

// Reset landing page to default system content
router.post("/reset", authenticateUser, requireTuitionPlatformAdmin, contentController.resetLandingPage);

// Media upload for CMS
router.post(
  "/upload",
  authenticateUser,
  requireTuitionPlatformAdmin,
  cmsUpload.single("file"),
  (req: Request, res: Response): void => {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }
    const url = `/uploads/cms/${req.file.filename}`;
    res.status(200).json({ url, filename: req.file.filename });
  }
);

// Update a specific section by key
router.put("/:key", authenticateUser, requireTuitionPlatformAdmin, contentController.updateContentByKey);

export default router;
