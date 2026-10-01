import mongoose from "mongoose";
import StudentRecognition, { IStudentRecognition } from "../models/StudentRecognition";
import ClassSection from "../models/ClassSection";
import StudentMembership from "../models/StudentMembership";
import StudentProfile from "../models/StudentProfile";
import TeachingContext from "../models/TeachingContext";
import { getStickerById } from "../config/stickers";

export interface AwardStickerInput {
  teacherProfileId: string | mongoose.Types.ObjectId;
  studentProfileId: string | mongoose.Types.ObjectId;
  classSectionId: string | mongoose.Types.ObjectId;
  stickerId: string;
  description?: string;
}

/**
 * Verifies that a teacher is assigned / authorized to teach a given ClassSection.
 * Strictly enforces Class/Section isolation.
 */
export async function isTeacherAuthorizedForClassSection(
  teacherProfileId: string | mongoose.Types.ObjectId,
  classSectionId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  const teacherId = new mongoose.Types.ObjectId(teacherProfileId.toString());
  const sectionId = new mongoose.Types.ObjectId(classSectionId.toString());

  // Direct check: active TeachingContext with explicit classSectionId link
  const directContext = await TeachingContext.findOne({
    teacherId,
    classSectionId: sectionId,
    isArchived: false,
  });

  if (directContext) {
    return true;
  }

  // Fallback: check if the teacher has a TeachingContext matching classLevel & section
  const section = await ClassSection.findById(sectionId);
  if (!section) {
    return false;
  }

  const matchingContext = await TeachingContext.findOne({
    teacherId,
    classLevel: new RegExp(`^${section.classLevel.trim()}$`, "i"),
    section: new RegExp(`^${section.section.trim()}$`, "i"),
    isArchived: false,
  });

  if (matchingContext) {
    // Auto-link classSectionId for future fast index lookup
    await TeachingContext.findByIdAndUpdate(matchingContext._id, {
      classSectionId: section._id,
    });
    return true;
  }

  return false;
}

/**
 * Verifies that a student is actively enrolled in the specified ClassSection.
 */
export async function isStudentEnrolledInClassSection(
  studentProfileId: string | mongoose.Types.ObjectId,
  classSectionId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  const studentId = new mongoose.Types.ObjectId(studentProfileId.toString());
  const sectionId = new mongoose.Types.ObjectId(classSectionId.toString());

  // 1. Check active membership in StudentMembership collection
  const membership = await StudentMembership.findOne({
    studentProfileId: studentId,
    classSectionId: sectionId,
    isActive: true,
  });

  if (membership) {
    return true;
  }

  // 2. Fallback: check legacy classSectionId on StudentProfile
  const profile = await StudentProfile.findOne({
    _id: studentId,
    classSectionId: sectionId,
  });

  return Boolean(profile);
}

/**
 * Verifies if a teacher teaches any common class with a student.
 */
export async function doesTeacherTeachStudent(
  teacherProfileId: string | mongoose.Types.ObjectId,
  studentProfileId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  const teacherId = new mongoose.Types.ObjectId(teacherProfileId.toString());
  const studentId = new mongoose.Types.ObjectId(studentProfileId.toString());

  // Find all active class sections for teacher
  const contexts = await TeachingContext.find({
    teacherId,
    isArchived: false,
  }).lean();

  const teacherClassSectionIds: mongoose.Types.ObjectId[] = [];
  for (const ctx of contexts) {
    if (ctx.classSectionId) {
      teacherClassSectionIds.push(ctx.classSectionId as mongoose.Types.ObjectId);
    } else {
      const matched = await ClassSection.findOne({
        classLevel: new RegExp(`^${ctx.classLevel.trim()}$`, "i"),
        section: new RegExp(`^${ctx.section?.trim() || "A"}$`, "i"),
        isActive: true,
      });
      if (matched) {
        teacherClassSectionIds.push(matched._id as mongoose.Types.ObjectId);
      }
    }
  }

  if (teacherClassSectionIds.length === 0) {
    return false;
  }

  // Check if student has active membership in any of these sections
  const count = await StudentMembership.countDocuments({
    studentProfileId: studentId,
    classSectionId: { $in: teacherClassSectionIds },
    isActive: true,
  });

  return count > 0;
}

/**
 * Awards a recognition sticker to an enrolled student.
 * Validates teacher authorization and student enrollment.
 */
