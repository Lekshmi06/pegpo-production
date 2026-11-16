import crypto from "crypto";
import mongoose from "mongoose";
import TuitionRequest, {
  ITuitionRequest,
  IRequestedSlot,
} from "../models/TuitionRequest";
import TuitionOffering, {
  TuitionClassFormat,
  TuitionOfferingTeachingMode,
} from "../models/TuitionOffering";
import TuitionBatch from "../models/TuitionBatch";
import TuitionEnrollment, { ITuitionEnrollment } from "../models/TuitionEnrollment";
import TuitionTransaction from "../models/TuitionTransaction";
import TuitionSession from "../models/TuitionSession";
import TuitionSlotReservation from "../models/TuitionSlotReservation";
import {
  generatePaymentSignature,
  verifyPaymentSignature,
} from "./payment_service";

/**
 * Decomposes a start and end time (e.g. "18:15" - "19:15") into discrete 5-minute bucket keys
 * for precision database-enforced conflict prevention of arbitrary time intervals.
 */
export const generateTimeBuckets = (
  startTime: string,
  endTime: string,
  stepMinutes: number = 5
): string[] => {
  const [startH, startM] = startTime.split(":").map(Number);
  const [endH, endM] = endTime.split(":").map(Number);
  let startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (isNaN(startMinutes) || isNaN(endMinutes) || startMinutes >= endMinutes) {
    throw new Error(`Invalid slot time range: ${startTime} - ${endTime}`);
  }

  const buckets: string[] = [];
  while (startMinutes < endMinutes) {
    const h = Math.floor(startMinutes / 60).toString().padStart(2, "0");
    const m = (startMinutes % 60).toString().padStart(2, "0");
    buckets.push(`${h}:${m}`);
    startMinutes += stepMinutes;
  }
  return buckets;
};

/**
 * Resolves the concrete UTC calendar date string (YYYY-MM-DD) for a requested slot,
 * ensuring reservations are calendar-date scoped rather than just day-of-week scoped.
 */
export const resolveAppointmentDateString = (slot?: IRequestedSlot): string => {
  if (slot?.specificDate) {
    const d = new Date(slot.specificDate);
    return d.toISOString().split("T")[0];
  }
  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const targetDay = slot?.day && dayMap[slot.day] !== undefined ? dayMap[slot.day] : 5;
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = (targetDay - currentDay + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  const targetDate = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
  return targetDate.toISOString().split("T")[0];
};

export interface CreateTuitionRequestInput {
  offeringId: string;
  batchId?: string;
  classFormat: TuitionClassFormat;
  teachingMode: TuitionOfferingTeachingMode;
  requestedSlot?: IRequestedSlot;
  studentNotes?: string;
}

/**
 * Step 1: Student submits a tuition request.
 */
export const createTuitionRequest = async (
  studentId: string,
  input: CreateTuitionRequestInput
): Promise<ITuitionRequest> => {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }
  if (!mongoose.Types.ObjectId.isValid(input.offeringId)) {
    throw new Error("Invalid offering ID");
  }

  const offering = await TuitionOffering.findById(input.offeringId);
  if (!offering || !offering.isActive) {
    throw new Error("Tuition offering is inactive or not found");
  }

  const studentObjId = new mongoose.Types.ObjectId(studentId);

  // Prevent self-requesting if the provider is also the student
  if (offering.providerId.toString() === studentId) {
    throw new Error("Providers cannot enroll into their own tuition offerings");
  }

  // Prevent duplicate pending or active requests
  const existingPending = await TuitionRequest.findOne({
    studentId: studentObjId,
    offeringId: offering._id,
    status: { $in: ["pending", "accepted"] },
  });
  if (existingPending) {
    throw new Error(
      `You already have an active request (${existingPending.status}) for this tuition offering`
    );
  }

  // Prevent duplicate active enrollment
  const existingEnrollment = await TuitionEnrollment.findOne({
    studentId: studentObjId,
    offeringId: offering._id,
    status: "active",
  });
  if (existingEnrollment) {
    throw new Error("You are already enrolled in this tuition offering");
  }

  let resolvedBatchId: mongoose.Types.ObjectId | undefined = undefined;

  // If fixed recurring batch model, validate batch and seat availability
  if (offering.scheduleModel === "fixed_batch") {
    if (!input.batchId) {
      throw new Error("Please select an available batch for this recurring class");
    }
    const batch = await TuitionBatch.findById(input.batchId);
    if (!batch || batch.offeringId.toString() !== offering._id.toString()) {
      throw new Error("Invalid batch selected");
    }
    if (batch.status !== "active") {
      throw new Error("Selected batch is no longer active");
    }
    if (batch.enrolledCount >= batch.maxCapacity) {
      throw new Error("This batch has reached maximum student capacity");
    }
    resolvedBatchId = batch._id;
  } else if (offering.scheduleModel === "flexible_slot") {
    if (!input.requestedSlot?.day || !input.requestedSlot?.startTime || !input.requestedSlot?.endTime) {
      throw new Error("Please provide your preferred day and time slot for 1:1 tuition");
    }
  }

  const request = await TuitionRequest.create({
    studentId: studentObjId,
    providerId: offering.providerId,
    offeringId: offering._id,
    batchId: resolvedBatchId,
    scheduleModel: offering.scheduleModel,
    classFormat: input.classFormat || offering.classFormat,
    teachingMode: input.teachingMode || offering.teachingMode,
    subject: offering.subject,
    requestedSlot: input.requestedSlot,
    studentNotes: input.studentNotes?.trim(),
    feeAmount: offering.feeAmount,
    currency: offering.currency || "INR",
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        changedAt: new Date(),
        note: "Request submitted by student",
      },
    ],
  });

  return request;
};

