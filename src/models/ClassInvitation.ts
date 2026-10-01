import mongoose, { Document, Schema } from "mongoose";

export interface IClassInvitation extends Document {
  classSectionId: mongoose.Types.ObjectId;
  email: string;
  name?: string;
  rollNumber?: string;
  invitedBy?: mongoose.Types.ObjectId;
  status: "pending" | "accepted";
  createdAt: Date;
  updatedAt: Date;
}

const classInvitationSchema = new Schema<IClassInvitation>(
  {
    classSectionId: {
      type: Schema.Types.ObjectId,
      ref: "ClassSection",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    rollNumber: {
      type: String,
      trim: true,
      default: "",
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "TeacherProfile",
    },
    status: {
      type: String,
      enum: ["pending", "accepted"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

classInvitationSchema.index({ classSectionId: 1, email: 1 }, { unique: true });

const ClassInvitation = mongoose.model<IClassInvitation>(
  "ClassInvitation",
  classInvitationSchema
);

export default ClassInvitation;
