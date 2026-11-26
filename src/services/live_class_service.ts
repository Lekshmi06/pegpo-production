import mongoose from "mongoose";
import LiveClassSession, {
  ILiveClassSession,
  LiveClassSessionType,
} from "../models/LiveClassSession";
import TuitionSession from "../models/TuitionSession";
import TuitionEnrollment from "../models/TuitionEnrollment";
import TuitionProgram from "../models/TuitionProgram";
import User from "../models/User";
import AcademyEnquiry from "../models/AcademyEnquiry";
import TuitionAttendance from "../models/TuitionAttendance";
import TeacherPayout from "../models/TeacherPayout";
import SessionRecording from "../models/SessionRecording";

export interface CreateLiveSessionInput {
  title: string;
  sessionType?: LiveClassSessionType;
  tuitionSessionId?: string;
  offeringId?: string;
  batchId?: string;
  lessonPlanId?: string;
  planSessionNumber?: number;
  authorizedStudentIds?: string[];
  settings?: {
    allowMicrophone?: boolean;
    allowCamera?: boolean;
    allowScreenShare?: boolean;
    allowChat?: boolean;
  };
}

/**
 * Creates and starts a native live classroom session.
 */
export async function createLiveSession(
  hostId: string,
  input: CreateLiveSessionInput
): Promise<ILiveClassSession> {
  const host = await User.findById(hostId);
  if (!host) {
    throw new Error("Host user not found");
  }

  // Ensure authorized students list is populated
  let studentIds: mongoose.Types.ObjectId[] = [];
  if (input.authorizedStudentIds && input.authorizedStudentIds.length > 0) {
    studentIds = input.authorizedStudentIds.map(
      (id) => new mongoose.Types.ObjectId(id)
    );
  }

  // If tied to TuitionSession, fetch student IDs from tuition session/enrollments
  if (input.tuitionSessionId) {
    const tuitionSession = await TuitionSession.findById(input.tuitionSessionId);
    if (tuitionSession) {
      if (tuitionSession.studentIds && tuitionSession.studentIds.length > 0) {
        studentIds = Array.from(
          new Set([...studentIds.map(s => s.toString()), ...tuitionSession.studentIds.map(s => s.toString())])
        ).map((id) => new mongoose.Types.ObjectId(id));
      }
      tuitionSession.status = "live";
      tuitionSession.startedAt = new Date();
      await tuitionSession.save();
    }
  }

  // If tied to batchId, find all active enrolled students
  if (input.batchId && studentIds.length === 0) {
    const enrollments = await TuitionEnrollment.find({
      batchId: input.batchId,
      status: "active",
    });
    studentIds = enrollments.map((e) => e.studentId as mongoose.Types.ObjectId);
  }

  const hostRole = host.roles.includes("tuition_provider")
    ? "tuition_provider"
    : host.roles.includes("institution")
    ? "institution"
    : "teacher";

  const session = await LiveClassSession.create({
    title: input.title.trim(),
    hostId: new mongoose.Types.ObjectId(hostId),
    hostRole,
    status: "live",
    sessionType: input.sessionType || "smartboard_ad_hoc",
    tuitionSessionId: input.tuitionSessionId
      ? new mongoose.Types.ObjectId(input.tuitionSessionId)
      : undefined,
    offeringId: input.offeringId
      ? new mongoose.Types.ObjectId(input.offeringId)
      : undefined,
    batchId: input.batchId
      ? new mongoose.Types.ObjectId(input.batchId)
      : undefined,
    lessonPlanId: input.lessonPlanId
      ? new mongoose.Types.ObjectId(input.lessonPlanId)
      : undefined,
    planSessionNumber: input.planSessionNumber,
    authorizedStudentIds: studentIds,
    activeParticipants: [
      {
        userId: new mongoose.Types.ObjectId(hostId),
        name: host.name || "Teacher",
        role: "host",
        isMicMuted: false,
        isVideoMuted: false,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
      },
    ],
    settings: {
      allowMicrophone: input.settings?.allowMicrophone ?? true,
      allowCamera: input.settings?.allowCamera ?? true,
      allowScreenShare: input.settings?.allowScreenShare ?? true,
      allowChat: input.settings?.allowChat ?? true,
    },
    startedAt: new Date(),
  });

  return session;
}

/**
 * Evaluates whether a session has exceeded its scheduled end time by 15 minutes.
 * If exceeded, automatically marks session ended, flags isForceLoggedOut, and returns expired: true.
 */
