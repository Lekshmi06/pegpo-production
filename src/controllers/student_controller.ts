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
  "professional",
  "other",
] as const;

const updateableFields = ["name", "phone", "goal", "education", "language"];
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

  for (const field of ["name", "phone", "goal", "language"]) {
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create student";

    if (message.includes("already exists")) {
      const existingProfile = req.body?.email
        ? await getStudentByEmail(req.body.email).catch(() => null)
        : null;

      res.status(409).json({
        success: false,
        message,
        data: existingProfile ? { studentProfile: existingProfile } : undefined,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
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
