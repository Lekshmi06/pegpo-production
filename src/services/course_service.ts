import Course, { ICourse, ICourseSection, ILesson, CourseStatus, CourseLevel } from "../models/Course";
import Enrollment from "../models/Enrollment";
import mongoose from "mongoose";
import { validateVideoUrl } from "../utils/youtube_utils";

const generateSlug = (title: string): string => {
  const baseSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  return `${baseSlug || "course"}-${randomSuffix}`;
};

export interface CreateCourseInput {
  title: string;
  description: string;
  shortDescription?: string;
  thumbnail?: string;
  category: string;
  level: CourseLevel;
  language?: string;
  price?: number;
  currency?: string;
}

export interface UpdateCourseInput {
  title?: string;
  description?: string;
  shortDescription?: string;
  thumbnail?: string;
  category?: string;
  level?: CourseLevel;
  language?: string;
  price?: number;
  currency?: string;
  status?: CourseStatus;
}

export interface CourseFilterQuery {
  search?: string;
  category?: string;
  level?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "popular" | "price_asc" | "price_desc";
}

export const createCourse = async (
  providerUser: { _id: mongoose.Types.ObjectId | string; name?: string; email: string },
  input: CreateCourseInput
): Promise<ICourse> => {
  if (!input.title || !input.title.trim()) {
    throw new Error("Course title is required");
  }
  if (!input.description || !input.description.trim()) {
    throw new Error("Course description is required");
  }

  const slug = generateSlug(input.title);

  const course = await Course.create({
    title: input.title.trim(),
    slug,
    description: input.description.trim(),
    shortDescription: input.shortDescription?.trim(),
    thumbnail: input.thumbnail?.trim(),
    provider: new mongoose.Types.ObjectId(providerUser._id.toString()),
    providerName: providerUser.name?.trim() || providerUser.email.split("@")[0],
    category: input.category?.trim() || "General",
    level: input.level || "All Levels",
    language: input.language?.trim() || "English",
    price: Number(input.price) || 0,
    currency: input.currency || "USD",
    status: "draft",
    sections: [],
    totalLessons: 0,
    totalDurationMinutes: 0,
    enrollmentCount: 0,
  });

  return course;
};

export const getProviderCourses = async (
  providerId: string
): Promise<{
  courses: ICourse[];
  stats: {
    totalCourses: number;
    draftCourses: number;
    publishedCourses: number;
    totalEnrollments: number;
  };
}> => {
  const providerObjectId = new mongoose.Types.ObjectId(providerId);
  const courses = await Course.find({ provider: providerObjectId }).sort({ updatedAt: -1 });

  let draftCourses = 0;
  let publishedCourses = 0;
  let totalEnrollments = 0;

  for (const c of courses) {
    if (c.status === "draft") draftCourses++;
    if (c.status === "published") publishedCourses++;
    totalEnrollments += c.enrollmentCount || 0;
  }

  return {
    courses,
    stats: {
      totalCourses: courses.length,
      draftCourses,
      publishedCourses,
      totalEnrollments,
    },
  };
};

export const getCourseById = async (
  courseId: string,
  requestingUserId?: string
): Promise<{ course: ICourse; isOwner: boolean }> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  const isOwner = Boolean(
    requestingUserId && course.provider.toString() === requestingUserId.toString()
  );

  // If course is draft or archived, only owner can view
  if (course.status !== "published" && !isOwner) {
    throw new Error("Access denied. This course is not published.");
  }

  return { course, isOwner };
};

export const updateCourse = async (
  courseId: string,
  providerId: string,
  input: UpdateCourseInput
): Promise<ICourse> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  if (input.title !== undefined) course.title = input.title.trim();
  if (input.description !== undefined) course.description = input.description.trim();
  if (input.shortDescription !== undefined) course.shortDescription = input.shortDescription?.trim();
  if (input.thumbnail !== undefined) course.thumbnail = input.thumbnail?.trim();
  if (input.category !== undefined) course.category = input.category.trim();
  if (input.level !== undefined) course.level = input.level;
  if (input.language !== undefined) course.language = input.language.trim();
  if (input.price !== undefined) course.price = Math.max(0, Number(input.price));
  if (input.currency !== undefined) course.currency = input.currency.trim();
  if (input.status !== undefined && ["draft", "published", "archived"].includes(input.status)) {
    course.status = input.status;
  }

  await course.save();
  return course;
};