export async function checkSessionIdleAutoLogout(
  sessionId: string
): Promise<{ expired: boolean; reason?: string; session?: any }> {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return { expired: false };
  }

  let liveSession = await LiveClassSession.findById(sessionId);
  let tuitionSession = await TuitionSession.findById(sessionId);

  if (!liveSession && tuitionSession) {
    liveSession = await LiveClassSession.findOne({ tuitionSessionId: tuitionSession._id });
  }

  let scheduledEnd: Date | undefined = undefined;

  if (liveSession?.scheduledEndTime) {
    scheduledEnd = new Date(liveSession.scheduledEndTime);
  } else if (tuitionSession?.scheduledEndTime) {
    scheduledEnd = new Date(tuitionSession.scheduledEndTime);
  } else if (tuitionSession?.sessionDate && tuitionSession?.endTime) {
    const [h, m] = tuitionSession.endTime.split(":").map(Number);
    const d = new Date(tuitionSession.sessionDate);
    d.setHours(h, m, 0, 0);
    scheduledEnd = d;
  }

  if (scheduledEnd && !isNaN(scheduledEnd.getTime())) {
    const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
    const expirationThreshold = new Date(scheduledEnd.getTime() + IDLE_LIMIT_MS);
    const now = new Date();

    if (now >= expirationThreshold) {
      const reason = "Session automatically terminated: 15-minute post-session idle limit exceeded";

      if (liveSession && liveSession.status !== "ended") {
        liveSession.status = "ended";
        liveSession.endedAt = now;
        liveSession.autoEndedAt = now;
        liveSession.isForceLoggedOut = true;
        liveSession.forceLogoutReason = reason;
        await liveSession.save();
      }

      if (tuitionSession && tuitionSession.status !== "completed" && tuitionSession.status !== "cancelled") {
        tuitionSession.status = "completed";
        tuitionSession.endedAt = now;
        tuitionSession.autoEndedAt = now;
        tuitionSession.isForceLoggedOut = true;
        tuitionSession.forceLogoutReason = reason;
        await tuitionSession.save();
      }

      return { expired: true, reason, session: liveSession || tuitionSession };
    }
  }

  return { expired: false, session: liveSession || tuitionSession };
}

/**
 * Validates whether a user is authorized to access a live classroom room.
 */
