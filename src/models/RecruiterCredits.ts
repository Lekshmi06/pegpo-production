import mongoose, { Document, Schema } from "mongoose";

export interface IRecruiterCredits extends Document {
  orgId?: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  balance: number;
  promotionalGranted: boolean;
  referralCode?: string;
  referredBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RecruiterCreditsSchema = new Schema<IRecruiterCredits>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "RecruiterOrganization", sparse: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", sparse: true },
    balance: { type: Number, default: 20, min: 0 },
    promotionalGranted: { type: Boolean, default: false },
    referralCode: { type: String, sparse: true, unique: true, index: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "recruitercredits" }
);

RecruiterCreditsSchema.index({ orgId: 1 }, { unique: true, sparse: true });
RecruiterCreditsSchema.index({ userId: 1 }, { unique: true, sparse: true });

export const RecruiterCredits =
  mongoose.models.RecruiterCredits ||
  mongoose.model<IRecruiterCredits>("RecruiterCredits", RecruiterCreditsSchema);
export default RecruiterCredits;

