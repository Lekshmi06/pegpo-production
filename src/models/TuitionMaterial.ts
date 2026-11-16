import mongoose, { Document, Schema } from "mongoose";

export interface ITuitionMaterial extends Document {
  providerId: mongoose.Types.ObjectId;
  offeringId: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  fileUrl: string;
  fileType: string;
  fileSize?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionMaterialSchema = new Schema<ITuitionMaterial>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
      required: true,
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionBatch",
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
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: {
      type: String,
      default: "pdf",
      trim: true,
    },
    fileSize: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const TuitionMaterial = mongoose.model<ITuitionMaterial>(
  "TuitionMaterial",
  tuitionMaterialSchema
);

export default TuitionMaterial;
