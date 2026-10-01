import mongoose, { Document, Schema } from "mongoose";
import { CollaborationRole } from "./ResearchProject";

export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked";

export interface IResearchCollaborationInvite extends Document {
  projectId: mongoose.Types.ObjectId;
  inviterId: mongoose.Types.ObjectId;
  inviteeEmail: string;
  inviteeId?: mongoose.Types.ObjectId;
  role: CollaborationRole;
  status: InvitationStatus;
  message?: string;
  createdAt: Date;
  updatedAt: Date;
}

const researchCollaborationInviteSchema = new Schema<IResearchCollaborationInvite>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "ResearchProject",
      required: true,
      index: true,
    },
    inviterId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      required: true,
      index: true,
    },
    inviteeEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    inviteeId: {
      type: Schema.Types.ObjectId,
      ref: "ResearcherProfile",
      index: true,
    },
    role: {
      type: String,
      enum: ["co_author", "reviewer", "contributor", "viewer"],
      default: "viewer",
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "revoked"],
      default: "pending",
      index: true,
    },
    message: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to help quickly detect pending duplicate invites
researchCollaborationInviteSchema.index(
  { projectId: 1, inviteeEmail: 1, status: 1 }
);

const ResearchCollaborationInvite = mongoose.model<IResearchCollaborationInvite>(
  "ResearchCollaborationInvite",
  researchCollaborationInviteSchema
);

export default ResearchCollaborationInvite;
