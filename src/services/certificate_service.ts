import crypto from "crypto";
import mongoose from "mongoose";
import Certificate, { ICertificate } from "../models/Certificate";
import Enrollment from "../models/Enrollment";
import Course from "../models/Course";
import User from "../models/User";

export const issueCourseCertificate = async (
  learnerId: string,
  courseId: string
): Promise<ICertificate> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  // 1. Check if certificate already exists (idempotent)
  const existingCert = await Certificate.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  if (existingCert) {
    return existingCert;
  }

  // 2. Verify enrollment and completion
  const enrollment = await Enrollment.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  if (!enrollment) {
    throw new Error("Forbidden: You are not enrolled in this course.");
  }

  if (enrollment.progressPercentage < 100 || enrollment.status !== "completed") {
    throw new Error(
      `Certificate requirement not met: Course progress is ${enrollment.progressPercentage}%. You must complete 100% of the lessons to earn a certificate.`
    );
  }

  const course = await Course.findById(courseObjectId);
  if (!course) {
    throw new Error("Course not found");
  }

  const learner = await User.findById(learnerObjectId);
  const recipientName =
    learner?.name ||
    learner?.email?.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Verified Learner";

  // Generate verifiable certificate number: CERT-2026-XXXX-XXXX
  const year = new Date().getFullYear();
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  const certificateNumber = `CERT-${year}-${courseId.slice(-4).toUpperCase()}-${randomPart}`;

  const cert = await Certificate.create({
    certificateNumber,
    course: course._id,
    learner: learnerObjectId,
    enrollment: enrollment._id,
    recipientName,
    courseTitle: course.title,
    providerName: course.providerName || "EduPye Academy",
    issueDate: new Date(),
    metadata: {
      totalLessons: course.totalLessons,
      completedAt: enrollment.completedAt || new Date(),
    },
  });

  return cert;
};

export const getLearnerCourseCertificate = async (
  learnerId: string,
  courseId: string
): Promise<ICertificate | null> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) return null;

  return await Certificate.findOne({
    learner: new mongoose.Types.ObjectId(learnerId),
    course: new mongoose.Types.ObjectId(courseId),
  });
};

export const verifyCertificateByNumber = async (
  certificateNumber: string
): Promise<ICertificate | null> => {
  return await Certificate.findOne({
    certificateNumber: certificateNumber.trim().toUpperCase(),
  })
    .populate({ path: "course", select: "title description thumbnail providerName" })
    .populate({ path: "learner", select: "name email" });
};

