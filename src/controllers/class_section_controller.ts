import { Request, Response } from "express";
import {
  createClassSection,
  listClassSections,
  getClassSectionById,
  enrollStudentInClass,
  removeStudentFromClass,
  getStudentsInClassSection,
  getTeacherClassesWithStudentCount,
  inviteStudentToClass,
} from "../services/class_section_service";

export const createClassSectionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { classLevel, section, board, academicYear, type, name, organizationId } = req.body;
    if (!classLevel) {
      res.status(400).json({ success: false, message: "classLevel is required" });
      return;
    }

    const group = await createClassSection({
      classLevel,
      section: section || "A",
      board: board || "CBSE",
      academicYear,
      type,
      name,
      organizationId,
    });

    res.status(201).json({
      success: true,
      message: "Class section created successfully",
      data: group,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create class section";
    res.status(400).json({ success: false, message });
  }
};

export const listClassSectionsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { classLevel, section, board, academicYear, type, organizationId } = req.query;

    const list = await listClassSections({
      classLevel: typeof classLevel === "string" ? classLevel : undefined,
      section: typeof section === "string" ? section : undefined,
      board: typeof board === "string" ? board : undefined,
      academicYear: typeof academicYear === "string" ? academicYear : undefined,
      type: typeof type === "string" ? (type as any) : undefined,
      organizationId: typeof organizationId === "string" ? organizationId : undefined,
    });

    res.status(200).json({
      success: true,
      data: list,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list class sections";
    res.status(500).json({ success: false, message });
  }
};

export const getClassSectionByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const group = await getClassSectionById(id);
    if (!group) {
      res.status(404).json({ success: false, message: "Class section not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: group,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get class section";
    res.status(500).json({ success: false, message });
  }
};

export const getClassSectionStudentsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const students = await getStudentsInClassSection(id);

    res.status(200).json({
      success: true,
      count: students.length,
      data: students,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch class section students";
    res.status(500).json({ success: false, message });
  }
};

export const enrollStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { studentProfileId, email, classSectionId, rollNumber, academicYear } = req.body;
    if ((!studentProfileId && !email) || !classSectionId) {
      res.status(400).json({
        success: false,
        message: "Student email (or profile ID) and classSectionId are required",
      });
      return;
    }

    const membership = await enrollStudentInClass({
      studentProfileId,
      email,
      classSectionId,
      rollNumber,
      academicYear,
    });

    res.status(201).json({
      success: true,
      message: "Student enrolled in class section successfully",
      data: membership,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enroll student";
    res.status(400).json({ success: false, message });
  }
};

export const inviteStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const classSectionId = req.params.id || req.body.classSectionId;
    const { email, name, rollNumber } = req.body;

    if (!email || !classSectionId) {
      res.status(400).json({
        success: false,
        message: "Email and classSectionId are required",
      });
      return;
    }

    const invitation = await inviteStudentToClass({
      classSectionId,
      email,
      name,
      rollNumber,
      invitedBy: req.teacherProfile?._id,
    });

    res.status(200).json({
      success: true,
      message: "Student invitation registered successfully",
      data: invitation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to invite student";
    res.status(400).json({ success: false, message });
  }
};

export const removeStudentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { studentProfileId, classSectionId } = req.body;
    if (!studentProfileId || !classSectionId) {
      res.status(400).json({
        success: false,
        message: "studentProfileId and classSectionId are required",
      });
      return;
    }

    await removeStudentFromClass(studentProfileId, classSectionId);

    res.status(200).json({
      success: true,
      message: "Student removed from class section",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove student";
    res.status(400).json({ success: false, message });
  }
};

export const getTeacherClassesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const groups = await getTeacherClassesWithStudentCount(teacherProfile._id);

    res.status(200).json({
      success: true,
      data: groups,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch teacher classes";
    res.status(500).json({ success: false, message });
  }
};