export const deleteCourse = async (courseId: string, providerId: string): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  await Course.findByIdAndDelete(courseId);
  // Also clean up enrollments associated with this course
  await Enrollment.deleteMany({ course: course._id });
};

export const togglePublishCourse = async (
  courseId: string,
  providerId: string,
  targetStatus?: CourseStatus
): Promise<ICourse> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  const nextStatus = targetStatus || (course.status === "published" ? "draft" : "published");

  if (nextStatus === "published") {
    const totalLessons = course.sections.reduce(
      (sum, sec) => sum + (sec.lessons?.length || 0),
      0
    );

    if (course.sections.length === 0 || totalLessons === 0) {
      throw new Error(
        "Cannot publish course without curriculum. Please add at least one section and lesson first."
      );
    }

    course.status = "published";
    course.publishedAt = new Date();
  } else {
    course.status = nextStatus;
  }

  await course.save();
  return course;
};

// ================= SECTION MANAGEMENT =================
export const addCourseSection = async (
  courseId: string,
  providerId: string,
  title: string,
  description?: string
): Promise<ICourse> => {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new Error("Invalid course ID");
  }
  if (!title || !title.trim()) {
    throw new Error("Section title is required");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  const newSection: ICourseSection = {
    _id: new mongoose.Types.ObjectId(),
    title: title.trim(),
    description: description?.trim(),
    order: course.sections.length,
    lessons: [],
  };

  course.sections.push(newSection);
  await course.save();
  return course;
};

export const updateCourseSection = async (
  courseId: string,
  providerId: string,
  sectionId: string,
  title?: string,
  description?: string
): Promise<ICourse> => {
  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  const section = (course.sections as any).id(sectionId);
  if (!section) {
    throw new Error("Section not found");
  }

  if (title !== undefined && title.trim()) section.title = title.trim();
  if (description !== undefined) section.description = description.trim();

  await course.save();
  return course;
};

export const deleteCourseSection = async (
  courseId: string,
  providerId: string,
  sectionId: string
): Promise<ICourse> => {
  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  course.sections = course.sections.filter(
    (sec: any) => sec._id.toString() !== sectionId.toString()
  );

  await course.save();
  return course;
};

// ================= LESSON MANAGEMENT =================
export const addCourseLesson = async (
  courseId: string,
  providerId: string,
  sectionId: string,
  lessonInput: {
    title: string;
    contentType?: "video" | "article" | "document" | "quiz";
    durationMinutes?: number;
    videoUrl?: string;
    articleContent?: string;
    resourceFileUrl?: string;
    resourceFileName?: string;
    isPreviewFree?: boolean;
  }
): Promise<ICourse> => {
  if (!lessonInput.title || !lessonInput.title.trim()) {
    throw new Error("Lesson title is required");
  }

  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  const section = (course.sections as any).id(sectionId);
  if (!section) {
    throw new Error("Section not found");
  }

  const resolvedContentType = lessonInput.contentType || "video";
  const trimmedVideoUrl = lessonInput.videoUrl?.trim();

  if (resolvedContentType === "video" && trimmedVideoUrl) {
    const validation = validateVideoUrl(trimmedVideoUrl);
    if (!validation.isValid) {
      throw new Error(validation.error || "Invalid video URL");
    }
  }

  const newLesson: ILesson = {
    _id: new mongoose.Types.ObjectId(),
    title: lessonInput.title.trim(),
    contentType: resolvedContentType,
    durationMinutes: Number(lessonInput.durationMinutes) || 10,
    videoUrl: trimmedVideoUrl,
    articleContent: lessonInput.articleContent,
    resourceFileUrl: lessonInput.resourceFileUrl?.trim(),
    resourceFileName: lessonInput.resourceFileName?.trim(),
    isPreviewFree: Boolean(lessonInput.isPreviewFree),
    order: section.lessons.length,
  };

  section.lessons.push(newLesson);
  await course.save();
  return course;
};