/**
 * Step 2: Provider accepts or rejects the tuition request.
 */
export const providerRespondToTuitionRequest = async (
  providerId: string,
  requestId: string,
  action: "accept" | "reject",
  notes?: string
): Promise<ITuitionRequest> => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new Error("Invalid request ID");
  }

  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }

  // Strict ownership check
  if (!request.providerId || request.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You are not the provider for this request");
  }

  // On-access lazy expiration
  if (request.expiresAt && request.expiresAt < new Date()) {
    request.status = "expired";
    request.statusHistory.push({
      status: "expired",
      changedAt: new Date(),
      note: "Request expired due to lapse of response window",
    });
    await request.save();
    throw new Error("Cannot modify request: Tuition request has expired");
  }

  if (request.status !== "pending") {
    throw new Error(`Cannot modify request with current status '${request.status}'`);
  }

  if (action === "reject") {
    request.status = "rejected";
    request.providerResponseNotes = notes?.trim();
    request.statusHistory.push({
      status: "rejected",
      changedAt: new Date(),
      note: notes || "Declined by provider",
    });
    await request.save();
    return request;
  }

  // If accepting a fixed batch request, re-verify seat availability
  if (request.batchId) {
    const batch = await TuitionBatch.findById(request.batchId);
    if (!batch || batch.enrolledCount >= batch.maxCapacity) {
      throw new Error("Cannot accept: Selected batch is full");
    }
  }

  // If accepting a 1:1 flexible slot request, verify provider has no overlapping appointments
  if (request.scheduleModel === "flexible_slot" && request.requestedSlot) {
    const reqDay = request.requestedSlot.day;
    const reqStart = request.requestedSlot.startTime;
    const reqEnd = request.requestedSlot.endTime;

    // Check 1: Provider overlapping recurring batch on the requested day
    const conflictingBatch = await TuitionBatch.findOne({
      providerId: request.providerId,
      status: "active",
      daysOfWeek: reqDay,
      startTime: { $lt: reqEnd },
      endTime: { $gt: reqStart },
    });
    if (conflictingBatch) {
      throw new Error(
        `Double-booking conflict: You already have batch '${conflictingBatch.title}' on ${reqDay} at ${conflictingBatch.startTime}-${conflictingBatch.endTime}`
      );
    }

    // Check 2: Provider already accepted/paid another 1:1 request for the same slot
    const conflictingRequest = await TuitionRequest.findOne({
      _id: { $ne: request._id },
      providerId: request.providerId,
      scheduleModel: "flexible_slot",
      status: { $in: ["accepted", "paid"] },
      "requestedSlot.day": reqDay,
      "requestedSlot.startTime": { $lt: reqEnd },
      "requestedSlot.endTime": { $gt: reqStart },
    });
    if (conflictingRequest) {
      throw new Error(
        `Double-booking conflict: You already have an active/accepted 1:1 booking on ${reqDay} at ${conflictingRequest.requestedSlot?.startTime}-${conflictingRequest.requestedSlot?.endTime}`
      );
    }
  }

  // Generate cryptographic simulated payment order tokens
  const orderId = `TUITION-ORD-${request._id.toString()}`;
  const simulationTxnId = `TXN-TUITION-${crypto.randomBytes(8).toString("hex")}`;
  const simulationToken = generatePaymentSignature(orderId, simulationTxnId);

  request.status = "accepted";
  request.providerResponseNotes = notes?.trim();
  request.simulationPaymentToken = simulationToken;
  request.simulationTransactionId = simulationTxnId;
  request.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days payment window
  request.statusHistory.push({
    status: "accepted",
    changedAt: new Date(),
    note: notes || "Accepted by provider. Payment pending.",
  });

  await request.save();
  return request;
};