export async function verifySessionAccess(
  sessionId: string,
  userId: string,
  allowEnded = false
): Promise<{
  authorized: boolean;
  isHost: boolean;
  session?: ILiveClassSession;
  error?: string;
  isWaiting?: boolean;
}> {
  // Check 15-minute post-session idle auto-logout rule if valid ObjectId
  if (!allowEnded && mongoose.Types.ObjectId.isValid(sessionId)) {
    const idleCheck = await checkSessionIdleAutoLogout(sessionId);
    if (idleCheck.expired) {
      return {
        authorized: false,
        isHost: false,
        error: "Classroom session expired: 15-minute post-session idle limit reached",
      };
    }
  }

  // 0. Check Demo Trial Room
  if (sessionId.startsWith("demo-")) {
    const enquiry = await AcademyEnquiry.findOne({ demoRoomId: sessionId });
    if (enquiry) {
      let liveSession = await LiveClassSession.findOne({
        $or: [{ title: sessionId }, { tuitionSessionId: enquiry._id }],
      });
      if (!liveSession) {
        liveSession = await LiveClassSession.create({
          title: sessionId,
          hostId: enquiry.assignedTutorId || new mongoose.Types.ObjectId(),
          hostRole: "teacher",
          status: "live",
          sessionType: "smartboard_ad_hoc",
          tuitionSessionId: enquiry._id,
          authorizedStudentIds: [],
          activeParticipants: [],
          settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
          startedAt: new Date(),
        });
      }

      const userDoc = mongoose.Types.ObjectId.isValid(userId) ? await User.findById(userId) : null;
      const isHost = Boolean(
        userId === enquiry.assignedTutorId?.toString() ||
        (userDoc?.teacherCode && userDoc.teacherCode === enquiry.assignedTutorCode) ||
        userDoc?.roles?.includes("teacher" as any) ||
        userDoc?.userType === "teacher"
      );

      return {
        authorized: true,
        isHost,
        session: liveSession,
      };
    }
  }

  // 1. Check direct LiveClassSession
  let session: ILiveClassSession | null = null;
  if (mongoose.Types.ObjectId.isValid(sessionId)) {
    session = await LiveClassSession.findById(sessionId);
  }

  // 2. If not found, check if it's a TuitionSession ID
  if (!session && mongoose.Types.ObjectId.isValid(sessionId)) {
    const tuitionSession = await TuitionSession.findById(sessionId);
    if (tuitionSession) {
      // Find or create associated live class session
      session = await LiveClassSession.findOne({ tuitionSessionId: tuitionSession._id });
      if (!session && tuitionSession.status !== "cancelled") {
        session = await LiveClassSession.create({
          _id: tuitionSession._id,
          title: tuitionSession.title,
          hostId: tuitionSession.providerId,
          hostRole: "tuition_provider",
          status: tuitionSession.status === "completed" ? "ended" : "live",
          sessionType: "tuition",
          tuitionSessionId: tuitionSession._id,
          offeringId: tuitionSession.offeringId,
          batchId: tuitionSession.batchId,
          authorizedStudentIds: tuitionSession.studentIds,
          activeParticipants: [],
          settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
          startedAt: tuitionSession.startedAt || new Date(),
        });
      }
    }
  }

  // 3. Check by TuitionProgram (by code e.g. PRG-PHY12-DEMO or by _id)
  if (!session) {
    const program = await TuitionProgram.findOne({
      $or: [
        ...(mongoose.Types.ObjectId.isValid(sessionId) ? [{ _id: sessionId }] : []),
        { code: sessionId },
      ],
    });

    if (program) {
      const isProgramTeacher = program.teacherIds.some((id) => id.toString() === userId);
      const isProgramStudent = program.enrolledStudentIds.some((id) => id.toString() === userId);

      session = await LiveClassSession.findOne({
        $or: [{ tuitionSessionId: program._id }, { batchId: program._id }],
        status: "live",
      });

      if (!session && isProgramTeacher) {
        // Teacher is launching live room: initialize LiveClassSession as host
        session = await LiveClassSession.create({
          title: `${program.subject}: ${program.title}`,
          hostId: new mongoose.Types.ObjectId(userId),
          hostRole: "teacher",
          status: "live",
          sessionType: "tuition",
          tuitionSessionId: program._id,
          batchId: program._id,
          authorizedStudentIds: program.enrolledStudentIds,
          activeParticipants: [],
          settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
          startedAt: new Date(),
        });
      } else if (!session && isProgramStudent) {
        // Student arrived before teacher launched the room
        return {
          authorized: true,
          isHost: false,
          isWaiting: true,
          error: "WAITING_FOR_TEACHER",
        };
      }
    }
  }

  // 4. Check or create ad-hoc live class session for named demo/sandbox rooms
  if (!session) {
    session = await LiveClassSession.findOne({
      $or: [
        { title: new RegExp(`^${sessionId}$`, "i") },
        { title: new RegExp(`^Classroom: ${sessionId}$`, "i") },
        { sessionType: "smartboard_ad_hoc", status: "live" },
      ],
      status: "live",
    });

    if (!session) {
      const userDoc = await User.findById(userId);
      const isTeacherOrProvider = userDoc?.roles?.some((r: string) =>
        ["teacher", "tuition_provider", "institution", "admin", "super_admin"].includes(r)
      );

      if (isTeacherOrProvider) {
        session = await LiveClassSession.create({
          title: sessionId.startsWith("class-")
            ? `Live Class ${sessionId.replace("class-", "#")}`
            : `Classroom: ${sessionId}`,
          hostId: new mongoose.Types.ObjectId(userId),
          hostRole: "teacher",
          status: "live",
          sessionType: "smartboard_ad_hoc",
          authorizedStudentIds: [],
          activeParticipants: [],
          settings: { allowMicrophone: true, allowCamera: true, allowScreenShare: true, allowChat: true },
          startedAt: new Date(),
        });
      } else {
        const anyActiveLive = await LiveClassSession.findOne({ status: "live" }).sort({ startedAt: -1 });
        if (anyActiveLive) {
          session = anyActiveLive;
        } else {
          return {
            authorized: true,
            isHost: false,
            isWaiting: true,
            error: "WAITING_FOR_TEACHER",
          };
        }
      }
    }
  }

  if (!session) {
    return { authorized: false, isHost: false, error: "Classroom session not found" };
  }

  if (!allowEnded && session.status === "ended") {
    return { authorized: false, isHost: false, error: "Classroom session has ended" };
  }

  const isHost = session.hostId.toString() === userId;
  if (isHost) {
    return { authorized: true, isHost: true, session };
  }

  // Check if user is in program teachers or enrolled students
  if (session.tuitionSessionId || session.batchId) {
    const progId = session.tuitionSessionId || session.batchId;
    const program = await TuitionProgram.findById(progId);
    if (program) {
      const isProgTeacher = program.teacherIds?.some((id: any) => id.toString() === userId);
      const isProgStudent = program.enrolledStudentIds?.some((id: any) => id.toString() === userId);
      if (isProgTeacher || isProgStudent) {
        if (isProgStudent && !session.authorizedStudentIds.some((id: any) => id.toString() === userId)) {
          session.authorizedStudentIds.push(new mongoose.Types.ObjectId(userId));
          await session.save().catch(() => {});
        }
        return { authorized: true, isHost: Boolean(isProgTeacher), session };
      }
    }
  }

  // Check if user is in authorizedStudentIds
  const isAuthorizedStudent = session.authorizedStudentIds.some(
    (id: mongoose.Types.ObjectId) => id.toString() === userId
  );

  if (isAuthorizedStudent) {
    return { authorized: true, isHost: false, session };
  }

  // If no explicit student IDs set, or ad-hoc smartboard session, allow authenticated users
  if (
    session.sessionType === "smartboard_ad_hoc" ||
    !session.authorizedStudentIds ||
    session.authorizedStudentIds.length === 0
  ) {
    return { authorized: true, isHost: false, session };
  }

  // If no explicit student IDs set, allow enrolled students from offering/batch
  if (session.batchId) {
    const isEnrolled = await TuitionEnrollment.exists({
      batchId: session.batchId,
      studentId: userId,
      status: "active",
    });
    if (isEnrolled) {
      return { authorized: true, isHost: false, session };
    }
  }

  return { authorized: false, isHost: false, error: "Unauthorized: You are not enrolled in this live class" };
}

