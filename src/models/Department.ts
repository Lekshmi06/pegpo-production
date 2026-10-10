import mongoose, { Document, Schema, Types } from "mongoose";

export interface IDepartment extends Document {
  institutionId: Types.ObjectId;
  name: string;
  description?: string;
  headId?: Types.ObjectId | any;
  teams: string[];
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    institutionId: {
      type: Schema.Types.ObjectId,
      ref: "Institution",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    headId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    teams: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Unique department name per institution tenant
departmentSchema.index({ institutionId: 1, name: 1 }, { unique: true });

export default mongoose.model<IDepartment>("Department", departmentSchema);
