import { Request, Response } from "express";
import {
  createCourse,
  getProviderCourses,
  getMarketplaceCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  togglePublishCourse,
  addCourseSection,
  updateCourseSection,
  deleteCourseSection,
  addCourseLesson,
  updateCourseLesson,
  deleteCourseLesson,
} from "../services/course_service";

const getParam = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || "";
  return param || "";
};

export const createCourseController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const course = await createCourse(user as any, req.body);
    res.status(201).json({
      success: true,
      message: "Course created successfully",
      data: course,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to create course",
    });
  }
};

export const getProviderCoursesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const result = await getProviderCourses(user._id.toString());
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch provider courses",
    });
  }
};

export const getMarketplaceCoursesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, category, level, minPrice, maxPrice, sort } = req.query;

    const result = await getMarketplaceCourses({
      search: search as string,
      category: category as string,
      level: level as string,
      minPrice: minPrice !== undefined ? Number(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? Number(maxPrice) : undefined,
      sort: sort as any,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch marketplace courses",
    });
  }
};

export const getCourseByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParam(req.params.id);
    const requestingUserId = req.user?._id?.toString();

    const result = await getCourseById(id, requestingUserId);
    res.status(200).json({
      success: true,
      data: result.course,
      isOwner: result.isOwner,
    });
  } catch (error: any) {
    const status = error.message?.includes("Access denied") ? 403 : 404;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Course not found",
    });
  }
};

export const updateCourseController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const course = await updateCourse(id, user._id.toString(), req.body);
    res.status(200).json({
      success: true,
      message: "Course updated successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to update course",
    });
  }
};

export const deleteCourseController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    await deleteCourse(id, user._id.toString());
    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete course",
    });
  }
};

export const togglePublishCourseController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const { status } = req.body;
    const course = await togglePublishCourse(id, user._id.toString(), status);
    res.status(200).json({
      success: true,
      message: `Course ${course.status === "published" ? "published" : "unpublished"} successfully`,
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to change course status",
    });
  }
};

// ================= SECTIONS CONTROLLER =================
export const addCourseSectionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const { title, description } = req.body;
    const course = await addCourseSection(id, user._id.toString(), title, description);
    res.status(201).json({
      success: true,
      message: "Section added successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to add section",
    });
  }
};

export const updateCourseSectionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const sectionId = getParam(req.params.sectionId);
    const { title, description } = req.body;
    const course = await updateCourseSection(id, user._id.toString(), sectionId, title, description);
    res.status(200).json({
      success: true,
      message: "Section updated successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to update section",
    });
  }
};

export const deleteCourseSectionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const sectionId = getParam(req.params.sectionId);
    const course = await deleteCourseSection(id, user._id.toString(), sectionId);
    res.status(200).json({
      success: true,
      message: "Section deleted successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete section",
    });
  }
};

// ================= LESSONS CONTROLLER =================
export const addCourseLessonController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const sectionId = getParam(req.params.sectionId);
    const course = await addCourseLesson(id, user._id.toString(), sectionId, req.body);
    res.status(201).json({
      success: true,
      message: "Lesson added successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to add lesson",
    });
  }
};

export const updateCourseLessonController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const sectionId = getParam(req.params.sectionId);
    const lessonId = getParam(req.params.lessonId);
    const course = await updateCourseLesson(
      id,
      user._id.toString(),
      sectionId,
      lessonId,
      req.body
    );
    res.status(200).json({
      success: true,
      message: "Lesson updated successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to update lesson",
    });
  }
};

export const deleteCourseLessonController = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const id = getParam(req.params.id);
    const sectionId = getParam(req.params.sectionId);
    const lessonId = getParam(req.params.lessonId);
    const course = await deleteCourseLesson(id, user._id.toString(), sectionId, lessonId);
    res.status(200).json({
      success: true,
      message: "Lesson deleted successfully",
      data: course,
    });
  } catch (error: any) {
    const status = error.message?.includes("Forbidden") ? 403 : 400;
    res.status(status).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete lesson",
    });
  }
};

// ================= FILE UPLOAD CONTROLLER =================
export const uploadCourseAssetController = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }

    const relativeUrl = `/uploads/courses/${req.user?._id?.toString() || "marketplace"}/${file.filename}`;
    res.status(200).json({
      success: true,
      message: "File uploaded successfully",
      data: {
        fileUrl: relativeUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "File upload failed",
    });
  }
};
