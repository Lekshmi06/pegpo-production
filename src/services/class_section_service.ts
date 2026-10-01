import mongoose from "mongoose";
import ClassSection, { IClassSection, AcademicGroupType } from "../models/ClassSection";
import StudentMembership, { IStudentMembership } from "../models/StudentMembership";
import StudentProfile, { IStudentProfile } from "../models/StudentProfile";
import TeachingContext from "../models/TeachingContext";
import ClassInvitation from "../models/ClassInvitation";
import { getStudentByEmail } from "./student_service";

export interface CreateClassSectionData {
  organizationId?: string | mongoose.Types.ObjectId;
  name?: string;
  classLevel: string;
  section: string;
  board?: string;
  academicYear?: string;
  type?: AcademicGroupType;
}

export interface ListClassSectionFilters {
  organizationId?: string;
  classLevel?: string;
  section?: string;
  board?: string;
  academicYear?: string;
  type?: AcademicGroupType;
  isActive?: boolean;
}

/**
 * Format standard display name for class section, e.g. "Class 10 - A"
 */
export function formatClassSectionName(classLevel: string, section: string): string {
  const cleanClass = classLevel.trim();
  const cleanSection = section.trim();
  if (cleanSection) {
    return `${cleanClass} - ${cleanSection}`;
  }
  return cleanClass;
}

/**
 * Creates a new academic group (class / section / batch)
 */
export async function createClassSection(data: CreateClassSectionData): Promise<IClassSection> {
  const classLevel = data.classLevel.trim();
  const section = (data.section || "A").trim();
  const board = (data.board || "CBSE").trim();
  const academicYear = (data.academicYear || "2026-2027").trim();
  const type = data.type || "institution";
  const name = data.name?.trim() || formatClassSectionName(classLevel, section);

  const orgId = data.organizationId && mongoose.Types.ObjectId.isValid(data.organizationId.toString())
    ? new mongoose.Types.ObjectId(data.organizationId.toString())
    : undefined;

  const existing = await ClassSection.findOne({
    organizationId: orgId,
    classLevel,
    section,
    academicYear,
    isActive: true,
  });

  if (existing) {
    return existing;
  }

  const group = await ClassSection.create({
    organizationId: orgId,
    name,
    classLevel,
    section,
    board,
    academicYear,
    type,
    isActive: true,
  });

  return group;
}

/**
 * Finds or creates a ClassSection by level, section, board, and academic year.
 * Used to ensure seamless compatibility when teachers configure teaching contexts.
 */
export async function findOrCreateClassSection(data: CreateClassSectionData): Promise<IClassSection> {
  const classLevel = data.classLevel.trim();
  const section = (data.section || "A").trim();
  const board = (data.board || "CBSE").trim();
  const academicYear = (data.academicYear || "2026-2027").trim();
  const orgId = data.organizationId && mongoose.Types.ObjectId.isValid(data.organizationId.toString())
    ? new mongoose.Types.ObjectId(data.organizationId.toString())
    : undefined;

  const existing = await ClassSection.findOne({
    classLevel: new RegExp(`^${classLevel}$`, "i"),
    section: new RegExp(`^${section}$`, "i"),
    ...(orgId ? { organizationId: orgId } : {}),
    isActive: true,
  });

  if (existing) {
    return existing;
  }

  return createClassSection(data);
}

/**
 * List class sections matching filters
 */
export async function listClassSections(filters: ListClassSectionFilters = {}): Promise<IClassSection[]> {
  const query: Record<string, any> = {};

  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive;
  } else {
    query.isActive = true;
  }

  if (filters.organizationId && mongoose.Types.ObjectId.isValid(filters.organizationId)) {
    query.organizationId = new mongoose.Types.ObjectId(filters.organizationId);
  }

  if (filters.classLevel) {
    query.classLevel = new RegExp(`^${filters.classLevel.trim()}$`, "i");
  }

  if (filters.section) {
    query.section = new RegExp(`^${filters.section.trim()}$`, "i");
  }

  if (filters.board) {
    query.board = new RegExp(`^${filters.board.trim()}$`, "i");
  }

  if (filters.academicYear) {
    query.academicYear = filters.academicYear.trim();
  }

  if (filters.type) {
    query.type = filters.type;
  }

  return ClassSection.find(query).sort({ classLevel: 1, section: 1 }).lean();
}

/**
 * Get class section by ID
 */
export async function getClassSectionById(id: string): Promise<IClassSection | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return ClassSection.findById(id).lean();
}