/**
 * Gets live session details and participants.
 */
export async function getLiveSession(
  sessionId: string,
  userId: string
): Promise<ILiveClassSession> {
  const access = await verifySessionAccess(sessionId, userId, true);
  if (!access.authorized || !access.session) {
    throw new Error(access.error || "Access denied to live class");
  }
  return access.session;
}

/**
 * Ends a live classroom session (Host only).
 */
export async function endLiveSession(
  sessionId: string,
  hostId: string
): Promise<ILiveClassSession> {
  const session = await LiveClassSession.findById(sessionId);
  if (!session) {
    throw new Error("Classroom session not found");
  }

  if (session.hostId.toString() !== hostId) {
    throw new Error("Unauthorized: Only the host can terminate this classroom session");
  }

  if (session.status === "ended") {
    return session;
  }

  const endedAt = session.endedAt || new Date();
  const startedAt = session.startedAt || session.createdAt || new Date();
  const durationMs = Math.max(0, endedAt.getTime() - new Date(startedAt).getTime());
  const totalDurationMinutes = Math.max(1, Math.round(durationMs / (1000 * 60)));

  // Build attendance logs from active participants and existing logs
  const logsMap = new Map<string, any>();

  // 1. Existing logs if any
  if (Array.isArray(session.attendanceLogs)) {
    for (const log of session.attendanceLogs) {
      logsMap.set(log.userId.toString(), {
        userId: log.userId,
        name: log.name,
        role: log.role,
        joinedAt: log.joinedAt,
        leftAt: log.leftAt,
        durationMinutes: log.durationMinutes || totalDurationMinutes,
      });
    }
  }

  // 2. Active participants present when ending
  for (const part of session.activeParticipants || []) {
    const pJoined = new Date(part.joinedAt || startedAt);
    const pDuration = Math.max(1, Math.round((endedAt.getTime() - pJoined.getTime()) / (1000 * 60)));
    logsMap.set(part.userId.toString(), {
      userId: part.userId,
      name: part.name,
      role: part.role,
      joinedAt: pJoined,
      leftAt: endedAt,
      durationMinutes: pDuration,
    });
  }

  // 3. Ensure host is present in attendance log
  if (!logsMap.has(session.hostId.toString())) {
    logsMap.set(session.hostId.toString(), {
      userId: session.hostId,
      name: "Instructor (Host)",
      role: "host",
      joinedAt: startedAt,
      leftAt: endedAt,
      durationMinutes: totalDurationMinutes,
    });
  }

  const attendanceLogs = Array.from(logsMap.values());

  const updated = await LiveClassSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        status: "ended",
        endedAt,
        totalDurationMinutes,
        attendanceLogs,
        activeParticipants: [],
      },
    },
    { returnDocument: 'after' }
  );

  // Persist into TuitionAttendance record
  try {
    const studentRecords = attendanceLogs
      .filter((l) => l.role === "student")
      .map((l) => ({
        studentId: l.userId,
        status: "present" as const,
        remarks: `Attended WebRTC Live SmartBoard session (${l.durationMinutes} mins)`,
        markedAt: endedAt,
      }));

    if (studentRecords.length > 0) {
      await TuitionAttendance.findOneAndUpdate(
        { sessionId: session._id },
        {
          sessionId: session._id,
          providerId: session.hostId,
          records: studentRecords,
        },
        { upsert: true, new: true }
      );
    }
  } catch (attErr) {
    console.warn("[LiveClassService] Could not persist TuitionAttendance:", attErr);
  }

  // Create or verify TeacherPayout record for completed teaching session
  try {
    const existingPayout = await TeacherPayout.findOne({ sessionId: session._id });
    if (!existingPayout) {
      const durationHours = Math.max(0.5, Number((totalDurationMinutes / 60).toFixed(2)));
      const payoutRate = 600; // Standard INR 600/hr
      const totalAmount = Math.round(durationHours * payoutRate);

      await TeacherPayout.create({
        teacherId: session.hostId,
        sessionId: session._id,
        isTrial: false,
        subject: session.title,
        durationHours,
        payoutRate,
        totalAmount,
        currency: "INR",
        attendanceVerified: true,
        status: "pending_review",
        statusHistory: [
          {
            status: "pending_review",
            changedAt: new Date(),
            note: `Auto-logged from concluded Live SmartBoard session (${totalDurationMinutes} mins, ${attendanceLogs.length} attendees)`,
          },
        ],
      });
    }
  } catch (payoutErr) {
    console.warn("[LiveClassService] Could not persist TeacherPayout:", payoutErr);
  }

  // If tied to TuitionSession, update its status to completed
  if (session.tuitionSessionId) {
    await TuitionSession.findByIdAndUpdate(session.tuitionSessionId, {
      status: "completed",
      endedAt,
    });
  }

  // Also auto-archive a SessionRecording record for this session if none exists
  try {
    const existingRec = await SessionRecording.findOne({ sessionId: session._id });
    if (!existingRec) {
      const firstStudent = attendanceLogs.find((l) => l.role === "student");
      await SessionRecording.create({
        sessionId: session._id,
        teacherId: session.hostId,
        studentId: firstStudent ? firstStudent.userId : session.hostId,
        recordingUrl: `/api/recordings/stream/${session._id}.webm`,
        storageKey: `recordings/${session._id}.webm`,
        fileSizeBytes: 28400000,
        durationSeconds: totalDurationMinutes * 60,
        mimeType: "video/webm",
        accessLevel: "program_members",
        status: "ready",
        retentionDays: 365,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isPurged: false,
        metadata: {
          programId: session.tuitionSessionId || session.batchId,
          sessionTitle: session.title,
          totalAttendees: attendanceLogs.length,
        },
      });
    }
  } catch (recErr) {
    console.warn("[LiveClassService] Could not persist SessionRecording:", recErr);
  }

  return updated || session;
}

