import { Request, Response } from "express";
import {
  enrollInCourse,
  getLearnerEnrolledCourses,
  getLearnerCourseLearningState,
  updateLessonProgress,
  verifyLessonAccess,
} from "../services/enrollment_service";

const getParam = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
};

export const enrollInCourseController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const result = await enrollInCourse(user._id.toString(), id);
    res.status(201).json({
      success: true,
      message: result.alreadyEnrolled
        ? "You are already enrolled in this course"
        : "Successfully enrolled in course",
      data: result.enrollment,
      alreadyEnrolled: result.alreadyEnrolled,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to enroll in course",
    });
  }
};

export const getLearnerEnrolledCoursesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const result = await getLearnerEnrolledCourses(user._id.toString());
    res.status(200).json({
      success: true,
      data: result.enrollments,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch enrolled courses",
    });
  }
};

export const getLearnerCourseLearningStateController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const result = await getLearnerCourseLearningState(user._id.toString(), id);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 404;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to load course learning experience",
    });
  }
};

export const updateLessonProgressController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const { lessonId, completed } = req.body;
    if (!lessonId) {
      res.status(400).json({ success: false, message: "lessonId is required" });
      return;
    }

    const result = await updateLessonProgress(
      user._id.toString(),
      id,
      lessonId,
      completed !== undefined ? Boolean(completed) : true
    );

    res.status(200).json({
      success: true,
      message: "Progress updated successfully",
      data: result.enrollment,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to update progress",
    });
  }
};

export const verifyLessonAccessController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = getParam(req.params.id);
    const lessonId = getParam(req.params.lessonId);
    const userId = req.user?._id?.toString();

    const result = await verifyLessonAccess(userId, id, lessonId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const isAuth = error.message?.includes("Authentication required");
    const isForbidden = error.message?.includes("Forbidden");
    const status = isAuth ? 401 : isForbidden ? 403 : 404;

    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to access lesson",
    });
  }
};
