import { IStudentProfile } from "../models/StudentProfile";
import { IUser } from "../models/User";

export interface AcademicContext {
  studentProfileId: string;
  userId: string;
  board: string;
  classLevel: string;
  selectedSubject: string;
  studyMode: string;
  textbookFileName?: string;
  curriculum?: string;
}

/**
 * Normalizes and resolves academic context from the authenticated student session.
 * Does NOT trust client-supplied academic identity.
 */
export function resolveAcademicContext(
  studentProfile: IStudentProfile,
  user?: IUser
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

  const selectedSubject =
    studentProfile.schoolDetails?.selectedSubject?.trim() ||
    studentProfile.schoolDetails?.customSubject?.trim() ||
    "Physics";

  const studyMode =
    studentProfile.schoolDetails?.studyMode?.trim() || "specific_subject";

  const textbookFileName =
    studentProfile.schoolDetails?.textbookFileName?.trim() || undefined;

  const curriculum = studentProfile.learningPath || "school";

  return {
    studentProfileId: studentProfile._id.toString(),
    userId: (user?._id || studentProfile.userId).toString(),
    board,
    classLevel,
    selectedSubject,
    studyMode,
    textbookFileName,
    curriculum,
  };
}
