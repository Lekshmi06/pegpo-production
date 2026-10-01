import mongoose, { Document, Schema } from "mongoose";

export type TemplateType = "predefined" | "custom";
export type SectionContentType = "text" | "list" | "table" | "keyValue";

export interface ILessonPlanTemplateSection {
  key: string;
  label: string;
  type: SectionContentType;
  order: number;
  description?: string;
  required?: boolean;
}

export interface ILessonPlanTemplateSchema {
  templateName: string;
  description?: string;
  sections: ILessonPlanTemplateSection[];
}

export interface ILessonPlanTemplate extends Document {
  name: string;
  description?: string;
  type: TemplateType;
  imageReference?: string;
  extractedSchema: ILessonPlanTemplateSchema;
  createdBy?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const lessonPlanTemplateSectionSchema = new Schema<ILessonPlanTemplateSection>(
  {
    key: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["text", "list", "table", "keyValue"],
      default: "text",
    },
    order: {
      type: Number,
      required: true,
      default: 1,
    },
    description: {
      type: String,
      trim: true,
    },
    required: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const lessonPlanTemplateSchema = new Schema<ILessonPlanTemplate>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["predefined", "custom"],
      required: true,
      index: true,
    },
    imageReference: {
      type: String,
      trim: true,
    },
    extractedSchema: {
      templateName: {
        type: String,
        required: true,
        trim: true,
      },
      description: {
        type: String,
        trim: true,
      },
      sections: {
        type: [lessonPlanTemplateSectionSchema],
        default: [],
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

lessonPlanTemplateSchema.index({ type: 1, createdBy: 1, isActive: 1 });

const LessonPlanTemplate = mongoose.model<ILessonPlanTemplate>(
  "LessonPlanTemplate",
  lessonPlanTemplateSchema
);

export default LessonPlanTemplate;
