import mongoose, { Document, Schema } from "mongoose";

export type LessonSessionStatus = "planned" | "in_progress" | "completed";
export type LessonPlanStatus = "draft" | "active" | "completed";

export interface IAssessmentRecommendation {
  type?: "quiz" | "test" | "assignment" | "oral" | string;
  recommended: boolean;
  topic?: string;
  suggestedQuestionsCount?: number;
}

export interface BaseLessonResource {
  id: string;
  title: string;
  description?: string;
  source: 'ai_recommended' | 'teacher_added';
  isApproved?: boolean;
}

export interface VideoResource extends BaseLessonResource {
  type: 'video';
  searchQuery: string;
  recommendationReason: string;
  verifiedUrl?: string;
}

export interface VisualResource extends BaseLessonResource {
  type: 'visual/animation';
  visualType: 'diagram' | 'simulation' | 'infographic';
  promptOrConcept: string;
  referenceUrl?: string;
}

export interface FlashcardDeckResource extends BaseLessonResource {
  type: 'flashcard_deck';
  cards: Array<{
    front: string;
    back: string;
    hint?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
}

export interface WorksheetResource extends BaseLessonResource {
  type: 'worksheet';
  instructions: string;
  exercises: string[];
}

export interface QuizResource extends BaseLessonResource {
  type: 'quiz';
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
  }>;
}

export interface ActivityResource extends BaseLessonResource {
  type: 'activity';
  activityType: 'individual' | 'pair' | 'group' | 'discussion';
  instructions: string;
  durationMinutes?: number;
}

export interface ReferenceResource extends BaseLessonResource {
  type: 'reference';
  referenceText: string;
  url?: string;
}

export type ILessonResource =
  | VideoResource
  | VisualResource
  | FlashcardDeckResource
  | WorksheetResource
  | QuizResource
  | ActivityResource
  | ReferenceResource;

export interface ILessonSession {
  sessionNumber: number;
  title: string;
  durationMinutes: number;
  learningObjectives: string[];
  teachingMethod?: string;
  activities?: string[];
  keyConcepts: string[];
  resources?: Array<string | ILessonResource>;
  assignment?: string;
  assessmentRecommendation?: IAssessmentRecommendation;
  status: LessonSessionStatus;
  completedAt?: Date;
  notes?: string;
  templateSections?: Array<{
    sectionKey: string;
    label: string;
    content: any;
  }>;
}

export interface ILessonPlan extends Document {
  teacherId: mongoose.Types.ObjectId;
  contextId: mongoose.Types.ObjectId;
  curriculumId?: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  templateName?: string;
  templateSchema?: any;
  classLevel: string;
  subject: string;
  chapterTitle: string;
  unitNumber?: number;
  totalEstimatedHours?: number;
  status: LessonPlanStatus;
  templateSections?: Array<{
    sectionKey: string;
    label: string;
    content: any;
  }>;
  sessions: ILessonSession[];
  createdAt: Date;
  updatedAt: Date;
}

const assessmentRecommendationSchema = new Schema<IAssessmentRecommendation>(
  {
    type: { type: String, default: "quiz" },
    recommended: { type: Boolean, default: false },
    topic: { type: String, trim: true },
    suggestedQuestionsCount: { type: Number, default: 5 },
  },
  { _id: false }
);

const lessonSessionSchema = new Schema<ILessonSession>(
  {
    sessionNumber: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    durationMinutes: {
      type: Number,
      default: 45,
    },
    learningObjectives: {
      type: [String],
      default: [],
    },
    teachingMethod: {
      type: String,
      trim: true,
      default: "Lecture & Interactive Discussion",
    },
    activities: {
      type: [String],
      default: [],
    },
    keyConcepts: {
      type: [String],
      default: [],
    },
    resources: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    assignment: {
      type: String,
      trim: true,
    },
    assessmentRecommendation: {
      type: assessmentRecommendationSchema,
      default: undefined,
    },
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed"],
      default: "planned",
    },
    completedAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
    },
    templateSections: {
      type: [
        {
          sectionKey: { type: String, required: true },
          label: { type: String, required: true },
          content: { type: Schema.Types.Mixed },
        },
      ],
      default: undefined,
    },
  },
  { _id: true }
);

const lessonPlanSchema = new Schema<ILessonPlan>(
  {
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      required: true,
      index: true,
    },
    contextId: {
      type: Schema.Types.ObjectId,
      ref: "TeachingContext",
      required: true,
      index: true,
    },
    curriculumId: {
      type: Schema.Types.ObjectId,
      ref: "Curriculum",
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "LessonPlanTemplate",
      index: true,
    },
    templateName: {
      type: String,
      trim: true,
    },
    templateSchema: {
      type: Schema.Types.Mixed,
    },
    templateSections: {
      type: [
        {
          sectionKey: { type: String, required: true },
          label: { type: String, required: true },
          content: { type: Schema.Types.Mixed },
        },
      ],
      default: undefined,
    },
    classLevel: {
      type: String,
      required: true,
      trim: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    chapterTitle: {
      type: String,
      required: true,
      trim: true,
    },
    unitNumber: {
      type: Number,
      default: 1,
    },
    totalEstimatedHours: {
      type: Number,
      default: 3,
    },
    status: {
      type: String,
      enum: ["draft", "active", "completed"],
      default: "active",
    },
    sessions: {
      type: [lessonSessionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

lessonPlanSchema.index({ contextId: 1, chapterTitle: 1 });

const LessonPlan = mongoose.model<ILessonPlan>("LessonPlan", lessonPlanSchema);

export default LessonPlan;
