import mongoose from "mongoose";
import TuitionOffering, { ITuitionOffering } from "../models/TuitionOffering";
import TuitionBatch, { ITuitionBatch } from "../models/TuitionBatch";
import TuitionSession, {
  ITuitionSession,
  TuitionSessionStatus,
  TuitionMeetingProvider,
} from "../models/TuitionSession";
import TuitionAttendance, {
  ITuitionAttendance,
  IAttendanceRecord,
} from "../models/TuitionAttendance";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import { createTeacherPayoutForSession } from "./tuition_payout_service";

export const createOffering = async (
  providerId: string,
  offeringData: Partial<ITuitionOffering>
): Promise<ITuitionOffering> => {
  if (!mongoose.Types.ObjectId.isValid(providerId)) {
    throw new Error("Invalid provider ID");
  }

  const profile = await TuitionProviderProfile.findOne({ userId: providerId });
  if (!profile) {
    throw new Error("Provider profile must be submitted before creating offerings");
  }
  if (profile.verificationStatus !== "verified") {
    throw new Error(
      `Unauthorized: Only verified tuition providers can create offerings (current status: ${profile.verificationStatus})`
    );
  }

  if (!offeringData.title?.trim() || !offeringData.subject?.trim() || !offeringData.classLevel?.trim()) {
    throw new Error("Title, subject, and class level are required");
  }
  if (offeringData.feeAmount === undefined || offeringData.feeAmount === null || Number(offeringData.feeAmount) < 0) {
    throw new Error("Valid fee amount is required");
  }

  const classFormat = (offeringData.classFormat || "group") as any;
  const maxCapacity =
    classFormat === "1:1"
      ? 1
      : classFormat === "1:2"
      ? 2
      : Math.max(1, Number(offeringData.maxCapacity) || 10);

  const offering = await TuitionOffering.create({
    ...offeringData,
    providerId: new mongoose.Types.ObjectId(providerId),
    providerProfileId: profile._id,
    title: offeringData.title.trim(),
    subject: offeringData.subject.trim(),
    classLevel: offeringData.classLevel.trim(),
    description: offeringData.description?.trim() || "Comprehensive tuition curriculum and problem solving guidance.",
    teachingMode: offeringData.teachingMode || "online",
    classFormat,
    scheduleModel: offeringData.scheduleModel || "fixed_batch",
    maxCapacity,
    feeAmount: Number(offeringData.feeAmount),
    billingUnit: offeringData.billingUnit || "monthly",
    currency: offeringData.currency || "INR",
    availableDays: offeringData.availableDays || [],
    timeSlots: offeringData.timeSlots || [],
    startDate: offeringData.startDate,
    durationWeeks: offeringData.durationWeeks,
    duration: offeringData.duration?.trim(),
    totalSessionsPlanned: offeringData.totalSessionsPlanned,
    status: offeringData.status || "published",
    isActive: offeringData.status === "archived" ? false : true,
  });

  return offering;
};