export async function awardStudentRecognition(
  input: AwardStickerInput
): Promise<IStudentRecognition> {
  const teacherId = new mongoose.Types.ObjectId(input.teacherProfileId.toString());
  const studentId = new mongoose.Types.ObjectId(input.studentProfileId.toString());
  const classSectionId = new mongoose.Types.ObjectId(input.classSectionId.toString());

  // 1. Verify Sticker exists in catalog
  const stickerDef = getStickerById(input.stickerId);
  if (!stickerDef) {
    throw new Error(`Invalid sticker ID: "${input.stickerId}". Please select a valid sticker.`);
  }

  // 2. Verify Teacher is authorized for this ClassSection
  const isTeacherAuth = await isTeacherAuthorizedForClassSection(teacherId, classSectionId);
  if (!isTeacherAuth) {
    throw new Error("Unauthorized: You are not assigned to teach this class section.");
  }

  // 3. Verify Student is actively enrolled in this ClassSection
  const isEnrolled = await isStudentEnrolledInClassSection(studentId, classSectionId);
  if (!isEnrolled) {
    throw new Error("Student is not enrolled in the specified class section.");
  }

  // 4. Create recognition document
  const recognition = await StudentRecognition.create({
    teacherId,
    studentId,
    classSectionId,
    stickerId: stickerDef.id,
    title: stickerDef.title,
    icon: stickerDef.icon,
    description: input.description?.trim() || stickerDef.description,
    awardedAt: new Date(),
    metadata: {
      category: stickerDef.category,
      color: stickerDef.color,
      bgColor: stickerDef.bgColor,
      borderColor: stickerDef.borderColor,
      textColor: stickerDef.textColor,
    },
  });

  // Populate teacher and class details for immediate frontend display
  await recognition.populate([
    { path: "teacherId", select: "name avatar institution designation" },
    { path: "studentId", select: "name avatar email" },
    { path: "classSectionId", select: "name classLevel section board academicYear" },
  ]);

  return recognition;
}

/**
 * Retrieves all recognitions awarded to a student.
 */
export async function getStudentRecognitions(
  studentProfileId: string | mongoose.Types.ObjectId
): Promise<IStudentRecognition[]> {
  const studentId = new mongoose.Types.ObjectId(studentProfileId.toString());

  const recognitions = await StudentRecognition.find({ studentId })
    .sort({ awardedAt: -1, createdAt: -1 })
    .populate({
      path: "teacherId",
      select: "name avatar institution designation",
    })
    .populate({
      path: "classSectionId",
      select: "name classLevel section board academicYear",
    })
    .lean();

  return recognitions as unknown as IStudentRecognition[];
}

/**
 * Retrieves all recognitions awarded within a class section.
 * Verifies teacher access before returning.
 */
export async function getClassSectionRecognitions(
  classSectionId: string | mongoose.Types.ObjectId,
  teacherProfileId: string | mongoose.Types.ObjectId
): Promise<IStudentRecognition[]> {
  const sectionId = new mongoose.Types.ObjectId(classSectionId.toString());
  const teacherId = new mongoose.Types.ObjectId(teacherProfileId.toString());

  const isTeacherAuth = await isTeacherAuthorizedForClassSection(teacherId, sectionId);
  if (!isTeacherAuth) {
    throw new Error("Unauthorized: You do not have permission to view recognitions for this class.");
  }

  const recognitions = await StudentRecognition.find({ classSectionId: sectionId })
    .sort({ awardedAt: -1, createdAt: -1 })
    .populate({
      path: "studentId",
      select: "name avatar email",
    })
    .populate({
      path: "teacherId",
      select: "name avatar institution designation",
    })
    .populate({
      path: "classSectionId",
      select: "name classLevel section board academicYear",
    })
    .lean();

  return recognitions as unknown as IStudentRecognition[];
}

/**
 * Deletes an incorrectly awarded recognition.
 * Allowed only for the teacher who awarded it or the teacher authorized for that class.
 */
export async function deleteStudentRecognition(
  recognitionId: string | mongoose.Types.ObjectId,
  teacherProfileId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  const recId = new mongoose.Types.ObjectId(recognitionId.toString());
  const teacherId = new mongoose.Types.ObjectId(teacherProfileId.toString());

  const recognition = await StudentRecognition.findById(recId);
  if (!recognition) {
    throw new Error("Recognition record not found.");
  }

  // Teacher who awarded it can delete it
  const isAwardingTeacher = recognition.teacherId.equals(teacherId);
  if (!isAwardingTeacher) {
    // Or check if the teacher is authorized for the classSection
    const isAuthForClass = await isTeacherAuthorizedForClassSection(
      teacherId,
      recognition.classSectionId
    );
    if (!isAuthForClass) {
      throw new Error("Unauthorized: You cannot delete a recognition you did not award.");
    }
  }

  await StudentRecognition.findByIdAndDelete(recId);
  return true;
}
