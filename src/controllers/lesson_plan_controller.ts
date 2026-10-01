import { Request, Response } from "express";
import {
  createLessonPlan,
  getLessonPlansByContext,
  getLessonPlanById,
  updateLessonPlan,
  updateLessonSessionStatus,
  generateAILessonPlan,
  addSessionResource,
  updateSessionResource,
  deleteSessionResource,
  toggleSessionResourceApproval,
  generateSessionFlashcards,
} from "../services/lesson_plan_service";

export const createLessonPlanController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const plan = await createLessonPlan(teacherProfile._id, req.body);
    res.status(201).json({
      success: true,
      message: "Lesson plan created successfully",
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create lesson plan";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const getLessonPlansController = async (
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

    const plans = await getLessonPlansByContext(contextId, teacherProfile._id);
    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch lesson plans";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const getLessonPlanByIdController = async (
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
    const plan = await getLessonPlanById(id, teacherProfile._id);
    res.status(200).json({
      success: true,
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch lesson plan";
    const status = message.includes("Unauthorized") ? 403 : 404;
    res.status(status).json({ success: false, message });
  }
};

export const updateLessonPlanController = async (
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
    const plan = await updateLessonPlan(id, teacherProfile._id, req.body);
    res.status(200).json({
      success: true,
      message: "Lesson plan updated successfully",
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lesson plan";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const updateSessionStatusController = async (
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
    const sessionNum = parseInt(Array.isArray(req.params.sessionNum) ? req.params.sessionNum[0] : req.params.sessionNum, 10);
    const { status, notes } = req.body;

    if (isNaN(sessionNum)) {
      res.status(400).json({ success: false, message: "Invalid session number" });
      return;
    }

    const plan = await updateLessonSessionStatus(id, teacherProfile._id, sessionNum, status, notes);
    res.status(200).json({
      success: true,
      message: `Session ${sessionNum} status updated successfully`,
      data: plan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update session status";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const generateAILessonPlanController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const {
      contextId,
      chapterTitle,
      curriculumId,
      templateId,
      templateSchema,
      availableSessions,
      durationMinutes,
      additionalGuidelines,
      teachingSchedule,
    } = req.body;

    if (!contextId) {
      res.status(400).json({ success: false, message: "contextId is required" });
      return;
    }

    if (!chapterTitle?.trim() && !curriculumId) {
      res.status(400).json({
        success: false,
        message: "Either chapterTitle or curriculumId is required",
      });
      return;
    }

    const result = await generateAILessonPlan(teacherProfile._id, {
      contextId,
      chapterTitle,
      curriculumId,
      templateId,
      templateSchema,
      availableSessions: availableSessions ? parseInt(availableSessions, 10) : undefined,
      durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
      additionalGuidelines,
      teachingSchedule,
    });

    res.status(200).json({
      success: true,
      message: "AI lesson plan draft generated successfully",
      data: result.data,
      isAiGenerated: result.isAiGenerated,
      curriculumId: result.curriculumId,
      templateId: result.templateId,
      templateName: result.templateName,
      templateSchema: result.templateSchema,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate AI lesson plan";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const addSessionResourceController = async (
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
    const sessionNum = parseInt(Array.isArray(req.params.sessionNum) ? req.params.sessionNum[0] : req.params.sessionNum, 10);
    if (isNaN(sessionNum)) {
      res.status(400).json({ success: false, message: "Invalid session number" });
      return;
    }

    const result = await addSessionResource(id, teacherProfile._id, sessionNum, req.body);
    res.status(201).json({
      success: true,
      message: "Resource added to session successfully",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add resource";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const updateSessionResourceController = async (
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
    const sessionNum = parseInt(Array.isArray(req.params.sessionNum) ? req.params.sessionNum[0] : req.params.sessionNum, 10);
    const resourceId = Array.isArray(req.params.resourceId) ? req.params.resourceId[0] : req.params.resourceId;

    if (isNaN(sessionNum) || !resourceId) {
      res.status(400).json({ success: false, message: "Invalid session number or resource ID" });
      return;
    }

    const result = await updateSessionResource(id, teacherProfile._id, sessionNum, resourceId, req.body);
    res.status(200).json({
      success: true,
      message: "Resource updated successfully",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update resource";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const deleteSessionResourceController = async (
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
    const sessionNum = parseInt(Array.isArray(req.params.sessionNum) ? req.params.sessionNum[0] : req.params.sessionNum, 10);
    const resourceId = Array.isArray(req.params.resourceId) ? req.params.resourceId[0] : req.params.resourceId;

    if (isNaN(sessionNum) || !resourceId) {
      res.status(400).json({ success: false, message: "Invalid session number or resource ID" });
      return;
    }

    const updatedPlan = await deleteSessionResource(id, teacherProfile._id, sessionNum, resourceId);
    res.status(200).json({
      success: true,
      message: "Resource deleted from session successfully",
      data: updatedPlan,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete resource";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const toggleSessionResourceApprovalController = async (
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
    const sessionNum = parseInt(Array.isArray(req.params.sessionNum) ? req.params.sessionNum[0] : req.params.sessionNum, 10);
    const resourceId = Array.isArray(req.params.resourceId) ? req.params.resourceId[0] : req.params.resourceId;
    const { isApproved } = req.body;

    if (isNaN(sessionNum) || !resourceId) {
      res.status(400).json({ success: false, message: "Invalid session number or resource ID" });
      return;
    }

    const result = await toggleSessionResourceApproval(id, teacherProfile._id, sessionNum, resourceId, isApproved);
    res.status(200).json({
      success: true,
      message: "Resource approval status updated successfully",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update resource approval";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};

export const generateSessionFlashcardsController = async (
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
    const sessionNum = parseInt(Array.isArray(req.params.sessionNum) ? req.params.sessionNum[0] : req.params.sessionNum, 10);
    const count = req.body.count ? parseInt(req.body.count, 10) : 5;

    if (isNaN(sessionNum)) {
      res.status(400).json({ success: false, message: "Invalid session number" });
      return;
    }

    const result = await generateSessionFlashcards(id, teacherProfile._id, sessionNum, count);
    res.status(200).json({
      success: true,
      message: "AI flashcards generated and attached to session successfully",
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate flashcards";
    const status = message.includes("Unauthorized") ? 403 : 400;
    res.status(status).json({ success: false, message });
  }
};
