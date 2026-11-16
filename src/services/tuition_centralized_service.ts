import mongoose from "mongoose";
import TuitionRequest, {
  ITuitionRequest,
  ITrialSessionSlot,
  TuitionCurriculum,
} from "../models/TuitionRequest";
import TuitionEnrollment, { ITuitionEnrollment } from "../models/TuitionEnrollment";
import TuitionSession, { ITuitionSession } from "../models/TuitionSession";
import TeacherAssignment, { ITeacherAssignment } from "../models/TeacherAssignment";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import CalendarEvent from "../models/CalendarEvent";
import TuitionAttendance from "../models/TuitionAttendance";
import TuitionTransaction from "../models/TuitionTransaction";
import { resolveTuitionPricing, generatePricingSnapshot } from "./tuition_pricing_service";
import { createTeacherPayoutForSession } from "./tuition_payout_service";

/**
 * Calculates end time 30 minutes after startTime in HH:mm format.
 */
function add30Minutes(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + 30;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/**
 * Check student eligibility for trial sessions.
 * Returns true if student has not yet used their 3 trial classes for this subject.
 */
export async function checkStudentTrialEligibility(
  studentId: string,
  subject: string
): Promise<{ isEligible: boolean; trialsTaken: number }> {
  const completedTrialRequests = await TuitionRequest.find({
    studentId: new mongoose.Types.ObjectId(studentId),
    subject: new RegExp(`^${subject.trim()}$`, "i"),
    "trialSessions.status": "completed",
  }).lean();

  let trialsTaken = 0;
  for (const req of completedTrialRequests) {
    trialsTaken += req.trialSessions.filter((t) => t.status === "completed").length;
  }

  return {
    isEligible: trialsTaken < 3,
    trialsTaken,
  };
}

export interface CentralizedTuitionRequestInput {
  subject: string;
  classLevel: string;
  curriculum?: TuitionCurriculum;
  learningGoals?: string;
  preferredDays?: string[];
  preferredTimeSlot?: {
    startTime: string;
    endTime: string;
    timezone?: string;
  };
  totalHoursRequested?: number;
  studentNotes?: string;
  skipTrials?: boolean;
}

/**
 * Step 1: Student submits a centralized 1:1 tuition request to EduPye.
 */
export async function submitCentralizedTuitionRequest(
  studentId: string,
  input: CentralizedTuitionRequestInput
): Promise<ITuitionRequest> {
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    throw new Error("Invalid student ID");
  }
  if (!input.subject?.trim()) {
    throw new Error("Subject is required");
  }
  if (!input.classLevel?.trim()) {
    throw new Error("Class level / grade is required");
  }

  const curriculum = input.curriculum || "CBSE";
  const { isEligible } = await checkStudentTrialEligibility(studentId, input.subject);
  const isTrialRequest = isEligible && !input.skipTrials;

  // Resolve pricing snapshot
  const pricing = await resolveTuitionPricing({
    subject: input.subject,
    classLevel: input.classLevel,
    curriculum,
  });

  const totalHours = isTrialRequest ? 0 : input.totalHoursRequested || 10;
  const pricingSnapshot = generatePricingSnapshot(
    pricing.studentHourlyRate,
    totalHours,
    pricing.currency,
    pricing.teacherHourlyPayoutRate
  );

  // Initialize trial session slots if trial eligible
  const trialSessions: ITrialSessionSlot[] = isTrialRequest
    ? [
        { trialIndex: 1, status: "pending_assignment" },
        { trialIndex: 2, status: "pending_assignment" },
        { trialIndex: 3, status: "pending_assignment" },
      ]
    : [];

  const request = await TuitionRequest.create({
    studentId: new mongoose.Types.ObjectId(studentId),
    subject: input.subject.trim(),
    classLevel: input.classLevel.trim(),
    curriculum,
    learningGoals: input.learningGoals?.trim(),
    preferredDays: input.preferredDays || [],
    preferredTimeSlot: input.preferredTimeSlot,
    studentNotes: input.studentNotes?.trim(),
    classFormat: "1:1",
    teachingMode: "online",
    scheduleModel: "flexible_slot",
    requestType: isTrialRequest ? "trial" : "regular",
    isTrialEligible: isEligible,
    trialSessions,
    feeAmount: pricingSnapshot.totalAmount,
    currency: pricingSnapshot.currency,
    pricingSnapshot,
    status: "pending",
    statusHistory: [
      {
        status: "pending",
        changedAt: new Date(),
        note: isTrialRequest
          ? "Tuition request submitted. Eligible for three 30-minute trial classes."
          : "Tuition request submitted for direct 1:1 teacher allocation.",
      },
    ],
  });

  return request;
}

