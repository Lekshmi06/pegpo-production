import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  createStudent,
  getStudentById,
  getStudentByEmail,
  updateStudent,
  UpdateStudentData,
} from "../services/student_service";
import {
  getStudentAnalyticsData,
  recordStudentStudySession,
} from "../services/student_analytics_service";

const educationLevels = [
  "school",
  "undergraduate",
  "postgraduate",
  "competitive_exam",
  "professional",
  "other",
] as const;

const updateableFields = [
  "name",
  "phone",
  "dob",
  "gender",
  "avatar",
  "goal",
  "learningPath",
  "education",
  "schoolDetails",
  "undergraduateDetails",
  "postgraduateDetails",
  "competitiveExamDetails",
  "language",
  "studyPreferences",
];
const educationFields = [
  "level",
  "board",
  "classLevel",
  "degree",
  "specialization",
  "institution",
];

const validateUpdateData = (body: unknown): string | null => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Request body must be a JSON object";
  }

  const data = body as Record<string, unknown>;
  const providedFields = Object.keys(data);

  if (providedFields.length === 0) {
    return "Provide at least one updateable field";
  }

  const invalidField = providedFields.find(
    (field) => !updateableFields.includes(field)
  );
  if (invalidField) {
    return `Field '${invalidField}' cannot be updated`;
  }

  for (const field of [
    "name",
    "phone",
    "dob",
    "gender",
    "avatar",
    "goal",
    "learningPath",
    "language",
  ]) {
    if (data[field] !== undefined && typeof data[field] !== "string") {
      return `Field '${field}' must be a string`;
    }
  }

  if (
  data.name !== undefined &&
  data.name !== null &&
  typeof data.name === "string" &&
  data.name.trim().length === 0
)  {
    return "Field 'name' cannot be empty";
  }

  if (data.education !== undefined) {
    if (
      !data.education ||
      typeof data.education !== "object" ||
      Array.isArray(data.education)
    ) {
      return "Field 'education' must be an object";
    }

    const education = data.education as Record<string, unknown>;
    const invalidEducationField = Object.keys(education).find(
      (field) => !educationFields.includes(field)
    );
    if (invalidEducationField) {
      return `Education field '${invalidEducationField}' is not allowed`;
    }

    for (const [field, value] of Object.entries(education)) {
      if (typeof value !== "string") {
        return `Education field '${field}' must be a string`;
      }
    }

    if (
      education.level !== undefined &&
      !educationLevels.includes(
        education.level as (typeof educationLevels)[number]
      )
    ) {
      return "Education level is invalid";
    }
  }

  if (data.studyPreferences !== undefined) {
    if (
      !data.studyPreferences ||
      typeof data.studyPreferences !== "object" ||
      Array.isArray(data.studyPreferences)
    ) {
      return "Field 'studyPreferences' must be an object";
    }
  }

  return null;
};

export const createStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const student = await createStudent(req.body);

    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: student,
    });
  } catch (error: any) {
    const rawMessage =
      error instanceof Error ? error.message : "Failed to create student";

    const isDuplicate =
      error?.code === 11000 ||
      (error?.name === "MongoServerError" && error?.code === 11000) ||
      rawMessage.includes("already has an account") ||
      rawMessage.includes("already in use") ||
      rawMessage.includes("already exists");

    if (isDuplicate) {
      res.status(409).json({
        success: false,
        message: "This email ID already has an account or is already in use. Please log in instead.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: rawMessage,
    });
  }
};

export const getStudentByEmailController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const email = Array.isArray(req.params.email)
      ? req.params.email[0]
      : req.params.email;

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email parameter is required",
      });
      return;
    }

    const student = await getStudentByEmail(email);

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch student";

    if (message === "Student not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // const { id } = req.params;
    const id = Array.isArray(req.params.id)
  ? req.params.id[0]
  : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
      return;
    }

    const student = await getStudentById(id);

    res.status(200).json({
      success: true,
      data: student,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch student";

    if (message === "Student not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const updateStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
      return;
    }

    // Strict user-level access isolation: caller can only update their own student profile
    if (req.studentProfile && req.studentProfile._id.toString() !== id) {
      res.status(403).json({
        success: false,
        message: "Forbidden: You cannot update another student's profile.",
      });
      return;
    }

    const validationMessage = validateUpdateData(req.body);
    if (validationMessage) {
      res.status(400).json({
        success: false,
        message: validationMessage,
      });
      return;
    }

    const student = await updateStudent(id, req.body as UpdateStudentData);

    res.status(200).json({
      success: true,
      message: "Student profile updated successfully",
      data: student,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update student";

    if (message === "Student not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    if (error instanceof mongoose.Error.ValidationError) {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to update student",
    });
  }
};

export const searchStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const rawEmail = (req.query.email as string) || (req.query.q as string);
    if (!rawEmail || !rawEmail.trim()) {
      res.status(400).json({
        success: false,
        message: "Email query parameter is required",
      });
      return;
    }

    const email = rawEmail.trim().toLowerCase();
    const student = await getStudentByEmail(email);
    const user = student.userId as any;

    res.status(200).json({
      success: true,
      data: {
        studentProfileId: student._id.toString(),
        name: student.name,
        email: user?.email || email,
        studentType: student.studentType || "external",
        classLevel: student.schoolDetails?.classLevel || student.education?.classLevel || "",
        board: student.schoolDetails?.board || student.education?.board || "",
        currentClassSectionId: student.classSectionId?.toString(),
      },
    });
  } catch (error: any) {
    if (error?.message === "Student not found") {
      res.status(404).json({
        success: false,
        message: "No EduPye student account found for this email.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error?.message || "Failed to search student",
    });
  }
};

export const getStudentAnalyticsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user._id) {
      res.status(401).json({
        success: false,
        message: "Authentication required to access student analytics.",
      });
      return;
    }

    const analytics = await getStudentAnalyticsData(
      user._id.toString(),
      req.studentProfile?._id?.toString()
    );

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error: any) {
    console.error("getStudentAnalyticsController error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve student analytics",
    });
  }
};

export const recordStudySessionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const user = req.user;
    if (!user || !user._id) {
      res.status(401).json({
        success: false,
        message: "Authentication required to record study session.",
      });
      return;
    }

    const { durationSeconds, activityType, subject, notes } = req.body || {};
    if (!durationSeconds || typeof durationSeconds !== "number" || durationSeconds <= 0) {
      res.status(400).json({
        success: false,
        message: "durationSeconds must be a positive number.",
      });
      return;
    }

    const session = await recordStudentStudySession(user._id.toString(), {
      durationSeconds,
      activityType: activityType || "practice",
      subject: subject || "General",
      notes: notes || "",
    });

    res.status(201).json({
      success: true,
      data: session,
      message: "Study session recorded successfully.",
    });
  } catch (error: any) {
    console.error("recordStudySessionController error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to record study session",
    });
  }
};

