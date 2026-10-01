import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  awardStudentRecognition,
  getStudentRecognitions,
  getClassSectionRecognitions,
  deleteStudentRecognition,
  doesTeacherTeachStudent,
} from "../services/student_recognition_service";
import { getAllStickers } from "../config/stickers";

/**
 * POST /api/student-recognition
 * Teacher awards a sticker to an enrolled student.
 */
export const awardRecognitionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Teacher authentication required to award stickers.",
      });
      return;
    }

    const { studentId, classSectionId, stickerId, description } = req.body;

    if (!studentId || !classSectionId || !stickerId) {
      res.status(400).json({
        success: false,
        message: "studentId, classSectionId, and stickerId are required.",
      });
      return;
    }

    if (
      !mongoose.Types.ObjectId.isValid(studentId) ||
      !mongoose.Types.ObjectId.isValid(classSectionId)
    ) {
      res.status(400).json({
        success: false,
        message: "Invalid studentId or classSectionId format.",
      });
      return;
    }

    const recognition = await awardStudentRecognition({
      teacherProfileId: teacherProfile._id as mongoose.Types.ObjectId,
      studentProfileId: studentId,
      classSectionId,
      stickerId,
      description,
    });

    res.status(201).json({
      success: true,
      message: `Awarded "${recognition.title}" sticker successfully!`,
      data: recognition,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to award recognition";
    const statusCode = message.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * GET /api/student-recognition/student/:studentId
 * Retrieves recognitions for a student.
 * Accessible by:
 * 1. The student themselves
 * 2. An authorized teacher who teaches that student
 */
export const getStudentRecognitionsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { studentId } = req.params;
    const resolvedStudentId = Array.isArray(studentId) ? studentId[0] : studentId;

    if (!resolvedStudentId || !mongoose.Types.ObjectId.isValid(resolvedStudentId)) {
      res.status(400).json({
        success: false,
        message: "Valid studentId is required.",
      });
      return;
    }

    const studentProfile = req.studentProfile;
    const teacherProfile = req.teacherProfile;

    // Authorization check
    if (studentProfile) {
      // Student viewing: only allow viewing their own stickers
      if (studentProfile._id.toString() !== resolvedStudentId) {
        res.status(403).json({
          success: false,
          message: "Unauthorized: You can only view your own recognitions.",
        });
        return;
      }
    } else if (teacherProfile) {
      // Teacher viewing: only allow if teacher teaches this student
      const teachesStudent = await doesTeacherTeachStudent(
        teacherProfile._id as mongoose.Types.ObjectId,
        resolvedStudentId
      );
      if (!teachesStudent) {
        res.status(403).json({
          success: false,
          message: "Unauthorized: You can only view recognitions for students in your assigned classes.",
        });
        return;
      }
    } else {
      res.status(401).json({
        success: false,
        message: "Authentication required to view student recognitions.",
      });
      return;
    }

    const recognitions = await getStudentRecognitions(resolvedStudentId);

    res.status(200).json({
      success: true,
      count: recognitions.length,
      data: recognitions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch student recognitions";
    res.status(500).json({
      success: false,
      message,
    });
  }
};

/**
 * GET /api/student-recognition/class/:classSectionId
 * Retrieves all recognitions awarded in a class section.
 * Authenticated teacher required, and must be authorized for this classSection.
 */
export const getClassRecognitionsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Teacher authentication required.",
      });
      return;
    }

    const { classSectionId } = req.params;
    const resolvedSectionId = Array.isArray(classSectionId) ? classSectionId[0] : classSectionId;

    if (!resolvedSectionId || !mongoose.Types.ObjectId.isValid(resolvedSectionId)) {
      res.status(400).json({
        success: false,
        message: "Valid classSectionId is required.",
      });
      return;
    }

    const recognitions = await getClassSectionRecognitions(
      resolvedSectionId,
      teacherProfile._id as mongoose.Types.ObjectId
    );

    res.status(200).json({
      success: true,
      count: recognitions.length,
      data: recognitions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch class recognitions";
    const statusCode = message.includes("Unauthorized") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * DELETE /api/student-recognition/:id
 * Teacher removes an incorrectly awarded sticker.
 */
export const deleteRecognitionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Teacher authentication required.",
      });
      return;
    }

    const { id } = req.params;
    const resolvedId = Array.isArray(id) ? id[0] : id;

    if (!resolvedId || !mongoose.Types.ObjectId.isValid(resolvedId)) {
      res.status(400).json({
        success: false,
        message: "Valid recognition ID is required.",
      });
      return;
    }

    await deleteStudentRecognition(resolvedId, teacherProfile._id as mongoose.Types.ObjectId);

    res.status(200).json({
      success: true,
      message: "Recognition sticker removed successfully.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete recognition";
    const statusCode = message.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

/**
 * GET /api/student-recognition/stickers
 * Returns the centralized sticker catalog.
 */
export const getStickersCatalogController = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const stickers = getAllStickers();
    res.status(200).json({
      success: true,
      count: stickers.length,
      data: stickers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch sticker catalog";
    res.status(500).json({
      success: false,
      message,
    });
  }
};