export interface TrialTeacherAllocationSlot {
  trialIndex: 1 | 2 | 3;
  teacherId: string;
  scheduledDate: string; // ISO date string or YYYY-MM-DD
  startTime: string; // HH:mm
}

/**
 * Step 2: Admin allocates three distinct teachers for the student's 3 trial sessions.
 */
export async function adminAssignTrialTeachers(
  adminUserId: string,
  requestId: string,
  allocations: TrialTeacherAllocationSlot[],
  adminNotes?: string
): Promise<ITuitionRequest> {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new Error("Invalid request ID");
  }
  if (!Array.isArray(allocations) || allocations.length !== 3) {
    throw new Error("Exactly three distinct trial teacher allocations are required");
  }

  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }
  if (request.status === "cancelled" || request.status === "rejected") {
    throw new Error(`Cannot allocate teachers to a request in status: ${request.status}`);
  }

  // Prevent duplicate trial assignments
  if (
    request.status === "trial_assigned" ||
    request.status === "trial_in_progress" ||
    request.status === "trial_completed" ||
    request.status === "teacher_assigned" ||
    request.status === "enrolled"
  ) {
    throw new Error(
      `Trial sessions have already been assigned for this request (current status: ${request.status}). Duplicate assignment is prevented.`
    );
  }

  const existingSessions = await TuitionSession.find({
    requestId: request._id,
    isTrial: true,
    status: { $ne: "cancelled" },
  });
  if (existingSessions.length > 0) {
    throw new Error(
      "Active trial sessions already exist for this request. Duplicate allocation is prevented."
    );
  }

  // Validate that all three teachers are distinct
  const teacherIds = allocations.map((a) => a.teacherId);
  const uniqueTeachers = new Set(teacherIds);
  if (uniqueTeachers.size !== 3) {
    throw new Error("Each trial class must be allocated to a different, distinct teacher");
  }

  // Verify that all 3 teachers are verified tuition providers
  for (const tid of teacherIds) {
    if (!mongoose.Types.ObjectId.isValid(tid)) {
      throw new Error(`Invalid teacher ID: ${tid}`);
    }
    const profile = await TuitionProviderProfile.findOne({ userId: tid });
    if (!profile || profile.verificationStatus !== "verified") {
      throw new Error(
        `Teacher ${tid} is not a verified tuition provider (status: ${profile?.verificationStatus || "none"})`
      );
    }
  }

  const updatedSlots: ITrialSessionSlot[] = [];

  for (const alloc of allocations) {
    const teacherObjId = new mongoose.Types.ObjectId(alloc.teacherId);
    const sessionDate = new Date(alloc.scheduledDate);
    const startTime = alloc.startTime.trim();
    const endTime = add30Minutes(startTime);

    // Resolve teacher-specific payout rate
    const pricing = await resolveTuitionPricing({
      subject: request.subject,
      classLevel: request.classLevel,
      curriculum: request.curriculum,
      teacherId: alloc.teacherId,
    });

    // 1. Create or update TeacherAssignment record
    await TeacherAssignment.findOneAndUpdate(
      {
        requestId: request._id,
        teacherId: teacherObjId,
        assignmentType: "trial",
      },
      {
        requestId: request._id,
        studentId: request.studentId,
        teacherId: teacherObjId,
        assignedByAdminId: new mongoose.Types.ObjectId(adminUserId),
        assignmentType: "trial",
        trialIndex: alloc.trialIndex,
        subject: request.subject,
        classLevel: request.classLevel,
        curriculum: request.curriculum,
        studentHourlyRate: 0, // Trials are free for students
        teacherHourlyPayoutRate: pricing.teacherHourlyPayoutRate,
        currency: pricing.currency,
        status: "assigned",
        assignedAt: new Date(),
        statusHistory: [
          {
            status: "assigned",
            changedAt: new Date(),
            changedBy: new mongoose.Types.ObjectId(adminUserId),
            reason: `Admin allocated trial #${alloc.trialIndex}`,
          },
        ],
      },
      { upsert: true, new: true }
    );

    // 2. Create 30-minute TuitionSession
    const session = await TuitionSession.create({
      requestId: request._id,
      providerId: teacherObjId,
      teacherId: teacherObjId,
      studentIds: [request.studentId],
      title: `${request.subject} - 30 Min Trial Class #${alloc.trialIndex}`,
      subject: request.subject,
      curriculum: request.curriculum,
      sessionDate,
      startTime,
      endTime,
      durationMinutes: 30,
      isTrial: true,
      trialIndex: alloc.trialIndex,
      sessionType: "trial",
      hourlyRate: 0,
      teacherPayoutRate: pricing.teacherHourlyPayoutRate,
      status: "scheduled",
      meetingProvider: "edupye_smartboard",
      meetingLink: `/live-classroom/tuition-${request._id}-trial-${alloc.trialIndex}`,
    });

    // 3. Create Calendar Events for both Student and Teacher
    const dateStr = sessionDate.toISOString().split("T")[0];
    await CalendarEvent.create([
      {
        userId: request.studentId,
        title: `Trial Class #${alloc.trialIndex}: ${request.subject}`,
        description: `30-minute 1:1 Trial class with teacher`,
        eventType: "class",
        date: dateStr,
        startTime,
        endTime,
        isCompleted: false,
      },
      {
        userId: teacherObjId,
        title: `1:1 Trial Class #${alloc.trialIndex}: ${request.subject}`,
        description: `30-minute trial session with student`,
        eventType: "class",
        date: dateStr,
        startTime,
        endTime,
        isCompleted: false,
      },
    ]);

    updatedSlots.push({
      trialIndex: alloc.trialIndex,
      teacherId: teacherObjId,
      sessionId: session._id as mongoose.Types.ObjectId,
      scheduledDate: sessionDate,
      startTime,
      endTime,
      status: "scheduled",
    });
  }

  request.trialSessions = updatedSlots;
  request.status = "trial_assigned";
  request.assignedByAdminId = new mongoose.Types.ObjectId(adminUserId);
  request.assignedAt = new Date();
  if (adminNotes) request.adminNotes = adminNotes;

  request.statusHistory.push({
    status: "trial_assigned",
    changedAt: new Date(),
    note: "Three distinct teachers allocated for 30-minute trial sessions.",
  });

  await request.save();
  return request;
}

