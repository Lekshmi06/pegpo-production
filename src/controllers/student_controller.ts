import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  createStudent,
  getStudentById,
  getStudentByEmail,
  updateStudent,
  UpdateStudentData,
} from "../services/student_service";

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

