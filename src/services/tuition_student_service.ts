import mongoose from "mongoose";
import TuitionEnrollment, { ITuitionEnrollment } from "../models/TuitionEnrollment";
import TuitionRequest, { ITuitionRequest } from "../models/TuitionRequest";
import TuitionSession from "../models/TuitionSession";
import TuitionMaterial from "../models/TuitionMaterial";
import TuitionAssessment from "../models/TuitionAssessment";
import TuitionTransaction from "../models/TuitionTransaction";
import TuitionAttendance from "../models/TuitionAttendance";

export const getTuitionStudentOverview = async (studentId: string) => {
  const studentObjId = new mongoose.Types.ObjectId(studentId);

  const activeEnrollments = await TuitionEnrollment.find({
    studentId: studentObjId,
    status: "active",
  })
    .populate("providerId", "name email")
    .populate("offeringId", "title subject classLevel teachingMode feeAmount")
    .lean();

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcomingSessions = await TuitionSession.find({
    studentIds: studentObjId,
    sessionDate: { $gte: now, $lte: nextWeek },
    status: { $in: ["scheduled", "live"] },
  })
    .populate("providerId", "name")
    .populate("offeringId", "title subject")
    .sort({ sessionDate: 1, startTime: 1 })
    .limit(6)
    .lean();

  const requests = await TuitionRequest.find({ studentId: studentObjId })
    .populate("providerId", "name")
    .populate("offeringId", "title subject feeAmount")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // Calculate overall attendance rate
  let totalAttended = 0;
  let totalConducted = 0;
  for (const enr of activeEnrollments) {
    totalAttended += enr.sessionsAttended || 0;
    totalConducted += enr.totalSessionsConducted || 0;
  }
  const attendanceRate = totalConducted > 0 ? Math.round((totalAttended / totalConducted) * 100) : 100;

  return {
    activeEnrollmentsCount: activeEnrollments.length,
    attendanceRate,
    activeEnrollments,
    upcomingSessions,
    recentRequests: requests,
  };
};

export const getStudentTuitionEnrollments = async (studentId: string) => {
  return await TuitionEnrollment.find({
    studentId: new mongoose.Types.ObjectId(studentId),
  })
    .populate("providerId", "name email")
    .populate("offeringId", "title subject classLevel teachingMode classFormat feeAmount")
    .populate("batchId", "title daysOfWeek startTime endTime")
    .sort({ enrolledAt: -1 })
    .lean();
};

export const getStudentTuitionRequests = async (studentId: string) => {
  return await TuitionRequest.find({
    studentId: new mongoose.Types.ObjectId(studentId),
  })
    .populate("providerId", "name email")
    .populate("offeringId", "title subject classLevel feeAmount currency")
    .populate("batchId", "title daysOfWeek startTime endTime")
    .sort({ createdAt: -1 })
    .lean();
};

export const getStudentTuitionMaterials = async (studentId: string, offeringId?: string) => {
  const studentObjId = new mongoose.Types.ObjectId(studentId);

  // Student can only see materials for offerings they are enrolled in
  const enrollments = await TuitionEnrollment.find({
    studentId: studentObjId,
    status: "active",
  }).select("offeringId");

  const enrolledOfferingIds = enrollments.map((e) => e.offeringId);

  const query: any = {
    offeringId: { $in: enrolledOfferingIds },
  };

  if (offeringId && mongoose.Types.ObjectId.isValid(offeringId)) {
    query.offeringId = new mongoose.Types.ObjectId(offeringId);
  }

  return await TuitionMaterial.find(query)
    .populate("providerId", "name")
    .populate("offeringId", "title subject")
    .sort({ createdAt: -1 })
    .lean();
};

export const getStudentTuitionAssessments = async (studentId: string, offeringId?: string) => {
  const studentObjId = new mongoose.Types.ObjectId(studentId);

  const enrollments = await TuitionEnrollment.find({
    studentId: studentObjId,
    status: "active",
  }).select("offeringId");

  const enrolledOfferingIds = enrollments.map((e) => e.offeringId);

  const query: any = {
    offeringId: { $in: enrolledOfferingIds },
  };

  if (offeringId && mongoose.Types.ObjectId.isValid(offeringId)) {
    query.offeringId = new mongoose.Types.ObjectId(offeringId);
  }

  const assessments = await TuitionAssessment.find(query)
    .populate("providerId", "name")
    .populate("offeringId", "title subject")
    .sort({ dueDate: 1 })
    .lean();

  // Attach student's individual submission state
  return assessments.map((assessment) => {
    const studentSubmission = (assessment.submissions || []).find(
      (s) => s.studentId.toString() === studentId
    );
    return {
      ...assessment,
      mySubmission: studentSubmission || null,
    };
  });
};

export const submitStudentAssessment = async (
  studentId: string,
  assessmentId: string,
  data: { fileUrl?: string; notes?: string }
) => {
  const studentObjId = new mongoose.Types.ObjectId(studentId);
  const assessment = await TuitionAssessment.findById(assessmentId);
  if (!assessment) {
    throw new Error("Assessment not found");
  }

  // Verify student is enrolled in this assessment's offering
  const isEnrolled = await TuitionEnrollment.exists({
    studentId: studentObjId,
    offeringId: assessment.offeringId,
    status: "active",
  });
  if (!isEnrolled) {
    throw new Error("Forbidden: You are not enrolled in this tuition class");
  }

  const existingSubIndex = assessment.submissions.findIndex(
    (s) => s.studentId.toString() === studentId
  );

  if (existingSubIndex >= 0) {
    assessment.submissions[existingSubIndex].fileUrl = data.fileUrl || assessment.submissions[existingSubIndex].fileUrl;
    assessment.submissions[existingSubIndex].notes = data.notes || assessment.submissions[existingSubIndex].notes;
    assessment.submissions[existingSubIndex].submittedAt = new Date();
  } else {
    assessment.submissions.push({
      studentId: studentObjId,
      fileUrl: data.fileUrl,
      notes: data.notes,
      submittedAt: new Date(),
    });
  }

  await assessment.save();
  return assessment;
};

export const getStudentTuitionPayments = async (studentId: string) => {
  return await TuitionTransaction.find({
    studentId: new mongoose.Types.ObjectId(studentId),
  })
    .populate("providerId", "name email")
    .populate("offeringId", "title subject")
    .sort({ createdAt: -1 })
    .lean();
};