/**
 * Step 3: Complete a trial session, record attendance, and trigger teacher payout.
 */
export async function completeTrialSession(
  sessionId: string,
  providerId: string,
  attendanceRecord?: {
    status: "present" | "absent" | "late";
    remarks?: string;
  }
): Promise<ITuitionSession> {
  const session = await TuitionSession.findById(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (!session.isTrial) {
    throw new Error("Session is not a trial class");
  }

  session.status = "completed";
  session.endedAt = new Date();
  await session.save();

  // Record Attendance
  const studentId = session.studentIds[0];
  const attendanceStatus = attendanceRecord?.status || "present";
  const attendance = await TuitionAttendance.findOneAndUpdate(
    { sessionId: session._id },
    {
      sessionId: session._id,
      providerId: session.providerId,
      records: [
        {
          studentId,
          status: attendanceStatus,
          remarks: attendanceRecord?.remarks || "Trial session completed",
          markedAt: new Date(),
        },
      ],
    },
    { upsert: true, new: true }
  );

  session.attendanceId = attendance._id as mongoose.Types.ObjectId;
  await session.save();

  // Create Teacher Payout entry (0.5 hour trial)
  const payout = await createTeacherPayoutForSession(session._id.toString());
  session.payoutId = payout._id as mongoose.Types.ObjectId;
  await session.save();

  // Update linked TuitionRequest
  if (session.requestId) {
    const request = await TuitionRequest.findById(session.requestId);
    if (request) {
      const slot = request.trialSessions.find((s) => s.trialIndex === session.trialIndex);
      if (slot) {
        slot.status = "completed";
        slot.attendanceStatus = attendanceStatus;
        slot.attendedAt = new Date();
      }

      // Check if all 3 trials are completed
      const allCompleted = request.trialSessions.every((s) => s.status === "completed");
      if (allCompleted) {
        request.status = "trial_completed";
        request.statusHistory.push({
          status: "trial_completed",
          changedAt: new Date(),
          note: "All three trial classes completed. Ready for student feedback and teacher selection.",
        });
      } else {
        request.status = "trial_in_progress";
      }
      await request.save();
    }
  }

  return session;
}

/**
 * Step 4: Student provides rating (1-5) and feedback for a trial session.
 */
export async function submitTrialFeedback(
  studentId: string,
  requestId: string,
  trialIndex: number,
  rating: number,
  feedback: string
): Promise<ITuitionRequest> {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new Error("Invalid request ID");
  }
  if (rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5 stars");
  }

  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }
  if (request.studentId.toString() !== studentId) {
    throw new Error("Unauthorized: You can only review your own trial sessions");
  }

  const slot = request.trialSessions.find((s) => s.trialIndex === trialIndex);
  if (!slot) {
    throw new Error(`Trial session #${trialIndex} not found in this request`);
  }
  if (slot.status !== "completed") {
    throw new Error(
      `Cannot submit feedback: Trial session #${trialIndex} has not been completed yet (current status: ${slot.status})`
    );
  }

  slot.studentRating = rating;
  slot.studentFeedback = feedback.trim();
  slot.feedbackSubmittedAt = new Date();

  await request.save();
  return request;
}

