import mongoose, { Document, Schema } from "mongoose";

export type AcademyExpenseCategory =
  | "Rent & Utilities"
  | "Study Material & Printing"
  | "Tutor Payouts"
  | "Software & Equipment"
  | "Marketing"
  | "Other";

export interface IAcademyExpense extends Document {
  category: AcademyExpenseCategory;
  title: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMode: string;
  paidTo: string;
  notes?: string;
  session: string;
  tutorPayoutId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const academyExpenseSchema = new Schema<IAcademyExpense>(
  {
    category: {
      type: String,
      enum: [
        "Rent & Utilities",
        "Study Material & Printing",
        "Tutor Payouts",
        "Software & Equipment",
        "Marketing",
        "Other",
      ],
      required: true,
      default: "Other",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: String,
      required: true,
      trim: true,
    },
    paymentMode: {
      type: String,
      required: true,
      default: "Bank Transfer",
      trim: true,
    },
    paidTo: {
      type: String,
      required: true,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    session: {
      type: String,
      required: true,
      default: "2026-27",
      trim: true,
    },
    tutorPayoutId: {
      type: Schema.Types.ObjectId,
      ref: "AcademyTutorPayout",
    },
  },
  {
    timestamps: true,
  }
);

academyExpenseSchema.index({ date: -1, category: 1, session: 1 });

export default mongoose.models.AcademyExpense || mongoose.model<IAcademyExpense>("AcademyExpense", academyExpenseSchema);
