import mongoose from "mongoose";
import Department, { IDepartment } from "../models/Department";
import TrainingProgram, { ITrainingProgram } from "../models/TrainingProgram";
import InstitutionMembership, { IInstitutionMembership } from "../models/InstitutionMembership";
import Institution, { IInstitution } from "../models/Institution";
import Course, { ICourse } from "../models/Course";
import Enrollment, { IEnrollment } from "../models/Enrollment";
import User, { IUser } from "../models/User";

// ==========================================
// 1. DASHBOARD & METRICS
// ==========================================

export async function getCorporateDashboardMetrics(institutionId: string) {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);

  const institution = await Institution.findById(instObjectId);
  if (!institution) {
    const error: any = new Error("Company not found.");
    error.statusCode = 404;
    throw error;
  }

  const [
    totalEmployees,
    totalManagers,
    totalTrainers,
    totalAdmins,
    onboardingCompleted,
    onboardingInProgress,
    onboardingNotStarted,
    totalDepartments,
    totalPrograms,
    recentEmployees,
    recentPrograms,
  ] = await Promise.all([
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "trainee",
      status: "active",
    }),
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "subadmin",
      status: "active",
    }),
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "trainer",
      status: "active",
    }),
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "admin",
      status: "active",
    }),
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "trainee",
      onboardingStatus: "completed",
    }),
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "trainee",
      onboardingStatus: "in_progress",
    }),
    InstitutionMembership.countDocuments({
      institutionId: instObjectId,
      role: "trainee",
      onboardingStatus: "not_started",
    }),
    Department.countDocuments({ institutionId: instObjectId }),
    TrainingProgram.countDocuments({ institutionId: instObjectId, status: "active" }),
    InstitutionMembership.find({ institutionId: instObjectId, status: "active" })
      .sort({ createdAt: -1 })
      .limit(6)
      .populate<{ userId: IUser }>("userId", "name email userType")
      .populate<{ managerId: IUser }>("managerId", "name email"),
    TrainingProgram.find({ institutionId: instObjectId, status: "active" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate<{ "courses.courseId": ICourse }>("courses.courseId", "title category totalLessons"),
  ]);

  // Compute total enrollments across all company members
  const memberUserIds = await InstitutionMembership.find({
    institutionId: instObjectId,
    status: "active",
  }).distinct("userId");

  const totalEnrollments = await Enrollment.countDocuments({
    learner: { $in: memberUserIds },
  });

  const totalStaff = totalEmployees + totalManagers + totalTrainers + totalAdmins;
  const completionRate =
    totalEmployees > 0 ? Math.round((onboardingCompleted / totalEmployees) * 100) : 0;

  return {
    company: {
      _id: institution._id,
      name: institution.name,
      slug: institution.slug,
      institutionType: institution.institutionType,
      logo: institution.logo,
      description: institution.description,
      contactEmail: institution.contactEmail,
      contactPhone: institution.contactPhone,
      website: institution.website,
      settings: institution.settings,
    },
    workforce: {
      totalStaff,
      totalEmployees,
      totalManagers,
      totalTrainers,
      totalAdmins,
      totalDepartments,
    },
    onboarding: {
      completed: onboardingCompleted,
      inProgress: onboardingInProgress,
      notStarted: onboardingNotStarted,
      completionRate,
    },
    training: {
      totalPrograms,
      totalEnrollments,
    },
    recentEmployees,
    recentPrograms,
  };
}

// ==========================================
// 2. DEPARTMENT CRUD
// ==========================================

export async function getDepartments(institutionId: string): Promise<IDepartment[]> {
  const depts = await Department.find({ institutionId: new mongoose.Types.ObjectId(institutionId) })
    .populate<{ headId: IUser }>("headId", "name email")
    .sort({ name: 1 });
  return depts as any;
}