/**
 * Step 5: Student selects their preferred teacher from among the 3 trial teachers.
 */
export async function selectPreferredTeacher(
  studentId: string,
  requestId: string,
  preferredTeacherId: string,
  preferredTeacherNotes?: string
): Promise<ITuitionRequest> {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new Error("Invalid request ID");
  }
  if (!mongoose.Types.ObjectId.isValid(preferredTeacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }
  if (request.studentId.toString() !== studentId) {
    throw new Error("Unauthorized: You can only select teachers for your own tuition requests");
  }

  // Enforce that all 3 trial classes must be completed before selecting preferred teacher
  const allTrialsCompleted =
    request.trialSessions &&
    request.trialSessions.length === 3 &&
    request.trialSessions.every((s) => s.status === "completed");

  if (!allTrialsCompleted) {
    throw new Error(
      "Cannot select preferred teacher: all three trial classes must be completed before selecting a preferred teacher."
    );
  }

  // Verify that the preferred teacher was one of the assigned trial teachers
  const trialTeacherIds = request.trialSessions
    .map((s) => s.teacherId?.toString())
    .filter(Boolean);

  if (!trialTeacherIds.includes(preferredTeacherId)) {
    throw new Error("The selected teacher must be one of the teachers from your 3 trial sessions");
  }

  request.preferredTeacherId = new mongoose.Types.ObjectId(preferredTeacherId);
  if (preferredTeacherNotes) {
    request.preferredTeacherNotes = preferredTeacherNotes.trim();
  }
  request.status = "trial_completed";
  request.statusHistory.push({
    status: "trial_completed",
    changedAt: new Date(),
    note: `Student selected preferred teacher: ${preferredTeacherId}`,
  });

  await request.save();
  return request;
}