export const updateOffering = async (
  providerId: string,
  offeringId: string,
  updateData: Partial<ITuitionOffering>
): Promise<ITuitionOffering> => {
  if (!mongoose.Types.ObjectId.isValid(offeringId)) {
    throw new Error("Invalid offering ID");
  }

  const offering = await TuitionOffering.findById(offeringId);
  if (!offering) {
    throw new Error("Tuition offering not found");
  }

  if (offering.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You can only edit your own offerings");
  }

  if (updateData.title !== undefined && !updateData.title.trim()) {
    throw new Error("Offering title cannot be empty");
  }
  if (updateData.subject !== undefined && !updateData.subject.trim()) {
    throw new Error("Offering subject cannot be empty");
  }
  if (updateData.classLevel !== undefined && !updateData.classLevel.trim()) {
    throw new Error("Offering class level cannot be empty");
  }
  if (updateData.feeAmount !== undefined && Number(updateData.feeAmount) < 0) {
    throw new Error("Fee amount cannot be negative");
  }

  if (updateData.title !== undefined) offering.title = updateData.title.trim();
  if (updateData.subject !== undefined) offering.subject = updateData.subject.trim();
  if (updateData.classLevel !== undefined) offering.classLevel = updateData.classLevel.trim();
  if (updateData.description !== undefined) offering.description = updateData.description.trim();
  if (updateData.teachingMode !== undefined) offering.teachingMode = updateData.teachingMode;
  if (updateData.billingUnit !== undefined) offering.billingUnit = updateData.billingUnit;
  if (updateData.currency !== undefined) offering.currency = updateData.currency;
  if (updateData.availableDays !== undefined) offering.availableDays = updateData.availableDays;
  if (updateData.timeSlots !== undefined) offering.timeSlots = updateData.timeSlots;
  if (updateData.startDate !== undefined) offering.startDate = updateData.startDate;
  if (updateData.durationWeeks !== undefined) offering.durationWeeks = updateData.durationWeeks;
  if (updateData.duration !== undefined) offering.duration = updateData.duration.trim();
  if (updateData.totalSessionsPlanned !== undefined) offering.totalSessionsPlanned = updateData.totalSessionsPlanned;

  if (updateData.feeAmount !== undefined) {
    offering.feeAmount = Number(updateData.feeAmount);
  }

  if (updateData.classFormat !== undefined) {
    offering.classFormat = updateData.classFormat;
    if (updateData.classFormat === "1:1") offering.maxCapacity = 1;
    else if (updateData.classFormat === "1:2") offering.maxCapacity = 2;
    else if (updateData.maxCapacity !== undefined) offering.maxCapacity = Math.max(1, Number(updateData.maxCapacity));
  } else if (updateData.maxCapacity !== undefined) {
    offering.maxCapacity = Math.max(1, Number(updateData.maxCapacity));
  }

  if (updateData.scheduleModel !== undefined) {
    offering.scheduleModel = updateData.scheduleModel;
  }

  if (updateData.status !== undefined) {
    offering.status = updateData.status;
    offering.isActive = updateData.status === "archived" ? false : true;
  }

  await offering.save();
  return offering;
};

export const getOfferingDetails = async (
  offeringId: string,
  providerId?: string
): Promise<{ offering: ITuitionOffering; batches: ITuitionBatch[] }> => {
  if (!mongoose.Types.ObjectId.isValid(offeringId)) {
    throw new Error("Invalid offering ID");
  }

  const offering = await TuitionOffering.findById(offeringId).populate("providerProfileId");
  if (!offering) {
    throw new Error("Tuition offering not found");
  }

  if (providerId && offering.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You can only view your own offering management details");
  }

  const batches = await TuitionBatch.find({ offeringId: offering._id }).sort({ createdAt: -1 });

  return { offering, batches };
};

export const deleteOffering = async (
  providerId: string,
  offeringId: string
): Promise<{ success: boolean; message: string }> => {
  if (!mongoose.Types.ObjectId.isValid(offeringId)) {
    throw new Error("Invalid offering ID");
  }

  const offering = await TuitionOffering.findById(offeringId);
  if (!offering) {
    throw new Error("Tuition offering not found");
  }

  if (offering.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You can only delete or archive your own offerings");
  }

  // Safe deactivation / archiving
  offering.status = "archived";
  offering.isActive = false;
  await offering.save();

  // Also transition linked active batches to cancelled
  await TuitionBatch.updateMany(
    { offeringId: offering._id, status: { $in: ["upcoming", "active"] } },
    { status: "cancelled" }
  );

  return { success: true, message: "Offering archived successfully" };
};