export async function createDepartment(
  institutionId: string,
  data: {
    name: string;
    description?: string;
    headId?: string;
    teams?: string[];
  }
): Promise<IDepartment> {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);
  const trimmedName = data.name.trim();

  const existing = await Department.findOne({
    institutionId: instObjectId,
    name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
  });

  if (existing) {
    const error: any = new Error(`Department '${trimmedName}' already exists in this company.`);
    error.statusCode = 409;
    throw error;
  }

  const dept = await Department.create({
    institutionId: instObjectId,
    name: trimmedName,
    description: data.description?.trim(),
    headId: data.headId ? new mongoose.Types.ObjectId(data.headId) : undefined,
    teams: Array.isArray(data.teams) ? data.teams.map((t) => t.trim()).filter(Boolean) : [],
  });

  await dept.populate<{ headId: IUser }>("headId", "name email");
  return dept;
}

export async function updateDepartment(
  institutionId: string,
  departmentId: string,
  data: {
    name?: string;
    description?: string;
    headId?: string;
    teams?: string[];
  }
): Promise<IDepartment> {
  const dept = await Department.findOne({
    _id: new mongoose.Types.ObjectId(departmentId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  });

  if (!dept) {
    const error: any = new Error("Department not found in this company.");
    error.statusCode = 404;
    throw error;
  }

  if (data.name !== undefined && data.name.trim() !== dept.name) {
    const trimmed = data.name.trim();
    const duplicate = await Department.findOne({
      institutionId: dept.institutionId,
      name: { $regex: new RegExp(`^${trimmed}$`, "i") },
      _id: { $ne: dept._id },
    });
    if (duplicate) {
      const error: any = new Error(`Department '${trimmed}' already exists.`);
      error.statusCode = 409;
      throw error;
    }
    dept.name = trimmed;
  }

  if (data.description !== undefined) dept.description = data.description.trim();
  if (data.headId !== undefined) {
    dept.headId = data.headId ? new mongoose.Types.ObjectId(data.headId) : undefined;
  }
  if (data.teams !== undefined) {
    dept.teams = Array.isArray(data.teams) ? data.teams.map((t) => t.trim()).filter(Boolean) : [];
  }

  await dept.save();
  await dept.populate<{ headId: IUser }>("headId", "name email");
  return dept;
}

export async function deleteDepartment(
  institutionId: string,
  departmentId: string
): Promise<{ success: boolean; message: string }> {
  const dept = await Department.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(departmentId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  });

  if (!dept) {
    const error: any = new Error("Department not found.");
    error.statusCode = 404;
    throw error;
  }

  return { success: true, message: `Department '${dept.name}' deleted successfully.` };
}

// ==========================================
// 3. TRAINING PROGRAMS & COURSE ASSIGNMENTS
// ==========================================

export async function getTrainingPrograms(
  institutionId: string,
  filter?: { status?: string; category?: string; search?: string }
): Promise<ITrainingProgram[]> {
  const query: Record<string, any> = {
    institutionId: new mongoose.Types.ObjectId(institutionId),
  };

  if (filter?.status && filter.status !== "all") {
    query.status = filter.status;
  }
  if (filter?.category && filter.category !== "all") {
    query.category = filter.category;
  }
  if (filter?.search && filter.search.trim()) {
    query.title = { $regex: filter.search.trim(), $options: "i" };
  }

  const progs = await TrainingProgram.find(query)
    .populate<{ "courses.courseId": ICourse }>(
      "courses.courseId",
      "title slug category level price thumbnail totalLessons totalDurationMinutes"
    )
    .populate<{ createdBy: IUser }>("createdBy", "name email")
    .sort({ createdAt: -1 });

  return progs as any;
}

