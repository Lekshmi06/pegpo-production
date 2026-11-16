import mongoose from "mongoose";
import LiveClassSession, {
  ILiveClassSession,
  LiveClassSessionType,
} from "../models/LiveClassSession";
import TuitionSession from "../models/TuitionSession";
import TuitionEnrollment from "../models/TuitionEnrollment";
import User from "../models/User";

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
}> {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return { authorized: false, isHost: false, error: "Invalid session ID format" };
  }

  // Check 15-minute post-session idle auto-logout rule
  if (!allowEnded) {
    const idleCheck = await checkSessionIdleAutoLogout(sessionId);
    if (idleCheck.expired) {
      return {
        authorized: false,
        isHost: false,
        error: "Classroom session expired: 15-minute post-session idle limit reached",
      };
    }
  }

  // Check direct LiveClassSession
  let session = await LiveClassSession.findById(sessionId);

  // If not found, check if it's a TuitionSession ID
  if (!session) {
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

  // Check if user is in authorizedStudentIds
  const isAuthorizedStudent = session.authorizedStudentIds.some(
    (id: mongoose.Types.ObjectId) => id.toString() === userId
  );

  if (isAuthorizedStudent) {
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

  const updated = await LiveClassSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        status: "ended",
        endedAt: session.endedAt || new Date(),
        activeParticipants: [],
      },
    },
    { returnDocument: 'after' }
  );

  // If tied to TuitionSession, update its status to completed
  if (session.tuitionSessionId) {
    await TuitionSession.findByIdAndUpdate(session.tuitionSessionId, {
      status: "completed",
      endedAt: new Date(),
    });
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
  await LiveClassSession.findByIdAndUpdate(sessionId, {
    $pull: { activeParticipants: { userId: new mongoose.Types.ObjectId(userId) } },
  });
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
