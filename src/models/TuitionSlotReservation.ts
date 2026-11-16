import mongoose, { Document, Schema } from "mongoose";

export type TuitionSlotReservationStatus = "active" | "cancelled";

export interface ITuitionSlotReservation extends Document {
  providerId: mongoose.Types.ObjectId;
  appointmentDate: string; // UTC ISO Date string "YYYY-MM-DD"
  day: string; // e.g. "Friday"
  timeBucket: string; // e.g. "18:15" (5-minute granularity)
  offeringId: mongoose.Types.ObjectId;
  requestId: mongoose.Types.ObjectId;
  enrollmentId?: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId;
  status: TuitionSlotReservationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const tuitionSlotReservationSchema = new Schema<ITuitionSlotReservation>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    appointmentDate: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    day: {
      type: String,
      required: true,
      trim: true,
    },
    timeBucket: {
      type: String,
      required: true,
      trim: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
      required: true,
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionRequest",
      required: true,
      index: true,
    },
    enrollmentId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionEnrollment",
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionBatch",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "cancelled"],
      default: "active",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Database-enforced atomic uniqueness: Specific calendar date + time bucket for provider
tuitionSlotReservationSchema.index(
  { providerId: 1, appointmentDate: 1, timeBucket: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

const TuitionSlotReservation = mongoose.model<ITuitionSlotReservation>(
  "TuitionSlotReservation",
  tuitionSlotReservationSchema
);

export default TuitionSlotReservation;