export async function getTrainingProgramById(
  institutionId: string,
  programId: string
): Promise<ITrainingProgram> {
  const program = await TrainingProgram.findOne({
    _id: new mongoose.Types.ObjectId(programId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  })
    .populate<{ "courses.courseId": ICourse }>(
      "courses.courseId",
      "title slug category level price thumbnail totalLessons totalDurationMinutes sections"
    )
    .populate<{ assignedEmployees: IUser[] }>("assignedEmployees", "name email userType")
    .populate<{ createdBy: IUser }>("createdBy", "name email");

  if (!program) {
    const error: any = new Error("Training Program not found in this company.");
    error.statusCode = 404;
    throw error;
  }

  return program as any;
}

/**
 * Creates a new Training Program and automatically enrolls assigned employees into the program's courses.
 */
export async function createTrainingProgram(
  institutionId: string,
  creatorUserId: string,
  data: {
    title: string;
    description?: string;
    category?: string;
    courses: Array<{ courseId: string; isRequired?: boolean; order?: number }>;
    assignedEmployees?: string[];
    assignedDepartments?: string[];
    dueDate?: Date;
    estimatedDurationHours?: number;
    status?: "draft" | "active" | "archived";
  }
): Promise<ITrainingProgram> {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);

  // Validate courses exist
  const courseIds = (data.courses || []).map((c) => new mongoose.Types.ObjectId(c.courseId));
  const validCourses = await Course.find({ _id: { $in: courseIds } });

  const formattedCourses = validCourses.map((c, idx) => {
    const original = data.courses.find((item) => item.courseId.toString() === c._id.toString());
    return {
      courseId: c._id,
      isRequired: original?.isRequired !== undefined ? original.isRequired : true,
      order: original?.order !== undefined ? original.order : idx,
    };
  });

  // Collect target employee IDs
  let targetEmployeeUserIds: mongoose.Types.ObjectId[] = [];
  if (Array.isArray(data.assignedEmployees) && data.assignedEmployees.length > 0) {
    targetEmployeeUserIds = data.assignedEmployees.map((id) => new mongoose.Types.ObjectId(id));
  }

  // If departments are assigned, resolve employees in those departments
  if (Array.isArray(data.assignedDepartments) && data.assignedDepartments.length > 0) {
    const deptMembers = await InstitutionMembership.find({
      institutionId: instObjectId,
      department: { $in: data.assignedDepartments },
      status: "active",
    }).distinct("userId");

    for (const dUserId of deptMembers) {
      if (!targetEmployeeUserIds.some((id) => id.equals(dUserId))) {
        targetEmployeeUserIds.push(dUserId);
      }
    }
  }

  const program = await TrainingProgram.create({
    institutionId: instObjectId,
    title: data.title.trim(),
    description: data.description?.trim(),
    category: data.category?.trim() || "Onboarding",
    courses: formattedCourses,
    assignedEmployees: targetEmployeeUserIds,
    assignedDepartments: data.assignedDepartments || [],
    dueDate: data.dueDate,
    estimatedDurationHours: data.estimatedDurationHours || 0,
    status: data.status || "active",
    createdBy: new mongoose.Types.ObjectId(creatorUserId),
  });

  // Auto-provision enrollments for assigned employees into program courses
  await autoProvisionCourseEnrollments(targetEmployeeUserIds, courseIds);

  await program.populate<{ "courses.courseId": ICourse }>(
    "courses.courseId",
    "title slug category level price thumbnail totalLessons"
  );
  await program.populate<{ createdBy: IUser }>("createdBy", "name email");

  return program;
}

