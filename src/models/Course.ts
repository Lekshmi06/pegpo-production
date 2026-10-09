import mongoose, { Document, Schema } from "mongoose";

export type CourseStatus = "draft" | "published" | "archived";
export type CourseLevel = "Beginner" | "Intermediate" | "Advanced" | "All Levels";
export type LessonContentType = "video" | "article" | "document" | "quiz";

export interface ILesson {
  _id?: mongoose.Types.ObjectId;
  title: string;
  contentType: LessonContentType;
  durationMinutes?: number;
  videoUrl?: string;
  articleContent?: string;
  resourceFileUrl?: string;
  resourceFileName?: string;
  order: number;
  isPreviewFree?: boolean;
}

export interface ICourseSection {
  _id?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  lessons: ILesson[];
}

export interface ICourse extends Document {
  title: string;
  slug: string;
  shortDescription?: string;
  description: string;
  thumbnail?: string;
  provider: mongoose.Types.ObjectId;
  providerName?: string;
  category: string;
  level: CourseLevel;
  language: string;
  price: number;
  currency: string;
  status: CourseStatus;
  sections: ICourseSection[];
  totalLessons: number;
  totalDurationMinutes: number;
  enrollmentCount: number;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const lessonSchema = new Schema<ILesson>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    contentType: {
      type: String,
      enum: ["video", "article", "document", "quiz"],
      default: "video",
      required: true,
    },
    durationMinutes: {
      type: Number,
      default: 10,
    },
    videoUrl: {
      type: String,
      trim: true,
    },
    articleContent: {
      type: String,
    },
    resourceFileUrl: {
      type: String,
      trim: true,
    },
    resourceFileName: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    isPreviewFree: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const sectionSchema = new Schema<ICourseSection>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    lessons: {
      type: [lessonSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const courseSchema = new Schema<ICourse>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    shortDescription: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      trim: true,
    },
    provider: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerName: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      default: "General",
      index: true,
    },
    level: {
      type: String,
      enum: ["Beginner", "Intermediate", "Advanced", "All Levels"],
      default: "All Levels",
      required: true,
    },
    language: {
      type: String,
      default: "English",
      trim: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      required: true,
      index: true,
    },
    sections: {
      type: [sectionSchema],
      default: [],
    },
    totalLessons: {
      type: Number,
      default: 0,
    },
    totalDurationMinutes: {
      type: Number,
      default: 0,
    },
    enrollmentCount: {
      type: Number,
      default: 0,
    },
    publishedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-compute totalLessons and totalDurationMinutes before saving
courseSchema.pre("save", function (this: ICourse) {
  let lessonsCount = 0;
  let duration = 0;

  if (this.sections && Array.isArray(this.sections)) {
    for (const sec of this.sections) {
      if (sec.lessons && Array.isArray(sec.lessons)) {
        lessonsCount += sec.lessons.length;
        for (const les of sec.lessons) {
          duration += les.durationMinutes || 0;
        }
      }
    }
  }

  this.totalLessons = lessonsCount;
  this.totalDurationMinutes = duration;
});

const Course = mongoose.model<ICourse>("Course", courseSchema);

export default Course;
