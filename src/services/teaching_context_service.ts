import mongoose from "mongoose";
import TeachingContext, {
  ITeachingContext,
  ContextType,
} from "../models/TeachingContext";
import { findOrCreateClassSection } from "./class_section_service";
import ClassSection from "../models/ClassSection";

export interface CreateContextData {
  contextType?: ContextType;
  classSectionId?: string | mongoose.Types.ObjectId;
  organizationId?: string | mongoose.Types.ObjectId;
  institution?: string;
  tuitionCentre?: string;
  classLevel: string;
  section?: string;
  subject: string;
  curriculumBoard?: string;
  academicYear?: string;
}

export interface UpdateContextData {
  contextType?: ContextType;
  classSectionId?: string | mongoose.Types.ObjectId;
  organizationId?: string | mongoose.Types.ObjectId;
  institution?: string;
  tuitionCentre?: string;
  classLevel?: string;
  section?: string;
  subject?: string;
  curriculumBoard?: string;
  academicYear?: string;
  isArchived?: boolean;
}

export const createTeachingContext = async (
  teacherId: string | mongoose.Types.ObjectId,
  data: CreateContextData
): Promise<ITeachingContext> => {
  let resolvedClassLevel = data.classLevel?.trim();
  let resolvedSection = data.section?.trim() || "";
  let resolvedBoard = data.curriculumBoard?.trim() || "CBSE";
  let resolvedAcademicYear = data.academicYear?.trim() || "2026-2027";
  let resolvedClassSectionId: mongoose.Types.ObjectId | undefined;

  if (data.classSectionId && mongoose.Types.ObjectId.isValid(data.classSectionId.toString())) {
    resolvedClassSectionId = new mongoose.Types.ObjectId(data.classSectionId.toString());
    const cs = await ClassSection.findById(resolvedClassSectionId);
    if (cs) {
      resolvedClassLevel = resolvedClassLevel || cs.classLevel;
      resolvedSection = resolvedSection || cs.section;
      resolvedBoard = resolvedBoard || cs.board;
      resolvedAcademicYear = resolvedAcademicYear || cs.academicYear;
    }
  }

  if (!resolvedClassLevel) {
    throw new Error("classLevel is required");
  }
  if (!data.subject?.trim()) {
    throw new Error("subject is required");
  }

  if (!resolvedClassSectionId) {
    const cs = await findOrCreateClassSection({
      classLevel: resolvedClassLevel,
      section: resolvedSection || "A",
      board: resolvedBoard,
      academicYear: resolvedAcademicYear,
      type: data.contextType === "tuition" ? "tuition" : "institution",
      organizationId: data.organizationId,
    });
    resolvedClassSectionId = cs._id as mongoose.Types.ObjectId;
  }

  const context = await TeachingContext.create({
    teacherId,
    classSectionId: resolvedClassSectionId,
    organizationId: data.organizationId && mongoose.Types.ObjectId.isValid(data.organizationId.toString())
      ? new mongoose.Types.ObjectId(data.organizationId.toString())
      : undefined,
    contextType: data.contextType || "institution",
    institution: data.institution?.trim(),
    tuitionCentre: data.tuitionCentre?.trim(),
    classLevel: resolvedClassLevel,
    section: resolvedSection,
    subject: data.subject.trim(),
    curriculumBoard: resolvedBoard,
    academicYear: resolvedAcademicYear,
    isArchived: false,
  });

  return context;
};

export const getTeachingContextsByTeacher = async (
  teacherId: string | mongoose.Types.ObjectId
): Promise<ITeachingContext[]> => {
  return TeachingContext.find({
    teacherId,
    isArchived: false,
  })
    .populate("classSectionId", "name classLevel section board academicYear type")
    .sort({ createdAt: -1 })
    .lean();
};

export const getTeachingContextById = async (
  contextId: string,
  teacherId: string | mongoose.Types.ObjectId
): Promise<ITeachingContext> => {
  const context = await TeachingContext.findById(contextId).populate(
    "classSectionId",
    "name classLevel section board academicYear type"
  );
  if (!context) {
    throw new Error("Teaching context not found");
  }

  if (context.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  return context;
};

export const updateTeachingContext = async (
  contextId: string,
  teacherId: string | mongoose.Types.ObjectId,
  data: UpdateContextData
): Promise<ITeachingContext> => {
  const context = await TeachingContext.findById(contextId);
  if (!context) {
    throw new Error("Teaching context not found");
  }

  if (context.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  if (data.contextType !== undefined) context.contextType = data.contextType;
  if (data.institution !== undefined) context.institution = data.institution.trim();
  if (data.tuitionCentre !== undefined) context.tuitionCentre = data.tuitionCentre.trim();
  if (data.classLevel !== undefined) context.classLevel = data.classLevel.trim();
  if (data.section !== undefined) context.section = data.section.trim();
  if (data.subject !== undefined) context.subject = data.subject.trim();
  if (data.curriculumBoard !== undefined) context.curriculumBoard = data.curriculumBoard.trim();
  if (data.academicYear !== undefined) context.academicYear = data.academicYear.trim();
  if (data.isArchived !== undefined) context.isArchived = data.isArchived;

  if (data.classSectionId && mongoose.Types.ObjectId.isValid(data.classSectionId.toString())) {
    context.classSectionId = new mongoose.Types.ObjectId(data.classSectionId.toString());
  } else if (data.classLevel || data.section) {
    const cs = await findOrCreateClassSection({
      classLevel: context.classLevel,
      section: context.section || "A",
      board: context.curriculumBoard,
      academicYear: context.academicYear,
      type: context.contextType === "tuition" ? "tuition" : "institution",
    });
    context.classSectionId = cs._id as mongoose.Types.ObjectId;
  }

  await context.save();
  return context;
};
