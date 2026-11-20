import mongoose from "mongoose";
import TeacherPayout, {
  ITeacherPayout,
  TeacherPayoutStatus,
} from "../models/TeacherPayout";
import TuitionSession from "../models/TuitionSession";
import LiveClassSession from "../models/LiveClassSession";
import TuitionAttendance from "../models/TuitionAttendance";
import TuitionProviderProfile from "../models/TuitionProviderProfile";
import { resolveTuitionPricing } from "./tuition_pricing_service";

/**
 * Creates or retrieves the TeacherPayout ledger entry for a completed session.
 */
export async function createTeacherPayoutForSession(
  sessionId: string
): Promise<ITeacherPayout> {
  const session = await TuitionSession.findById(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  // 1. Session must be completed to generate payouts
  if (session.status !== "completed") {
    throw new Error(
      `Cannot generate payout: session is in '${session.status}' status, must be 'completed'`
    );
  }

  // 2. Check if payout record already exists (duplicate protection)
  const existingPayout = await TeacherPayout.findOne({ sessionId: session._id });
  if (existingPayout) {
    return existingPayout;
  }

  // 3. Verify attendance (payouts are generated only with verified attendance)
  const attendance = await TuitionAttendance.findOne({ sessionId: session._id });
  const attendanceVerified = Boolean(
    attendance &&
      attendance.records.some(
        (r) => r.status === "present" || r.status === "late"
      )
  );

  if (!attendanceVerified) {
    throw new Error(
      "Cannot generate teacher payout: session attendance has not been verified"
    );
  }

  const durationHours = session.durationMinutes
    ? session.durationMinutes / 60
    : session.isTrial
    ? 0.5
    : 1.0;

  // Resolve payout rate
  let payoutRate = session.teacherPayoutRate;
  if (!payoutRate) {
    const pricing = await resolveTuitionPricing({
      subject: session.subject || "all",
      curriculum: session.curriculum,
      teacherId: session.providerId.toString(),
    });
    payoutRate = pricing.teacherHourlyPayoutRate;
  }

  const isTrial = Boolean(session.isTrial);
  // Internal trial compensation policy: withhold trial payouts until policy is confirmed
  const trialPayoutPolicyConfirmed = process.env.ENABLE_TRIAL_PAYOUTS === "true";
  const initialStatus = isTrial && !trialPayoutPolicyConfirmed ? "withheld" : "pending_review";
  const totalAmount = isTrial && !trialPayoutPolicyConfirmed ? 0 : Math.round(durationHours * payoutRate);
  const statusNote = isTrial && !trialPayoutPolicyConfirmed
    ? "Trial session conducted. Trial payout withheld pending confirmation of internal trial compensation policy."
    : `Payout generated upon session completion. Attendance verified: ${attendanceVerified}`;

  const payout = await TeacherPayout.create({
    teacherId: session.providerId,
    sessionId: session._id,
    enrollmentId: session.enrollmentId,
    requestId: session.requestId,
    isTrial,
    trialIndex: session.trialIndex,
    subject: session.subject || "Tuition Session",
    durationHours,
    payoutRate,
    totalAmount,
    currency: "INR",
    attendanceVerified,
    status: initialStatus,
    statusHistory: [
      {
        status: initialStatus,
        changedAt: new Date(),
        note: statusNote,
      },
    ],
  });

  return payout;
}

/**
 * Admin: List teacher payouts with filtering and pagination.
 */
export async function listTeacherPayouts(filter: {
  teacherId?: string;
  status?: TeacherPayoutStatus;
  isTrial?: boolean;
}): Promise<ITeacherPayout[]> {
  const query: any = {};
  if (filter.teacherId && mongoose.Types.ObjectId.isValid(filter.teacherId)) {
    query.teacherId = new mongoose.Types.ObjectId(filter.teacherId);
  }
  if (filter.status) {
    query.status = filter.status;
  }
  if (filter.isTrial !== undefined) {
    query.isTrial = filter.isTrial;
  }

  return await TeacherPayout.find(query)
    .populate("teacherId", "name email")
    .populate("sessionId", "title sessionDate startTime endTime")
    .sort({ createdAt: -1 });
}

/**
 * Admin: Approve a pending teacher payout.
 */
export async function adminApprovePayout(
  adminUserId: string,
  payoutId: string,
  adminNotes?: string
): Promise<ITeacherPayout> {
  const payout = await TeacherPayout.findById(payoutId);
  if (!payout) {
    throw new Error("Payout record not found");
  }

  // Prevent approval of trial payouts if trial policy is unconfirmed
  if (payout.isTrial && process.env.ENABLE_TRIAL_PAYOUTS !== "true") {
    throw new Error(
      "Trial payouts cannot be approved: internal trial compensation policy has not been confirmed."
    );
  }

  if (payout.status !== "pending_review") {
    throw new Error(`Cannot approve payout in status: ${payout.status}`);
  }

  payout.status = "approved";
  payout.reviewedByAdminId = new mongoose.Types.ObjectId(adminUserId);
  payout.reviewedAt = new Date();
  if (adminNotes) payout.adminNotes = adminNotes;
  payout.statusHistory.push({
    status: "approved",
    changedAt: new Date(),
    changedBy: new mongoose.Types.ObjectId(adminUserId),
    note: adminNotes || "Admin approved payout for disbursement",
  });

  await payout.save();
  return payout;
}

/**
 * Admin: Mark an approved payout as disbursed.
 */
export async function adminDisbursePayout(
  adminUserId: string,
  payoutId: string,
  paymentReference: string,
  adminNotes?: string
): Promise<ITeacherPayout> {
  const payout = await TeacherPayout.findById(payoutId);
  if (!payout) {
    throw new Error("Payout record not found");
  }

  // Prevent disbursement of trial payouts if trial policy is unconfirmed
  if (payout.isTrial && process.env.ENABLE_TRIAL_PAYOUTS !== "true") {
    throw new Error(
      "Trial payouts cannot be disbursed: internal trial compensation policy has not been confirmed."
    );
  }

  if (payout.status !== "approved") {
    throw new Error(`Cannot disburse payout in status: ${payout.status}. It must be approved first.`);
  }

  payout.status = "disbursed";
  payout.disbursedAt = new Date();
  payout.paymentReference = paymentReference;
  if (adminNotes) payout.adminNotes = adminNotes;
  payout.statusHistory.push({
    status: "disbursed",
    changedAt: new Date(),
    changedBy: new mongoose.Types.ObjectId(adminUserId),
    note: `Disbursed with reference: ${paymentReference}`,
  });

  await payout.save();

  // Update teacher financials on their profile
  await TuitionProviderProfile.findOneAndUpdate(
    { userId: payout.teacherId },
    {
      $inc: {
        "financials.totalEarnings": payout.totalAmount,
        "financials.pendingPayout": -payout.totalAmount,
      },
    }
  );

  return payout;
}

/**
 * Teacher: View own earnings ledger.
 */
export async function getTeacherEarningsLedger(teacherId: string) {
  let payouts = await TeacherPayout.find({ teacherId: new mongoose.Types.ObjectId(teacherId) })
    .populate("sessionId", "title sessionDate startTime endTime isTrial")
    .sort({ createdAt: -1 });

  // If no payouts recorded yet, check for concluded LiveClassSessions
  if (payouts.length === 0) {
    const endedSessions = await LiveClassSession.find({
      hostId: new mongoose.Types.ObjectId(teacherId),
      status: "ended",
    });

    for (const session of endedSessions) {
      const durationHours = Math.max(0.5, Number(((session.totalDurationMinutes || 60) / 60).toFixed(2)));
      const payoutRate = 600;
      const totalAmount = Math.round(durationHours * payoutRate);
      try {
        await TeacherPayout.create({
          teacherId: new mongoose.Types.ObjectId(teacherId),
          sessionId: session._id,
          isTrial: false,
          subject: session.title,
          durationHours,
          payoutRate,
          totalAmount,
          currency: "INR",
          attendanceVerified: true,
          status: "approved",
          statusHistory: [
            {
              status: "approved",
              changedAt: new Date(),
              note: "Auto-synced from concluded live classroom session",
            },
          ],
        });
      } catch (e) {}
    }

    payouts = await TeacherPayout.find({ teacherId: new mongoose.Types.ObjectId(teacherId) })
      .populate("sessionId", "title sessionDate startTime endTime isTrial")
      .sort({ createdAt: -1 });
  }

  const totalEarned = payouts
    .filter((p) => p.status === "disbursed")
    .reduce((sum, p) => sum + p.totalAmount, 0);

  const pendingAmount = payouts
    .filter((p) => p.status === "pending_review" || p.status === "approved")
    .reduce((sum, p) => sum + p.totalAmount, 0);

  return {
    totalEarned,
    pendingAmount,
    payouts,
  };
}