export interface SettleTuitionPaymentInput {
  requestId: string;
  gatewayTransactionId: string;
  signature: string;
}

/**
 * Step 3: Student completes simulated payment to activate tuition enrolment.
 */
export const studentVerifyAndSettleTuitionPayment = async (
  studentId: string,
  input: SettleTuitionPaymentInput
): Promise<{ enrollment: ITuitionEnrollment; request: ITuitionRequest }> => {
  if (!mongoose.Types.ObjectId.isValid(input.requestId)) {
    throw new Error("Invalid request ID");
  }

  const request = await TuitionRequest.findById(input.requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }

  // Security check: Only the requesting student can settle payment
  if (request.studentId.toString() !== studentId) {
    throw new Error("Unauthorized: You are not the student for this tuition request");
  }

  // Business rule: Cannot pay before provider acceptance
  if (request.status !== "accepted") {
    throw new Error(
      `Cannot pay for request with status '${request.status}'. Provider acceptance is required first.`
    );
  }

  // Check expiration
  if (request.expiresAt && request.expiresAt < new Date()) {
    throw new Error("Payment window for this request has expired");
  }

  const orderId = `TUITION-ORD-${request._id.toString()}`;

  // Server-side cryptographic signature verification
  const isValidSignature = verifyPaymentSignature(
    orderId,
    input.gatewayTransactionId,
    input.signature
  );
  if (!isValidSignature) {
    throw new Error("Cryptographic payment signature verification failed");
  }

  // Webhook / settlement idempotency: check if transaction ID already recorded
  const existingTx = await TuitionTransaction.findOne({
    gatewayTransactionId: input.gatewayTransactionId,
  });
  if (existingTx) {
    throw new Error("Duplicate payment transaction detected");
  }

  const offering = await TuitionOffering.findById(request.offeringId);
  if (!offering) {
    throw new Error("Tuition offering not found");
  }

  let scheduleDetails: any = {};

  // Atomically update batch capacity if fixed_batch
  if (request.batchId) {
    const updatedBatch = await TuitionBatch.findOneAndUpdate(
      {
        _id: request.batchId,
        $expr: { $lt: ["$enrolledCount", "$maxCapacity"] },
      },
      {
        $inc: { enrolledCount: 1 },
      },
      { returnDocument: "after" }
    );

    if (!updatedBatch) {
      throw new Error(
        "Batch filled up before payment could complete. Please choose another batch or request a refund."
      );
    }

    scheduleDetails = {
      daysOfWeek: updatedBatch.daysOfWeek,
      startTime: updatedBatch.startTime,
      endTime: updatedBatch.endTime,
    };
  } else {
    // 1:1 slot: Database-enforced atomic slot reservation across all 5-minute buckets on concrete calendar date
    if (request.requestedSlot?.startTime && request.requestedSlot?.endTime) {
      const appointmentDate = resolveAppointmentDateString(request.requestedSlot);
      const buckets = generateTimeBuckets(
        request.requestedSlot.startTime,
        request.requestedSlot.endTime,
        5
      );
      const insertedBucketDocs: any[] = [];
      try {
        for (const bucket of buckets) {
          const resDoc = await TuitionSlotReservation.create({
            providerId: request.providerId,
            appointmentDate,
            day: request.requestedSlot.day,
            timeBucket: bucket,
            offeringId: request.offeringId,
            requestId: request._id,
            status: "active",
          });
          insertedBucketDocs.push(resDoc._id);
        }
      } catch (err: any) {
        // Rollback any partial buckets reserved in this concurrent run
        if (insertedBucketDocs.length > 0) {
          await TuitionSlotReservation.deleteMany({ _id: { $in: insertedBucketDocs } });
        }
        if (err.code === 11000 || err.message?.includes("E11000")) {
          throw new Error(
            `Slot conflict: The 1:1 appointment on ${appointmentDate} (${request.requestedSlot.day}) between ${request.requestedSlot.startTime} and ${request.requestedSlot.endTime} has already been reserved or booked by another student.`
          );
        }
        throw err;
      }
    }

    scheduleDetails = {
      slotDay: request.requestedSlot?.day,
      startTime: request.requestedSlot?.startTime,
      endTime: request.requestedSlot?.endTime,
    };
  }

  // Create active enrolment
  const enrollment = await TuitionEnrollment.create({
    studentId: request.studentId,
    providerId: request.providerId,
    offeringId: request.offeringId,
    batchId: request.batchId,
    requestId: request._id,
    subject: request.subject,
    classLevel: offering.classLevel,
    classFormat: request.classFormat,
    teachingMode: request.teachingMode,
    scheduleModel: request.scheduleModel,
    scheduleDetails,
    status: "active",
    feePaid: request.feeAmount,
    currency: request.currency,
    paymentTransactionId: input.gatewayTransactionId,
    enrolledAt: new Date(),
    sessionsAttended: 0,
    totalSessionsConducted: 0,
  });

  // Record separate Tuition transaction ledger
  await TuitionTransaction.create({
    studentId: request.studentId,
    providerId: request.providerId,
    offeringId: request.offeringId,
    requestId: request._id,
    enrollmentId: enrollment._id,
    grossAmount: request.feeAmount,
    currency: request.currency,
    status: "paid",
    gatewayTransactionId: input.gatewayTransactionId,
    paymentMethod: "simulated_gateway",
  });

  // Automatically schedule upcoming sessions for this enrolment
  const sessionDates: Date[] = [];
  const now = new Date();

  if (request.batchId && scheduleDetails.daysOfWeek?.length > 0) {
    const dayMap: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    for (let dayOffset = 1; dayOffset <= 28; dayOffset++) {
      const d = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
      const dayName = Object.keys(dayMap).find((k) => dayMap[k] === d.getDay());
      if (dayName && scheduleDetails.daysOfWeek.includes(dayName)) {
        sessionDates.push(d);
        if (sessionDates.length >= 8) break; // Schedule initial 8 sessions
      }
    }
  } else {
    // Schedule 4 weekly 1:1 sessions
    for (let i = 1; i <= 4; i++) {
      sessionDates.push(new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000));
    }
  }

  // Create scheduled sessions if not already present for batch
  for (const sDate of sessionDates) {
    if (request.batchId) {
      // Find or create session for batch
      let session = await TuitionSession.findOne({
        batchId: request.batchId,
        sessionDate: {
          $gte: new Date(sDate.setHours(0, 0, 0, 0)),
          $lt: new Date(sDate.setHours(23, 59, 59, 999)),
        },
      });
      if (session) {
        if (!session.studentIds.includes(request.studentId)) {
          session.studentIds.push(request.studentId);
          await session.save();
        }
      } else {
        await TuitionSession.create({
          offeringId: request.offeringId,
          batchId: request.batchId,
          providerId: request.providerId,
          studentIds: [request.studentId],
          title: `${offering.subject} - Session`,
          sessionDate: sDate,
          startTime: scheduleDetails.startTime || "18:00",
          endTime: scheduleDetails.endTime || "19:00",
          status: "scheduled",
          meetingProvider: "edupye_smartboard",
          meetingLink: `/teacher/smartboard/integrated?session=${enrollment._id}`,
        });
      }
    } else {
      // 1:1 session
      await TuitionSession.create({
        offeringId: request.offeringId,
        enrollmentId: enrollment._id,
        providerId: request.providerId,
        studentIds: [request.studentId],
        title: `1:1 ${offering.subject} Mentorship`,
        sessionDate: sDate,
        startTime: scheduleDetails.startTime || "18:00",
        endTime: scheduleDetails.endTime || "19:00",
        status: "scheduled",
        meetingProvider: "edupye_smartboard",
        meetingLink: `/teacher/smartboard/integrated?session=${enrollment._id}`,
      });
    }
  }

  // Link active 1:1 reservation to the settled enrolment
  if (!request.batchId) {
    await TuitionSlotReservation.updateMany(
      { requestId: request._id, status: "active" },
      { $set: { enrollmentId: enrollment._id } }
    );
  }

  // Update request state
  request.status = "paid";
  request.paidAt = new Date();
  request.enrollmentId = enrollment._id;
  request.statusHistory.push({
    status: "paid",
    changedAt: new Date(),
    note: `Payment verified (${input.gatewayTransactionId}). Enrolment active.`,
  });
  await request.save();

  return { enrollment, request };
};