export async function updateTrainingProgram(
  institutionId: string,
  programId: string,
  data: {
    title?: string;
    description?: string;
    category?: string;
    courses?: Array<{ courseId: string; isRequired?: boolean; order?: number }>;
    assignedEmployees?: string[];
    assignedDepartments?: string[];
    dueDate?: Date;
    estimatedDurationHours?: number;
    status?: "draft" | "active" | "archived";
  }
): Promise<ITrainingProgram> {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);
  const program = await TrainingProgram.findOne({
    _id: new mongoose.Types.ObjectId(programId),
    institutionId: instObjectId,
  });

  if (!program) {
    const error: any = new Error("Training Program not found.");
    error.statusCode = 404;
    throw error;
  }

  if (data.title !== undefined) program.title = data.title.trim();
  if (data.description !== undefined) program.description = data.description.trim();
  if (data.category !== undefined) program.category = data.category.trim();
  if (data.dueDate !== undefined) program.dueDate = data.dueDate;
  if (data.estimatedDurationHours !== undefined)
    program.estimatedDurationHours = data.estimatedDurationHours;
  if (data.status !== undefined) program.status = data.status;

  if (Array.isArray(data.courses)) {
    const courseIds = data.courses.map((c) => new mongoose.Types.ObjectId(c.courseId));
    const validCourses = await Course.find({ _id: { $in: courseIds } });
    program.courses = validCourses.map((c, idx) => {
      const original = data.courses!.find((item) => item.courseId.toString() === c._id.toString());
      return {
        courseId: c._id,
        isRequired: original?.isRequired !== undefined ? original.isRequired : true,
        order: original?.order !== undefined ? original.order : idx,
      };
    });
  }

  if (Array.isArray(data.assignedDepartments)) {
    program.assignedDepartments = data.assignedDepartments;
  }

  if (Array.isArray(data.assignedEmployees)) {
    program.assignedEmployees = data.assignedEmployees.map(
      (id) => new mongoose.Types.ObjectId(id)
    );
  }

  // Re-sync departments if provided
  if (Array.isArray(data.assignedDepartments) && data.assignedDepartments.length > 0) {
    const deptMembers = await InstitutionMembership.find({
      institutionId: instObjectId,
      department: { $in: data.assignedDepartments },
      status: "active",
    }).distinct("userId");

    for (const dUserId of deptMembers) {
      if (!program.assignedEmployees.some((id) => id.equals(dUserId))) {
        program.assignedEmployees.push(dUserId);
      }
    }
  }

  await program.save();

  // Sync enrollments
  const allCourseIds = program.courses.map((c) => c.courseId);
  await autoProvisionCourseEnrollments(program.assignedEmployees, allCourseIds);

  await program.populate<{ "courses.courseId": ICourse }>(
    "courses.courseId",
    "title slug category level price thumbnail totalLessons"
  );
  return program;
}

export async function deleteTrainingProgram(
  institutionId: string,
  programId: string
): Promise<{ success: boolean; message: string }> {
  const program = await TrainingProgram.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(programId),
    institutionId: new mongoose.Types.ObjectId(institutionId),
  });

  if (!program) {
    const error: any = new Error("Training Program not found.");
    error.statusCode = 404;
    throw error;
  }

  return { success: true, message: `Program '${program.title}' deleted successfully.` };
}

/**
 * Assign an existing program to employees or departments, ensuring Course enrollments.
 */
export async function assignProgram(
  institutionId: string,
  programId: string,
  employeeUserIds: string[],
  departmentNames?: string[]
): Promise<{ program: ITrainingProgram; assignedCount: number }> {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);
  const program = await TrainingProgram.findOne({
    _id: new mongoose.Types.ObjectId(programId),
    institutionId: instObjectId,
  });

  if (!program) {
    const error: any = new Error("Training Program not found.");
    error.statusCode = 404;
    throw error;
  }

  const newEmployeeIds: mongoose.Types.ObjectId[] = employeeUserIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  if (Array.isArray(departmentNames) && departmentNames.length > 0) {
    const deptMembers = await InstitutionMembership.find({
      institutionId: instObjectId,
      department: { $in: departmentNames },
      status: "active",
    }).distinct("userId");

    for (const dm of deptMembers) {
      if (!newEmployeeIds.some((id) => id.equals(dm))) {
        newEmployeeIds.push(dm);
      }
    }
  }

  // Merge into program.assignedEmployees
  for (const empId of newEmployeeIds) {
    if (!program.assignedEmployees.some((id) => id.equals(empId))) {
      program.assignedEmployees.push(empId);
    }
  }

  if (departmentNames && departmentNames.length > 0) {
    for (const d of departmentNames) {
      if (!program.assignedDepartments.includes(d)) {
        program.assignedDepartments.push(d);
      }
    }
  }

  await program.save();

  // Provision enrollments
  const courseIds = program.courses.map((c) => c.courseId);
  await autoProvisionCourseEnrollments(program.assignedEmployees, courseIds);

  return { program, assignedCount: program.assignedEmployees.length };
}

/**
 * Helper to safely provision or link Course Enrollments for employees.
 * Reuses existing Enrollment model and does NOT duplicate course progress!
 */
async function autoProvisionCourseEnrollments(
  employeeUserIds: mongoose.Types.ObjectId[],
  courseIds: mongoose.Types.ObjectId[]
) {
  for (const empId of employeeUserIds) {
    for (const cId of courseIds) {
      const existing = await Enrollment.findOne({ learner: empId, course: cId });
      if (!existing) {
        await Enrollment.create({
          learner: empId,
          course: cId,
          status: "active",
          paymentStatus: "waived",
          enrolledAt: new Date(),
          completedLessons: [],
          progressPercentage: 0,
        });
      }
    }
  }
}

