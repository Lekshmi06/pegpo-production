import mongoose, { Document, Schema, Types } from "mongoose";

export type TrainingProgramStatus = "draft" | "active" | "archived";

export interface IProgramCourseItem {
  courseId: Types.ObjectId | any;
  isRequired: boolean;
  order: number;
}

export interface ITrainingProgram extends Document {
  institutionId: Types.ObjectId;
  title: string;
  description?: string;
  category: string;
  courses: IProgramCourseItem[];
  assignedEmployees: (Types.ObjectId | any)[];
  assignedDepartments: string[];
  dueDate?: Date;
  estimatedDurationHours?: number;
  status: TrainingProgramStatus;
  createdBy: Types.ObjectId | any;
  createdAt: Date;
  updatedAt: Date;
}

const programCourseItemSchema = new Schema<IProgramCourseItem>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const trainingProgramSchema = new Schema<ITrainingProgram>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: "Onboarding",
      index: true,
    },
    courses: [programCourseItemSchema],
    assignedEmployees: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
    assignedDepartments: [
      {
        type: String,
        trim: true,
      },
    ],
    dueDate: {
      type: Date,
    },
    estimatedDurationHours: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "active",
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

trainingProgramSchema.index({ institutionId: 1, status: 1 });
trainingProgramSchema.index({ institutionId: 1, createdAt: -1 });

export default mongoose.model<ITrainingProgram>("TrainingProgram", trainingProgramSchema);