export const updateCourseLesson = async (
  courseId: string,
  providerId: string,
  sectionId: string,
  lessonId: string,
  lessonInput: Partial<ILesson>
): Promise<ICourse> => {
  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  const section = (course.sections as any).id(sectionId);
  if (!section) {
    throw new Error("Section not found");
  }

  const lesson = (section.lessons as any).id(lessonId);
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  if (lessonInput.title !== undefined && lessonInput.title.trim()) {
    lesson.title = lessonInput.title.trim();
  }
  if (lessonInput.contentType !== undefined) {
    lesson.contentType = lessonInput.contentType;
  }
  if (lessonInput.durationMinutes !== undefined) {
    lesson.durationMinutes = Number(lessonInput.durationMinutes);
  }
  if (lessonInput.videoUrl !== undefined) {
    const trimmed = lessonInput.videoUrl.trim();
    const effectiveType = lessonInput.contentType || lesson.contentType;
    if (effectiveType === "video" && trimmed) {
      const validation = validateVideoUrl(trimmed);
      if (!validation.isValid) {
        throw new Error(validation.error || "Invalid video URL");
      }
    }
    lesson.videoUrl = trimmed || undefined;
  }
  if (lessonInput.articleContent !== undefined) {
    lesson.articleContent = lessonInput.articleContent;
  }
  if (lessonInput.resourceFileUrl !== undefined) {
    lesson.resourceFileUrl = lessonInput.resourceFileUrl.trim();
  }
  if (lessonInput.resourceFileName !== undefined) {
    lesson.resourceFileName = lessonInput.resourceFileName.trim();
  }
  if (lessonInput.isPreviewFree !== undefined) {
    lesson.isPreviewFree = Boolean(lessonInput.isPreviewFree);
  }

  await course.save();
  return course;
};

export const deleteCourseLesson = async (
  courseId: string,
  providerId: string,
  sectionId: string,
  lessonId: string
): Promise<ICourse> => {
  const course = await Course.findById(courseId);
  if (!course) {
    throw new Error("Course not found");
  }

  if (course.provider.toString() !== providerId.toString()) {
    throw new Error("Forbidden: You do not own this course");
  }

  const section = (course.sections as any).id(sectionId);
  if (!section) {
    throw new Error("Section not found");
  }

  section.lessons = section.lessons.filter(
    (les: any) => les._id.toString() !== lessonId.toString()
  );

  await course.save();
  return course;
};

// ================= MARKETPLACE BROWSE =================
export const getMarketplaceCourses = async (
  query: CourseFilterQuery
): Promise<{ courses: ICourse[]; total: number; categories: string[] }> => {
  const filter: any = { status: "published" };

  if (query.search && query.search.trim()) {
    const searchRegex = new RegExp(query.search.trim(), "i");
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { shortDescription: searchRegex },
      { category: searchRegex },
      { providerName: searchRegex },
    ];
  }

  if (query.category && query.category.trim() && query.category !== "All") {
    filter.category = query.category.trim();
  }

  if (query.level && query.level.trim() && query.level !== "All") {
    filter.level = query.level.trim();
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.price = {};
    if (query.minPrice !== undefined) filter.price.$gte = Number(query.minPrice);
    if (query.maxPrice !== undefined) filter.price.$lte = Number(query.maxPrice);
  }

  let sortOption: any = { publishedAt: -1 };
  if (query.sort === "popular") {
    sortOption = { enrollmentCount: -1, publishedAt: -1 };
  } else if (query.sort === "price_asc") {
    sortOption = { price: 1 };
  } else if (query.sort === "price_desc") {
    sortOption = { price: -1 };
  }

  const courses = await Course.find(filter).sort(sortOption);
  const total = await Course.countDocuments(filter);

  // Distinct categories available in published courses
  const distinctCategories = await Course.distinct("category", { status: "published" });

  return {
    courses,
    total,
    categories: distinctCategories.filter(Boolean),
  };
};