// ==========================================
// 4. EMPLOYEE TRAINING PROGRESS
// ==========================================

export async function getEmployeeTrainingProgress(
  institutionId: string,
  employeeUserId: string
) {
  const instObjectId = new mongoose.Types.ObjectId(institutionId);
  const empObjectId = new mongoose.Types.ObjectId(employeeUserId);

  const membership = await InstitutionMembership.findOne({
    institutionId: instObjectId,
    userId: empObjectId,
  })
    .populate<{ userId: IUser }>("userId", "name email userType")
    .populate<{ managerId: IUser }>("managerId", "name email");

  if (!membership) {
    const error: any = new Error("Employee membership not found in this company.");
    error.statusCode = 404;
    throw error;
  }

  // Find all programs assigned to this employee (explicitly or via their department)
  const query: Record<string, any> = {
    institutionId: instObjectId,
    status: "active",
    $or: [{ assignedEmployees: empObjectId }],
  };

  if (membership.department) {
    query.$or.push({ assignedDepartments: membership.department });
  }

  const assignedPrograms = await TrainingProgram.find(query).populate<{
    "courses.courseId": ICourse;
  }>("courses.courseId", "title slug category totalLessons totalDurationMinutes thumbnail");

  // Retrieve actual enrollments for this employee
  const enrollments = await Enrollment.find({ learner: empObjectId }).populate<{
    course: ICourse;
  }>("course", "title slug totalLessons");

  const enrollmentMap = new Map<string, any>();
  for (const enr of enrollments) {
    const courseIdStr = enr.course ? (enr.course._id ? enr.course._id.toString() : enr.course.toString()) : "";
    if (courseIdStr) {
      enrollmentMap.set(courseIdStr, enr);
    }
  }

  let totalRequiredCourses = 0;
  let completedRequiredCourses = 0;

  const programsWithProgress = assignedPrograms.map((prog) => {
    let programCourseCount = 0;
    let programTotalProgress = 0;

    const courseDetails = prog.courses.map((item) => {
      const c = item.courseId;
      const enr = c ? enrollmentMap.get(c._id.toString()) : undefined;
      const progress = enr ? enr.progressPercentage : 0;
      const isCompleted = enr ? enr.status === "completed" || progress >= 100 : false;

      programCourseCount++;
      programTotalProgress += progress;

      if (item.isRequired) {
        totalRequiredCourses++;
        if (isCompleted) completedRequiredCourses++;
      }

      return {
        course: c,
        isRequired: item.isRequired,
        order: item.order,
        progressPercentage: progress,
        status: isCompleted ? "completed" : "in_progress",
        enrollmentId: enr?._id,
      };
    });

    const averageProgress =
      programCourseCount > 0 ? Math.round(programTotalProgress / programCourseCount) : 0;

    return {
      _id: prog._id,
      title: prog.title,
      description: prog.description,
      category: prog.category,
      dueDate: prog.dueDate,
      estimatedDurationHours: prog.estimatedDurationHours,
      averageProgress,
      isProgramCompleted: averageProgress >= 100,
      courses: courseDetails,
    };
  });

  // Calculate overall workforce onboarding status
  const overallRate =
    totalRequiredCourses > 0
      ? Math.round((completedRequiredCourses / totalRequiredCourses) * 100)
      : programsWithProgress.length > 0 &&
        programsWithProgress.every((p) => p.isProgramCompleted)
      ? 100
      : 0;

  // Auto-sync employee onboardingStatus if completed
  if (overallRate === 100 && membership.onboardingStatus !== "completed") {
    membership.onboardingStatus = "completed";
    await membership.save();
  } else if (overallRate > 0 && overallRate < 100 && membership.onboardingStatus === "not_started") {
    membership.onboardingStatus = "in_progress";
    await membership.save();
  }

  return {
    employee: membership,
    overallCompletionRate: overallRate,
    programs: programsWithProgress,
    totalAssignedPrograms: programsWithProgress.length,
  };
}
