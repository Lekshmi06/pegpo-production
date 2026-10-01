import { Request, Response } from "express";
import fs from "fs/promises";
import {
  createCurriculum,
  getCurriculumsByContext,
  getCurriculumById,
  updateCurriculum,
  processCurriculum,
} from "../services/curriculum_service";

export const createCurriculumController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const { contextId, title, subject, board, classLevel, academicYear, manualText } = req.body;
    if (!contextId) {
      if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
      res.status(400).json({ success: false, message: "contextId is required" });
      return;
    }

    const curriculum = await createCurriculum(
      teacherProfile._id,
      {
        contextId,
        title,
        subject,
        board,
        classLevel,
        academicYear,
        manualText,
      },
      req.file
    );

    res.status(201).json({
      success: true,
      message: "Curriculum created successfully",
      data: curriculum,
    });
  } catch (error) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    const message = error instanceof Error ? error.message : "Failed to create curriculum";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const getCurriculumsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const contextId = req.query.contextId as string;
    if (!contextId) {
      res.status(400).json({ success: false, message: "contextId query parameter is required" });
      return;
    }

    const curriculums = await getCurriculumsByContext(contextId, teacherProfile._id);
    res.status(200).json({
      success: true,
      data: curriculums,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch curriculums";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const getCurriculumByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const curriculum = await getCurriculumById(id, teacherProfile._id);
    res.status(200).json({
      success: true,
      data: curriculum,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch curriculum";
    const status = message.includes("Unauthorized") ? 403 : 404;
    res.status(status).json({ success: false, message });
  }
};

export const updateCurriculumController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const curriculum = await updateCurriculum(id, teacherProfile._id, req.body);
    res.status(200).json({
      success: true,
      message: "Curriculum updated successfully",
      data: curriculum,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update curriculum";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const processCurriculumController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const curriculum = await processCurriculum(id, teacherProfile._id);
    res.status(200).json({
      success: true,
      message: "Curriculum processed and structured successfully",
      data: curriculum,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process curriculum";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};