/**
 * Step 6: Admin reviews student preference and finalizes teacher allocation for ongoing 1:1 tuition.
 */
export async function adminFinalizeRegularTeacher(
  adminUserId: string,
  requestId: string,
  selectedTeacherId: string,
  adminNotes?: string
): Promise<ITuitionRequest> {
  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw new Error("Invalid request ID");
  }
  if (!mongoose.Types.ObjectId.isValid(selectedTeacherId)) {
    throw new Error("Invalid teacher ID");
  }

  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }

  // Enforce required 3-trial workflow completion
  if (request.requestType === "trial") {
    const allTrialsCompleted =
      request.trialSessions &&
      request.trialSessions.length === 3 &&
      request.trialSessions.every((s) => s.status === "completed");

    if (!allTrialsCompleted) {
      throw new Error(
        "Cannot finalize regular teacher: the student has not completed all three required trial sessions."
      );
    }
    if (!request.preferredTeacherId) {
      throw new Error(
        "Cannot finalize regular teacher: student has not yet selected a preferred teacher from the trial sessions."
      );
    }
  }

  const teacherProfile = await TuitionProviderProfile.findOne({ userId: selectedTeacherId });
  if (!teacherProfile || teacherProfile.verificationStatus !== "verified") {
    throw new Error("Selected teacher must be a verified tuition provider");
  }

  const teacherObjId = new mongoose.Types.ObjectId(selectedTeacherId);

  // Resolve pricing for ongoing regular classes
  const pricing = await resolveTuitionPricing({
    subject: request.subject,
    classLevel: request.classLevel,
    curriculum: request.curriculum,
    teacherId: selectedTeacherId,
  });

  // Create permanent regular TeacherAssignment
  await TeacherAssignment.findOneAndUpdate(
    {
      requestId: request._id,
      teacherId: teacherObjId,
      assignmentType: "regular",
    },
    {
      requestId: request._id,
      studentId: request.studentId,
      teacherId: teacherObjId,
      assignedByAdminId: new mongoose.Types.ObjectId(adminUserId),
      assignmentType: "regular",
      subject: request.subject,
      classLevel: request.classLevel,
      curriculum: request.curriculum,
      studentHourlyRate: pricing.studentHourlyRate,
      teacherHourlyPayoutRate: pricing.teacherHourlyPayoutRate,
      currency: pricing.currency,
      status: "assigned",
      assignedAt: new Date(),
      statusHistory: [
        {
          status: "assigned",
          changedAt: new Date(),
          changedBy: new mongoose.Types.ObjectId(adminUserId),
          reason: adminNotes || "Admin confirmed permanent teacher assignment for regular 1:1 tuition",
        },
      ],
    },
    { upsert: true, new: true }
  );

  request.selectedTeacherId = teacherObjId;
  request.status = "teacher_assigned";
  if (adminNotes) request.adminNotes = adminNotes;
  request.statusHistory.push({
    status: "teacher_assigned",
    changedAt: new Date(),
    note: `Permanent 1:1 teacher confirmed by admin: ${selectedTeacherId}. Ready for hourly package payment.`,
  });

  await request.save();
  return request;
}

/**
 * Step 7: Settle student hourly payment and activate regular 1:1 TuitionEnrollment.
 */