/**
 * Enrolls a student in a class section, creating or activating StudentMembership.
 * Supports enrollment via either studentProfileId or student email.
 * Prevents duplicate active enrollment and rejects with explicit section name error.
 */
export async function enrollStudentInClass(data: {
  studentProfileId?: string | mongoose.Types.ObjectId;
  email?: string;
  classSectionId: string | mongoose.Types.ObjectId;
  rollNumber?: string;
  academicYear?: string;
}): Promise<IStudentMembership> {
  let profileId: mongoose.Types.ObjectId;

  if (data.studentProfileId && mongoose.Types.ObjectId.isValid(data.studentProfileId.toString())) {
    profileId = new mongoose.Types.ObjectId(data.studentProfileId.toString());
  } else if (data.email && data.email.trim()) {
    const student = await getStudentByEmail(data.email.trim().toLowerCase());
    profileId = new mongoose.Types.ObjectId(student._id.toString());
  } else {
    throw new Error("Student email or profile ID is required for enrollment");
  }

  const sectionId = new mongoose.Types.ObjectId(data.classSectionId.toString());

  const section = await ClassSection.findById(sectionId);
  if (!section) {
    throw new Error("Class section not found");
  }

  const sectionName = section.name || `${section.classLevel} - ${section.section}`;
  const academicYear = data.academicYear || section.academicYear || "2026-2027";

  // Prevent duplicate enrollment if already active in this section
  const existingActive = await StudentMembership.findOne({
    studentProfileId: profileId,
    classSectionId: sectionId,
    isActive: true,
  });

  if (existingActive) {
    throw new Error(`Student is already enrolled in ${sectionName}.`);
  }

  // Check if an inactive membership exists for this academic year
  let membership = await StudentMembership.findOne({
    studentProfileId: profileId,
    classSectionId: sectionId,
    academicYear,
  });

  if (membership) {
    membership.isActive = true;
    if (data.rollNumber !== undefined) membership.rollNumber = data.rollNumber;
    await membership.save();
  } else {
    membership = await StudentMembership.create({
      studentProfileId: profileId,
      classSectionId: sectionId,
      rollNumber: data.rollNumber || "",
      academicYear,
      isActive: true,
      joinedAt: new Date(),
    });
  }

  // Mark any pending invitation for this email & class as accepted
  const studentDoc = await StudentProfile.findById(profileId).populate("userId", "email");
  const studentEmail = (studentDoc?.userId as any)?.email;
  if (studentEmail) {
    await ClassInvitation.updateMany(
      { classSectionId: sectionId, email: studentEmail.toLowerCase(), status: "pending" },
      { status: "accepted" }
    );
  }

  // Update primary student profile with current class section and type
  const targetStudentType = section.type === "tuition" ? "tuition" : "institution";
  await StudentProfile.findByIdAndUpdate(profileId, {
    classSectionId: sectionId,
    studentType: targetStudentType,
    ...(section.organizationId ? { organizationId: section.organizationId } : {}),
    "education.classLevel": section.classLevel,
    "education.board": section.board,
    "schoolDetails.classLevel": section.classLevel,
    "schoolDetails.board": section.board,
  });

  return membership;
}

/**
 * Creates or updates an invitation for a non-existent student email to join a class
 */
export async function inviteStudentToClass(data: {
  classSectionId: string | mongoose.Types.ObjectId;
  email: string;
  name?: string;
  rollNumber?: string;
  invitedBy?: string | mongoose.Types.ObjectId;
}) {
  const sectionId = new mongoose.Types.ObjectId(data.classSectionId.toString());
  const section = await ClassSection.findById(sectionId);
  if (!section) {
    throw new Error("Class section not found");
  }

  const email = data.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required for invitation");
  }

  const invitation = await ClassInvitation.findOneAndUpdate(
    { classSectionId: sectionId, email },
    {
      classSectionId: sectionId,
      email,
      name: data.name?.trim() || "",
      rollNumber: data.rollNumber?.trim() || "",
      invitedBy: data.invitedBy ? new mongoose.Types.ObjectId(data.invitedBy.toString()) : undefined,
      status: "pending",
    },
    { upsert: true, new: true }
  );

  return invitation;
}

/**
 * Deactivates student membership in a class section
 */