export const createBatch = async (
  providerId: string,
  batchData: Partial<ITuitionBatch>
): Promise<ITuitionBatch> => {
  if (!batchData.offeringId || !mongoose.Types.ObjectId.isValid(batchData.offeringId.toString())) {
    throw new Error("Valid offering ID is required");
  }

  const offering = await TuitionOffering.findById(batchData.offeringId);
  if (!offering || offering.providerId.toString() !== providerId) {
    throw new Error("Unauthorized or offering not found");
  }

  if (offering.status === "archived" || !offering.isActive) {
    throw new Error("Cannot create a batch for an archived or inactive offering");
  }

  if ((batchData as any).enrolledCount !== undefined && Number((batchData as any).enrolledCount) !== 0) {
    throw new Error(
      "Direct assignment of enrolledCount is not permitted; enrolment counts are managed by authorized platform workflows"
    );
  }

  if (!batchData.title?.trim()) {
    throw new Error("Batch title is required");
  }
  if (!batchData.daysOfWeek || batchData.daysOfWeek.length === 0) {
    throw new Error("At least one day of the week is required");
  }
  if (!batchData.startTime || !batchData.endTime) {
    throw new Error("Start and end time are required");
  }

  const startTime = batchData.startTime.trim();
  const endTime = batchData.endTime.trim();
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    throw new Error("Start time and end time must be in 24-hour HH:mm format (e.g. 09:00, 18:30)");
  }
  if (startTime >= endTime) {
    throw new Error("Batch start time must be earlier than end time");
  }

  const timezone = batchData.timezone ? batchData.timezone.trim() : "Asia/Kolkata";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new Error(`Invalid IANA time zone: '${timezone}'`);
  }

  const maxCapacity = Math.max(
    1,
    batchData.maxCapacity !== undefined ? Number(batchData.maxCapacity) : offering.maxCapacity
  );

  if (offering.classFormat === "1:1" && maxCapacity > 1) {
    throw new Error("1:1 offerings cannot have a batch capacity greater than 1");
  }
  if (offering.classFormat === "1:2" && maxCapacity > 2) {
    throw new Error("1:2 offerings cannot have a batch capacity greater than 2");
  }

  // Double-booking check: Ensure provider doesn't already have an overlapping active batch on the same days & times
  const existingOverlapping = await TuitionBatch.findOne({
    providerId: offering.providerId,
    status: "active",
    daysOfWeek: { $in: batchData.daysOfWeek },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
  if (existingOverlapping) {
    throw new Error(
      `Double-booking conflict: You already have an active batch ('${existingOverlapping.title}') scheduled on matching days at ${existingOverlapping.startTime} - ${existingOverlapping.endTime}`
    );
  }

  const batch = await TuitionBatch.create({
    offeringId: offering._id,
    providerId: offering.providerId,
    title: batchData.title.trim(),
    subject: batchData.subject?.trim() || offering.subject,
    classLevel: batchData.classLevel?.trim() || offering.classLevel,
    teachingMode: batchData.teachingMode || offering.teachingMode,
    daysOfWeek: batchData.daysOfWeek,
    startTime,
    endTime,
    maxCapacity,
    enrolledCount: 0,
    timezone: batchData.timezone || "Asia/Kolkata",
    startDate: batchData.startDate || new Date(),
    endDate: batchData.endDate,
    status: batchData.status || "active",
    notes: batchData.notes?.trim(),
  });

  return batch;
};

export const updateBatch = async (
  providerId: string,
  batchId: string,
  updateData: Partial<ITuitionBatch>
): Promise<ITuitionBatch> => {
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new Error("Invalid batch ID");
  }

  const batch = await TuitionBatch.findById(batchId);
  if (!batch) {
    throw new Error("Tuition batch not found");
  }

  if (batch.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You can only edit your own batches");
  }

  // Security Guard: Providers cannot directly modify enrolledCount
  if ((updateData as any).enrolledCount !== undefined) {
    throw new Error(
      "Direct modification of enrolledCount is not permitted; enrolment counts are managed by authorized platform workflows"
    );
  }

  if (updateData.title !== undefined && !updateData.title.trim()) {
    throw new Error("Batch title cannot be empty");
  }

  // Capacity Integrity Guard: prevent setting maxCapacity below current enrolledCount
  if (updateData.maxCapacity !== undefined) {
    const newCap = Number(updateData.maxCapacity);
    if (newCap < 1) {
      throw new Error("Maximum capacity must be at least 1");
    }
    if (newCap < batch.enrolledCount) {
      throw new Error(
        `Capacity integrity violation: Cannot set max capacity (${newCap}) lower than current enrolled count (${batch.enrolledCount})`
      );
    }
    batch.maxCapacity = newCap;
  }

  const newStartTime = updateData.startTime ? updateData.startTime.trim() : batch.startTime;
  const newEndTime = updateData.endTime ? updateData.endTime.trim() : batch.endTime;
  const newDays = updateData.daysOfWeek || batch.daysOfWeek;

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
    throw new Error("Start time and end time must be in 24-hour HH:mm format (e.g. 09:00, 18:30)");
  }

  if (newStartTime >= newEndTime) {
    throw new Error("Batch start time must be earlier than end time");
  }

  if (updateData.timezone !== undefined) {
    const tz = updateData.timezone.trim();
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw new Error(`Invalid IANA time zone: '${tz}'`);
    }
    batch.timezone = tz;
  }

  // Check double-booking if timing or days changed
  if (updateData.startTime || updateData.endTime || updateData.daysOfWeek) {
    const conflicting = await TuitionBatch.findOne({
      _id: { $ne: batch._id },
      providerId: batch.providerId,
      status: "active",
      daysOfWeek: { $in: newDays },
      startTime: { $lt: newEndTime },
      endTime: { $gt: newStartTime },
    });
    if (conflicting) {
      throw new Error(
        `Double-booking conflict: Overlaps with existing active batch '${conflicting.title}' (${conflicting.startTime} - ${conflicting.endTime})`
      );
    }
  }

  if (updateData.title !== undefined) batch.title = updateData.title.trim();
  if (updateData.daysOfWeek !== undefined) batch.daysOfWeek = updateData.daysOfWeek;
  batch.startTime = newStartTime;
  batch.endTime = newEndTime;
  if (updateData.subject !== undefined) batch.subject = updateData.subject.trim();
  if (updateData.classLevel !== undefined) batch.classLevel = updateData.classLevel.trim();
  if (updateData.teachingMode !== undefined) batch.teachingMode = updateData.teachingMode;
  if (updateData.startDate !== undefined) batch.startDate = updateData.startDate;
  if (updateData.endDate !== undefined) batch.endDate = updateData.endDate;
  if (updateData.status !== undefined) batch.status = updateData.status;
  if (updateData.notes !== undefined) batch.notes = updateData.notes.trim();

  await batch.save();
  return batch;
};