export async function activateRegular1to1Enrollment(
  studentId: string,
  requestId: string,
  paymentDetails: {
    gatewayTransactionId: string;
    hoursPurchased: number;
    amountPaid: number;
  }
): Promise<{ request: ITuitionRequest; enrollment: ITuitionEnrollment }> {
  const request = await TuitionRequest.findById(requestId);
  if (!request) {
    throw new Error("Tuition request not found");
  }
  if (request.studentId.toString() !== studentId) {
    throw new Error("Unauthorized: Student ID does not match request");
  }
  if (request.status === "enrolled" || request.enrollmentId) {
    throw new Error("This tuition request has already been enrolled and paid.");
  }
  if (!request.selectedTeacherId) {
    throw new Error("Teacher allocation must be finalized by admin before enrollment");
  }

  // Prevent duplicate payment transactions
  const existingTxn = await TuitionTransaction.findOne({
    gatewayTransactionId: paymentDetails.gatewayTransactionId,
  });
  if (existingTxn) {
    throw new Error(
      `Duplicate payment transaction: Transaction ID ${paymentDetails.gatewayTransactionId} has already been processed.`
    );
  }

  // Preserve historical pricing snapshot immutably
  let studentHourlyRate = request.pricingSnapshot?.studentHourlyRate;
  let teacherHourlyPayoutRate = request.pricingSnapshot?.teacherHourlyPayoutRate;
  let currency = request.pricingSnapshot?.currency || "INR";

  if (!studentHourlyRate || !teacherHourlyPayoutRate) {
    const pricing = await resolveTuitionPricing({
      subject: request.subject,
      classLevel: request.classLevel,
      curriculum: request.curriculum,
      teacherId: request.selectedTeacherId.toString(),
    });
    studentHourlyRate = studentHourlyRate || pricing.studentHourlyRate;
    teacherHourlyPayoutRate = teacherHourlyPayoutRate || pricing.teacherHourlyPayoutRate;
    currency = pricing.currency;
  }

  const hoursPurchased = paymentDetails.hoursPurchased || 10;
  const expectedAmount = studentHourlyRate * hoursPurchased;

  // Record payment transaction
  await TuitionTransaction.create({
    studentId: request.studentId,
    providerId: request.selectedTeacherId,
    requestId: request._id,
    grossAmount: paymentDetails.amountPaid || expectedAmount,
    currency,
    gatewayTransactionId: paymentDetails.gatewayTransactionId,
    status: "paid",
    paymentMethod: "online",
  });

  // Create TuitionEnrollment
  const enrollment = await TuitionEnrollment.create({
    studentId: request.studentId,
    providerId: request.selectedTeacherId,
    teacherId: request.selectedTeacherId,
    requestId: request._id,
    subject: request.subject,
    classLevel: request.classLevel || "Standard",
    curriculum: request.curriculum || "CBSE",
    classFormat: "1:1",
    teachingMode: "online",
    scheduleModel: "flexible_slot",
    scheduleDetails: {
      daysOfWeek: request.preferredDays || [],
      startTime: request.preferredTimeSlot?.startTime,
      endTime: request.preferredTimeSlot?.endTime,
    },
    hourlyRate: studentHourlyRate,
    teacherHourlyPayoutRate,
    hoursPurchased,
    hoursRemaining: hoursPurchased,
    hoursCompleted: 0,
    trialCompleted: request.status === "trial_completed" || request.status === "teacher_assigned",
    trialRequestId: request._id,
    status: "active",
    feePaid: paymentDetails.amountPaid || expectedAmount,
    currency,
    paymentTransactionId: paymentDetails.gatewayTransactionId,
    enrolledAt: new Date(),
  });

  request.status = "enrolled";
  request.enrollmentId = enrollment._id as mongoose.Types.ObjectId;
  request.paidAt = new Date();
  request.simulationTransactionId = paymentDetails.gatewayTransactionId;
  request.statusHistory.push({
    status: "enrolled",
    changedAt: new Date(),
    note: `Purchased ${hoursPurchased} hours package. 1:1 Enrollment activated.`,
  });

  await request.save();
  return { request, enrollment };
}