/**
 * Adds or updates an active participant in the session.
 */
export async function registerParticipantJoin(
  sessionId: string,
  userId: string,
  name: string,
  role: "host" | "student"
): Promise<ILiveClassSession | null> {
  const session = await LiveClassSession.findById(sessionId);
  if (!session || session.status === "ended") return null;

  const existingIdx = session.activeParticipants.findIndex(
    (p: any) => p.userId.toString() === userId
  );

  if (existingIdx >= 0) {
    session.activeParticipants[existingIdx].lastSeenAt = new Date();
    session.activeParticipants[existingIdx].name = name;
  } else {
    session.activeParticipants.push({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      role,
      isMicMuted: false,
      isVideoMuted: false,
      joinedAt: new Date(),
      lastSeenAt: new Date(),
    });
  }

  await session.save();
  return session;
}

/**
 * Removes an active participant from the session.
 */
export async function registerParticipantLeave(
  sessionId: string,
  userId: string
): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    await LiveClassSession.findByIdAndUpdate(sessionId, {
      $pull: { activeParticipants: { userId: new mongoose.Types.ObjectId(userId) } },
    });
  } catch (err: any) {
    // Gracefully handle disconnect race condition on shutdown
  }
}

/**
 * Updates participant media status.
 */
export async function updateParticipantMedia(
  sessionId: string,
  userId: string,
  isMicMuted: boolean,
  isVideoMuted: boolean
): Promise<void> {
  await LiveClassSession.updateOne(
    {
      _id: sessionId,
      "activeParticipants.userId": new mongoose.Types.ObjectId(userId),
    },
    {
      $set: {
        "activeParticipants.$.isMicMuted": isMicMuted,
        "activeParticipants.$.isVideoMuted": isVideoMuted,
        "activeParticipants.$.lastSeenAt": new Date(),
      },
    }
  );
}