export const getBatchDetails = async (
  batchId: string,
  providerId?: string
): Promise<ITuitionBatch> => {
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new Error("Invalid batch ID");
  }

  const batch = await TuitionBatch.findById(batchId).populate("offeringId");
  if (!batch) {
    throw new Error("Tuition batch not found");
  }

  if (providerId && batch.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You can only view your own batch details");
  }

  return batch;
};

export const deleteBatch = async (
  providerId: string,
  batchId: string
): Promise<{ success: boolean; message: string }> => {
  if (!mongoose.Types.ObjectId.isValid(batchId)) {
    throw new Error("Invalid batch ID");
  }

  const batch = await TuitionBatch.findById(batchId);
  if (!batch) {
    throw new Error("Tuition batch not found");
  }

  if (batch.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: You can only delete or cancel your own batches");
  }

  // Safe cancellation to preserve enrolled students and history
  batch.status = "cancelled";
  await batch.save();

  return { success: true, message: "Batch cancelled successfully" };
};

export const getProviderSchedule = async (
  providerId: string,
  startDate?: Date,
  endDate?: Date
) => {
  const providerObjId = new mongoose.Types.ObjectId(providerId);
  const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const sessions = await TuitionSession.find({
    providerId: providerObjId,
    sessionDate: { $gte: start, $lte: end },
  })
    .populate("offeringId", "title subject classLevel classFormat")
    .populate("batchId", "title maxCapacity enrolledCount")
    .populate("studentIds", "name email")
    .sort({ sessionDate: 1, startTime: 1 })
    .lean();

  const batches = await TuitionBatch.find({
    providerId: providerObjId,
    status: "active",
  })
    .populate("offeringId", "title subject classLevel feeAmount")
    .lean();

  return { sessions, batches };
};

export const getStudentSchedule = async (
  studentId: string,
  startDate?: Date,
  endDate?: Date
) => {
  const studentObjId = new mongoose.Types.ObjectId(studentId);
  const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const sessions = await TuitionSession.find({
    studentIds: studentObjId,
    sessionDate: { $gte: start, $lte: end },
  })
    .populate("offeringId", "title subject classLevel teachingMode")
    .populate("providerId", "name email")
    .sort({ sessionDate: 1, startTime: 1 })
    .lean();

  return sessions;
};

