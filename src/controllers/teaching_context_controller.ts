import { Request, Response } from "express";
import {
  createTeachingContext,
  getTeachingContextsByTeacher,
  getTeachingContextById,
  updateTeachingContext,
} from "../services/teaching_context_service";

export const createTeachingContextController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const context = await createTeachingContext(teacherProfile._id, req.body);
    res.status(201).json({
      success: true,
      message: "Teaching context created successfully",
      data: context,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create teaching context";
    res.status(400).json({ success: false, message });
  }
};

export const getTeachingContextsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const contexts = await getTeachingContextsByTeacher(teacherProfile._id);
    res.status(200).json({
      success: true,
      data: contexts,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch teaching contexts";
    res.status(500).json({ success: false, message });
  }
};

export const getTeachingContextByIdController = async (
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
    const context = await getTeachingContextById(id, teacherProfile._id);
    res.status(200).json({
      success: true,
      data: context,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch teaching context";
    const status = message.includes("Unauthorized") ? 403 : 404;
    res.status(status).json({ success: false, message });
  }
};

export const updateTeachingContextController = async (
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
    const context = await updateTeachingContext(id, teacherProfile._id, req.body);
    res.status(200).json({
      success: true,
      message: "Teaching context updated successfully",
      data: context,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update teaching context";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};