export async function removeStudentFromClass(
  studentProfileId: string | mongoose.Types.ObjectId,
  classSectionId: string | mongoose.Types.ObjectId
): Promise<boolean> {
  const profileId = new mongoose.Types.ObjectId(studentProfileId.toString());
  const sectionId = new mongoose.Types.ObjectId(classSectionId.toString());

  const res = await StudentMembership.updateOne(
    { studentProfileId: profileId, classSectionId: sectionId },
    { isActive: false }
  );

  return res.modifiedCount > 0;
}

/**
 * Returns all students enrolled in a class section
 */
export async function getStudentsInClassSection(classSectionId: string | mongoose.Types.ObjectId) {
  const sectionId = new mongoose.Types.ObjectId(classSectionId.toString());

  const memberships = await StudentMembership.find({
    classSectionId: sectionId,
    isActive: true,
  })
    .populate({
      path: "studentProfileId",
      select: "name avatar phone studentType education schoolDetails userId",
      populate: {
        path: "userId",
        select: "email",
      },
    })
    .sort({ rollNumber: 1, createdAt: 1 })
    .lean();

  return memberships.map((m) => {
    const profile = m.studentProfileId as any;
    return {
      membershipId: m._id,
      rollNumber: m.rollNumber,
      academicYear: m.academicYear,
      joinedAt: m.joinedAt,
      studentProfileId: profile?._id,
      name: profile?.name || "Student",
      email: profile?.userId?.email,
      phone: profile?.phone,
      avatar: profile?.avatar,
      studentType: profile?.studentType || "institution",
      classLevel: profile?.education?.classLevel || profile?.schoolDetails?.classLevel,
    };
  });
}

/**
 * Returns all active ClassSection IDs for a given student
 */
export async function getStudentClassSectionIds(
  studentProfileId: string | mongoose.Types.ObjectId
): Promise<mongoose.Types.ObjectId[]> {
  const profileId = new mongoose.Types.ObjectId(studentProfileId.toString());

  const memberships = await StudentMembership.find({
    studentProfileId: profileId,
    isActive: true,
  })
    .select("classSectionId")
    .lean();

  const ids = memberships.map((m) => m.classSectionId);

  // Fallback: check profile.classSectionId if membership collection not populated yet
  if (ids.length === 0) {
    const profile = await StudentProfile.findById(profileId).select("classSectionId").lean();
    if (profile?.classSectionId) {
      ids.push(profile.classSectionId as mongoose.Types.ObjectId);
    }
  }

  return ids;
}

export interface TeacherClassGroupSummary {
  classSectionId: string;
  name: string;
  classLevel: string;
  section: string;
  subject: string;
  board: string;
  academicYear: string;
  studentCount: number;
  teachingContextId: string;
}

/**
 * Resolves teacher's classes from their TeachingContexts, including student count for each group.
 */
export async function getTeacherClassesWithStudentCount(
  teacherProfileId: string | mongoose.Types.ObjectId
): Promise<TeacherClassGroupSummary[]> {
  const teacherId = new mongoose.Types.ObjectId(teacherProfileId.toString());

  const contexts = await TeachingContext.find({
    teacherId,
    isArchived: false,
  }).lean();

  const groupsMap = new Map<string, TeacherClassGroupSummary>();

  for (const ctx of contexts) {
    let classSection: IClassSection | null = null;

    if (ctx.classSectionId) {
      classSection = await ClassSection.findById(ctx.classSectionId).lean();
    }

    if (!classSection) {
      // Find or auto-create corresponding class section for legacy context
      classSection = await findOrCreateClassSection({
        classLevel: ctx.classLevel,
        section: ctx.section || "A",
        board: ctx.curriculumBoard || "CBSE",
        academicYear: ctx.academicYear || "2026-2027",
        type: ctx.contextType === "tuition" ? "tuition" : "institution",
      });

      // Link it back to the teaching context for fast indexing
      await TeachingContext.findByIdAndUpdate(ctx._id, {
        classSectionId: classSection._id,
      });
    }

    const sectionIdStr = classSection._id.toString();
    const count = await StudentMembership.countDocuments({
      classSectionId: classSection._id,
      isActive: true,
    });

    const key = `${sectionIdStr}-${ctx.subject}`;

    groupsMap.set(key, {
      classSectionId: sectionIdStr,
      name: classSection.name || formatClassSectionName(classSection.classLevel, classSection.section),
      classLevel: classSection.classLevel,
      section: classSection.section,
      subject: ctx.subject,
      board: classSection.board,
      academicYear: classSection.academicYear,
      studentCount: count,
      teachingContextId: ctx._id.toString(),
    });
  }

  return Array.from(groupsMap.values());
}