export const updateSessionStatus = async (
  providerId: string,
  sessionId: string,
  status: TuitionSessionStatus,
  meetingLink?: string
): Promise<ITuitionSession> => {
  const session = await TuitionSession.findById(sessionId);
  if (!session) {
    throw new Error("Tuition session not found");
  }

  if (session.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: Only the assigned provider can update session status");
  }

  session.status = status;
  if (meetingLink) session.meetingLink = meetingLink;

  if (status === "live") {
    session.startedAt = new Date();
  } else if (status === "completed") {
    session.endedAt = new Date();

    // Increment totalSessionsConducted on linked enrolments
    if (session.enrollmentId) {
      await TuitionEnrollment.findByIdAndUpdate(session.enrollmentId, {
        $inc: { totalSessionsConducted: 1, hoursCompleted: 1, hoursRemaining: -1 },
      });
    } else if (session.batchId) {
      await TuitionEnrollment.updateMany(
        { batchId: session.batchId, status: "active" },
        { $inc: { totalSessionsConducted: 1 } }
      );
    }

    try {
      await createTeacherPayoutForSession(session._id.toString());
    } catch (e: any) {
      console.warn("Auto-payout generation deferred:", e?.message);
    }
  }

  await session.save();
  return session;
};

export const recordAttendance = async (
  providerId: string,
  sessionId: string,
  records: IAttendanceRecord[]
): Promise<ITuitionAttendance> => {
  const session = await TuitionSession.findById(sessionId);
  if (!session) {
    throw new Error("Tuition session not found");
  }

  if (session.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: Only the assigned provider can mark attendance");
  }

  let attendance = await TuitionAttendance.findOne({ sessionId: session._id });

  if (attendance) {
    attendance.records = records;
    await attendance.save();
  } else {
    attendance = await TuitionAttendance.create({
      sessionId: session._id,
      providerId: session.providerId,
      records,
    });
  }

  // Update sessionsAttended on student enrolments
  for (const record of records) {
    if (record.status === "present" || record.status === "late") {
      await TuitionEnrollment.findOneAndUpdate(
        {
          providerId: session.providerId,
          offeringId: session.offeringId,
          studentId: record.studentId,
          status: "active",
        },
        {
          $inc: { sessionsAttended: 1 },
        }
      );
    }
  }

  return attendance;
};

/**
 * Creates an ad-hoc or scheduled session for a batch or 1:1 enrollment.
 */
