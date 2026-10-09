import Enrollment, { IEnrollment } from "../models/Enrollment";
import Course, { ICourse, ILesson } from "../models/Course";
import mongoose from "mongoose";

export const enrollInCourse = async (
  learnerId: string,
  courseId: string
): Promise<{ enrollment: IEnrollment; alreadyEnrolled: boolean }> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.status !== "published") {
    throw new Error("Cannot enroll in an unpublished course");
  }

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  const courseObjectId = new mongoose.Types.ObjectId(courseId);

  // Check if enrollment already exists
  const existingEnrollment = await Enrollment.findOne({
    learner: learnerObjectId,
    course: courseObjectId,
  });

  if (existingEnrollment) {
    return {
      enrollment: existingEnrollment,
      alreadyEnrolled: true,
    };
  }

  // Architectural separation between Enrollment and Payment
  // Course price is maintained; paymentStatus is 'free' (or 'waived') for this phase
  const newEnrollment = await Enrollment.create({
    learner: learnerObjectId,
    course: courseObjectId,
    status: "active",
    paymentStatus: course.price === 0 ? "free" : "waived",
    enrolledAt: new Date(),
    completedLessons: [],
    progressPercentage: 0,
  });

  // Increment course enrollment count
  await Course.findByIdAndUpdate(courseId, { $inc: { enrollmentCount: 1 } });

  return {
    enrollment: newEnrollment,
    alreadyEnrolled: false,
  };
};

export const getLearnerEnrolledCourses = async (
  learnerId: string
): Promise<{ enrollments: any[] }> => {
  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);

  const enrollments = await Enrollment.find({ learner: learnerObjectId })
    .populate({
      path: "course",
      select:
        "title slug thumbnail shortDescription description provider providerName category level language price totalLessons totalDurationMinutes status",
    })
    .sort({ updatedAt: -1 });

  return { enrollments };
};

export const getLearnerCourseLearningState = async (
  learnerId: string,
  courseId: string
): Promise<{
  course: ICourse;
  enrollment: IEnrollment;
  isOwner: boolean;
}> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  const isOwner = course.provider.toString() === learnerId.toString();

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  const enrollment = await Enrollment.findOne({
    learner: learnerObjectId,
    course: course._id,
  });

  // If user is neither enrolled nor the owner
  if (!enrollment && !isOwner) {
    throw new Error("Forbidden: You are not enrolled in this course");
  }

  return {
    course,
    enrollment: (enrollment || {
      learner: learnerObjectId,
      course: course._id,
      status: "active",
      paymentStatus: "free",
      completedLessons: [],
      progressPercentage: 0,
      enrolledAt: new Date(),
    }) as any,
    isOwner,
  };
};

export const updateLessonProgress = async (
  learnerId: string,
  courseId: string,
  lessonId: string,
  completed: boolean
): Promise<{ enrollment: IEnrollment }> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  const learnerObjectId = new mongoose.Types.ObjectId(learnerId);
  let enrollment = await Enrollment.findOne({
    learner: learnerObjectId,
    course: course._id,
  });

  if (!enrollment) {
    // If learner hasn't formally enrolled yet (e.g. previewing), check if owner or enroll
    if (course.provider.toString() === learnerId.toString()) {
      // Owner previewing - create or return
      enrollment = await Enrollment.create({
        learner: learnerObjectId,
        course: course._id,
        status: "active",
        paymentStatus: "free",
        completedLessons: [],
        progressPercentage: 0,
      });
    } else {
      throw new Error("Forbidden: You are not enrolled in this course");
    }
  }

  const completedSet = new Set(enrollment.completedLessons || []);
  if (completed) {
    completedSet.add(lessonId.toString());
  } else {
    completedSet.delete(lessonId.toString());
  }

  enrollment.completedLessons = Array.from(completedSet);
  enrollment.lastAccessedLesson = lessonId.toString();

  // Compute total lessons in course
  const totalLessons = course.totalLessons || 1;
  const progress = Math.min(100, Math.round((enrollment.completedLessons.length / totalLessons) * 100));
  enrollment.progressPercentage = progress;

  if (progress >= 100) {
    enrollment.status = "completed";
    enrollment.completedAt = new Date();
  } else {
    enrollment.status = "active";
  }

  await enrollment.save();
  return { enrollment };
};

export const verifyLessonAccess = async (
  userId: string | undefined,
  courseId: string,
  lessonId: string
): Promise<{ lesson: ILesson; courseTitle: string }> => {
  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  // Find the lesson in course sections
  let foundLesson: ILesson | null = null;
  for (const sec of course.sections) {
    const l = (sec.lessons as any).id(lessonId);
    if (l) {
      foundLesson = l;
      break;
    }
  }

  if (!foundLesson) {
    throw new Error("Lesson not found in course");
  }

  // Free preview allows access without enrollment
  if (foundLesson.isPreviewFree) {
    return { lesson: foundLesson, courseTitle: course.title };
  }

  // If not free preview, user must be authenticated
  if (!userId) {
    throw new Error("Authentication required to access this lesson");
  }

  // If user is course owner, allow access
  if (course.provider.toString() === userId.toString()) {
    return { lesson: foundLesson, courseTitle: course.title };
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    learner: new mongoose.Types.ObjectId(userId),
    course: course._id,
  });

  if (!enrollment) {
    throw new Error("Forbidden: You must enroll in this course to access protected lesson content");
  }

  return { lesson: foundLesson, courseTitle: course.title };
};
