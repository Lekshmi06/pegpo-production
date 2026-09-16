import { IStudentProfile } from "../models/StudentProfile";
import { IUser } from "../models/User";

export interface AcademicContext {
  studentProfileId: string;
  userId: string;
  board: string;
  classLevel: string;
  academicYear: string;
  selectedSubject: string;
  studyMode: string;
  textbookFileName?: string;
  syllabusFileName?: string;
  curriculum?: string;
}

/**
 * Normalizes and resolves academic context from the authenticated student session.
 * Does NOT trust client-supplied academic identity.
 */
export function resolveAcademicContext(
  studentProfile: IStudentProfile,
  user?: IUser,
  overrideSubject?: string
): AcademicContext {
  const board =
    studentProfile.schoolDetails?.board?.trim() ||
    studentProfile.education?.board?.trim() ||
    "State Board";

  const rawClass =
    studentProfile.schoolDetails?.classLevel?.trim() ||
    studentProfile.education?.classLevel?.trim() ||
    "Class 11";

  // Ensure canonical "Class X" representation
  const classLevel = rawClass.startsWith("Class ")
    ? rawClass
    : `Class ${rawClass.replace(/^Class\s*/i, "")}`;

  // Smart subject resolution: if middle school (e.g. Class 7) and full syllabus, default to Basic Science, not Physics
  const isMiddleSchool = /Class\s*[5-8]\b/i.test(classLevel);
  const defaultSubject = isMiddleSchool ? "Basic Science" : "Science";

  const selectedSubject =
    overrideSubject?.trim() ||
    studentProfile.schoolDetails?.selectedSubject?.trim() ||
    studentProfile.schoolDetails?.customSubject?.trim() ||
    defaultSubject;

  const studyMode =
    studentProfile.schoolDetails?.studyMode?.trim() || "specific_subject";

  const textbookFileName =
    studentProfile.schoolDetails?.textbookFileName?.trim() || undefined;

  const syllabusFileName =
    studentProfile.schoolDetails?.syllabusFileName?.trim() ||
    studentProfile.undergraduateDetails?.syllabusFileName?.trim() ||
    studentProfile.postgraduateDetails?.syllabusFileName?.trim() ||
    studentProfile.competitiveExamDetails?.syllabusFileName?.trim() ||
    undefined;

  const academicYear =
    (studentProfile.schoolDetails as any)?.academicYear?.trim() ||
    studentProfile.competitiveExamDetails?.targetYear?.trim() ||
    "2026–2027";

  const curriculum = studentProfile.learningPath || "school";

  return {
    studentProfileId: studentProfile._id.toString(),
    userId: (user?._id || studentProfile.userId).toString(),
    board,
    classLevel,
    academicYear,
    selectedSubject,
    studyMode,
    textbookFileName,
    syllabusFileName,
    curriculum,
  };
}