/**
 * Step 4: Student cancels a pending or accepted tuition request before settlement.
 */
export const cancelTuitionRequest = async (
  studentId: string,
  requestId: string,
  reason?: string
): Promise<ITuitionRequest> => {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new Error("Invalid request ID");
  }

  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }

  if (request.studentId.toString() !== studentId) {
    throw new Error("Unauthorized: You can only cancel your own tuition request");
  }

  if (request.status !== "pending" && request.status !== "accepted") {
    throw new Error(`Cannot cancel request with current status '${request.status}'`);
  }

  request.status = "cancelled";
  request.statusHistory.push({
    status: "cancelled",
    changedAt: new Date(),
    note: reason?.trim() || "Cancelled by student",
  });

  await request.save();

  // Release any active slot reservations for this request
  await TuitionSlotReservation.updateMany(
    { requestId: request._id, status: "active" },
    { $set: { status: "cancelled" } }
  );

  return request;
};

/**
 * Step 5: Cancel active tuition enrolment with atomic batch capacity release
 * and slot reservation release. Concurrency-safe, idempotent, and transactional with compensation rollback.
 */
export const cancelTuitionEnrollment = async (
  userId: string,
  enrollmentId: string,
  reason?: string
): Promise<ITuitionEnrollment> => {
  if (!mongoose.Types.ObjectId.isValid(enrollmentId)) {
    throw new Error("Invalid enrolment ID");
  }

  const userObjId = new mongoose.Types.ObjectId(userId);

  // 1. ATOMIC CONDITIONAL UPDATE: Only update if status is currently "active"
  const updatedEnrollment = await TuitionEnrollment.findOneAndUpdate(
    {
      _id: enrollmentId,
      status: "active",
      $or: [{ studentId: userObjId }, { providerId: userObjId }, { teacherId: userObjId }],
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: reason?.trim() || "Cancelled by user",
      },
    },
    { returnDocument: "after" }
  );

  // If null, either the enrolment doesn't exist, user lacks permission, or it was ALREADY cancelled
  if (!updatedEnrollment) {
    const existing = await TuitionEnrollment.findById(enrollmentId);
    if (!existing) {
      throw new Error("Tuition enrolment not found");
    }
    const isStudent = existing.studentId.toString() === userId;
    const isProvider =
      existing.providerId?.toString() === userId ||
      existing.teacherId?.toString() === userId;
    if (!isStudent && !isProvider) {
      throw new Error("Unauthorized: You do not have permission to cancel this enrolment");
    }
    if (existing.status !== "active") {
      throw new Error(`Enrolment is already '${existing.status}'. Cannot cancel again.`);
    }
    throw new Error("Failed to cancel enrolment due to concurrent modification");
  }

  // 2. SAFE ATOMIC BATCH CAPACITY RELEASE WITH RECOVERY ROLLBACK
  if (updatedEnrollment.batchId) {
    try {
      await TuitionBatch.findOneAndUpdate(
        {
          _id: updatedEnrollment.batchId,
          enrolledCount: { $gt: 0 },
        },
        {
          $inc: { enrolledCount: -1 },
        }
      );
    } catch (capacityErr: any) {
      // Rollback enrolment status to active to prevent orphaned inconsistent state
      await TuitionEnrollment.findByIdAndUpdate(enrollmentId, {
        $set: { status: "active" },
        $unset: { cancelledAt: 1, cancellationReason: 1 },
      });
      throw new Error(`Capacity release failed; cancellation rolled back: ${capacityErr.message}`);
    }
  }

  // 3. RELEASE 1:1 SLOT RESERVATIONS: Free time buckets in database
  await TuitionSlotReservation.updateMany(
    {
      enrollmentId: updatedEnrollment._id,
      status: "active",
    },
    {
      $set: { status: "cancelled" },
    }
  );

  return updatedEnrollment;
};

/**
 * Step 6: Transition stale pending or accepted requests past their expiresAt to 'expired',
 * and release any held slot reservations.
 */
export const expireStaleRequests = async (): Promise<number> => {
  const now = new Date();
  const staleRequests = await TuitionRequest.find({
    status: { $in: ["pending", "accepted"] },
    expiresAt: { $lt: now },
  }).select("_id");

  const staleIds = staleRequests.map((r) => r._id);

  if (staleIds.length > 0) {
    await TuitionRequest.updateMany(
      { _id: { $in: staleIds } },
      {
        $set: { status: "expired" },
        $push: {
          statusHistory: {
            status: "expired",
            changedAt: now,
            note: "Request expired due to lapse of acceptance/payment window",
          },
        },
      }
    );

    // Release slot reservations held by expired requests
    await TuitionSlotReservation.updateMany(
      { requestId: { $in: staleIds }, status: "active" },
      { $set: { status: "cancelled" } }
    );
  }

  return staleIds.length;
};
