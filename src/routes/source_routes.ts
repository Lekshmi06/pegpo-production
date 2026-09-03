import { Router } from "express";

import upload from "../config/upload";

import {
  uploadSourceController,
  getStudentSourcesController,
  getSourceController,
  getSourceContentController,
  downloadSourceController,
  deleteSourceController,
} from "../controllers/source_controller";



const router = Router();

router.get(
  "/sources/:sourceId/content",
  getSourceContentController
);

router.post(
  "/students/:studentId/sources",
  upload.single("file"),
  uploadSourceController
);

router.get(
  "/students/:studentId/sources",
  getStudentSourcesController
);

router.get(
  "/sources/:sourceId",
  getSourceController
);

router.get(
  "/sources/:sourceId/file",
  downloadSourceController
);

router.delete(
  "/sources/:sourceId",
  deleteSourceController
);

export default router;