export const createSession = async (
  providerId: string,
  sessionData: {
    offeringId?: string;
    batchId?: string;
    enrollmentId?: string;
    title: string;
    topic?: string;
    sessionDate: Date;
    startTime: string;
    endTime: string;
    meetingProvider?: TuitionMeetingProvider;
    meetingLink?: string;
    notes?: string;
  }
): Promise<ITuitionSession> => {
  let offering: any = null;
  let studentIds: mongoose.Types.ObjectId[] = [];

  if (sessionData.enrollmentId) {
    if (!mongoose.Types.ObjectId.isValid(sessionData.enrollmentId)) {
      throw new Error("Invalid enrollment ID");
    }
    const enr = await TuitionEnrollment.findById(sessionData.enrollmentId);
    if (!enr) {
      throw new Error("Enrollment not found");
    }
    if (
      enr.providerId.toString() !== providerId &&
      enr.teacherId?.toString() !== providerId
    ) {
      throw new Error("Unauthorized: Only assigned teacher can schedule class for this enrollment");
    }
    studentIds = [enr.studentId];
    if (enr.offeringId) {
      offering = await TuitionOffering.findById(enr.offeringId);
    }
  } else if (sessionData.offeringId) {
    if (!mongoose.Types.ObjectId.isValid(sessionData.offeringId)) {
      throw new Error("Invalid offering ID");
    }
    offering = await TuitionOffering.findById(sessionData.offeringId);
    if (!offering || offering.providerId.toString() !== providerId) {
      throw new Error("Unauthorized or offering not found");
    }
    if (sessionData.batchId) {
      const enrolments = await TuitionEnrollment.find({
        batchId: sessionData.batchId,
        status: "active",
      });
      studentIds = enrolments.map((e) => e.studentId);
    }
  } else {
    throw new Error("Either enrollmentId or offeringId is required to schedule a session");
  }

  const startTime = sessionData.startTime.trim();
  const endTime = sessionData.endTime.trim();
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    throw new Error("Start and end times must be in 24-hour HH:mm format (e.g. 18:00)");
  }
  if (startTime >= endTime) {
    throw new Error("Session start time must be earlier than end time");
  }

  const targetDate = new Date(sessionData.sessionDate);
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

  // Check collision for the provider
  const conflicting = await TuitionSession.findOne({
    providerId: new mongoose.Types.ObjectId(providerId),
    status: { $in: ["scheduled", "live"] },
    sessionDate: { $gte: dayStart, $lte: dayEnd },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  });
  if (conflicting) {
    throw new Error(
      `Double-booking conflict: You already have a session ('${conflicting.title}') scheduled at ${conflicting.startTime} - ${conflicting.endTime}`
    );
  }

  const session = await TuitionSession.create({
    offeringId: offering?._id,
    batchId: sessionData.batchId,
    enrollmentId: sessionData.enrollmentId,
    providerId: new mongoose.Types.ObjectId(providerId),
    teacherId: new mongoose.Types.ObjectId(providerId),
    studentIds,
    title: sessionData.title.trim(),
    topic: sessionData.topic?.trim(),
    sessionDate: targetDate,
    startTime,
    endTime,
    status: "scheduled",
    meetingProvider: sessionData.meetingProvider || "edupye_smartboard",
    meetingLink: sessionData.meetingLink || `/live-classroom/tuition-${Date.now()}`,
    timezone: "Asia/Kolkata",
    notes: sessionData.notes?.trim(),
  });

  return session;
};

/**
 * Reschedule a tuition session with provider conflict detection.
 */
export const rescheduleSession = async (
  providerId: string,
  sessionId: string,
  newDate: Date,
  newStartTime: string,
  newEndTime: string,
  reason: string
): Promise<ITuitionSession> => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new Error("Invalid session ID");
  }

  const session = await TuitionSession.findById(sessionId);
  if (!session) {
    throw new Error("Tuition session not found");
  }

  if (session.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: Only the assigned provider can reschedule this session");
  }

  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error(`Cannot reschedule session with status '${session.status}'`);
  }

  const targetDate = new Date(newDate);
  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
  const dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

  // Conflict check: Ensure provider has no other active session at that day/time
  const conflicting = await TuitionSession.findOne({
    _id: { $ne: session._id },
    providerId: session.providerId,
    status: { $in: ["scheduled", "live"] },
    sessionDate: { $gte: dayStart, $lte: dayEnd },
    startTime: { $lt: newEndTime.trim() },
    endTime: { $gt: newStartTime.trim() },
  });
  if (conflicting) {
    throw new Error(
      `Reschedule conflict: You already have a session ('${conflicting.title}') scheduled at that time`
    );
  }

  session.rescheduledFromSessionId = session._id;
  session.rescheduleReason = reason?.trim();
  session.sessionDate = targetDate;
  session.startTime = newStartTime.trim();
  session.endTime = newEndTime.trim();
  session.status = "scheduled";

  await session.save();
  return session;
};

/**
 * Cancel a scheduled tuition session with reason.
 */
export const cancelSession = async (
  providerId: string,
  sessionId: string,
  reason: string
): Promise<ITuitionSession> => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new Error("Invalid session ID");
  }

  const session = await TuitionSession.findById(sessionId);
  if (!session) {
    throw new Error("Tuition session not found");
  }

  if (session.providerId.toString() !== providerId) {
    throw new Error("Unauthorized: Only the assigned provider can cancel this session");
  }

  if (session.status === "completed" || session.status === "cancelled") {
    throw new Error(`Cannot cancel session with status '${session.status}'`);
  }

  session.status = "cancelled";
  session.cancelledAt = new Date();
  session.cancellationReason = reason?.trim() || "Cancelled by provider";

  await session.save();
  return session;
};

