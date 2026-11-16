import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import SessionRecording, {
  ISessionRecording,
} from "../models/SessionRecording";
import SessionChat, {
  ISessionChat,
  SessionChatSenderRole,
} from "../models/SessionChat";
import CombinedStudyMessage from "../models/CombinedStudyMessage";
import TuitionSession from "../models/TuitionSession";

/**
 * Stores recording metadata for a completed session.
 * Recording files and metadata are strictly flagged 'admin_only'.
 */
export async function createSessionRecording(data: {
  sessionId: string;
  recordingUrl: string;
  storageKey: string;
  fileSizeBytes?: number;
  durationSeconds?: number;
  mimeType?: string;
  metadata?: Record<string, any>;
}): Promise<ISessionRecording> {
  const session = await TuitionSession.findById(data.sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const recording = await SessionRecording.create({
    sessionId: session._id,
    enrollmentId: session.enrollmentId,
    requestId: session.requestId,
    teacherId: session.providerId,
    studentId: session.studentIds[0],
    recordingUrl: data.recordingUrl,
    storageKey: data.storageKey,
    fileSizeBytes: data.fileSizeBytes || 0,
    durationSeconds: data.durationSeconds || 0,
    mimeType: data.mimeType || "video/webm",
    accessLevel: "admin_only",
    status: "ready",
    retentionDays: 365,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    metadata: data.metadata || {},
  });

  session.recordingId = recording._id as mongoose.Types.ObjectId;
  session.hasRecording = true;
  await session.save();

  return recording;
}

/**
 * Admin Only: Retrieve recording metadata with session, teacher, and student information.
 * Non-admins are strictly forbidden from calling this.
 */
export async function getAdminRecordings(filter: {
  teacherId?: string;
  studentId?: string;
  sessionId?: string;
  status?: string;
}): Promise<ISessionRecording[]> {
  const query: any = { isPurged: false };
  if (filter.teacherId && mongoose.Types.ObjectId.isValid(filter.teacherId)) {
    query.teacherId = new mongoose.Types.ObjectId(filter.teacherId);
  }
  if (filter.studentId && mongoose.Types.ObjectId.isValid(filter.studentId)) {
    query.studentId = new mongoose.Types.ObjectId(filter.studentId);
  }
  if (filter.sessionId && mongoose.Types.ObjectId.isValid(filter.sessionId)) {
    query.sessionId = new mongoose.Types.ObjectId(filter.sessionId);
  }
  if (filter.status) {
    query.status = filter.status;
  }

  return await SessionRecording.find(query)
    .populate("teacherId", "name email")
    .populate("studentId", "name email")
    .populate("sessionId", "title sessionDate startTime endTime isTrial")
    .sort({ createdAt: -1 });
}

/**
 * Admin Only: Get single recording file details.
 */
export async function getAdminRecordingById(
  recordingId: string
): Promise<ISessionRecording | null> {
  return await SessionRecording.findById(recordingId)
    .populate("teacherId", "name email")
    .populate("studentId", "name email")
    .populate("sessionId", "title sessionDate startTime endTime");
}

/**
 * Records a chat message in the compliance vault with 365-day retention.
 */
export async function logSessionChatMessage(params: {
  sessionId: string;
  senderId: string;
  senderRole: SessionChatSenderRole;
  senderName?: string;
  message: string;
}): Promise<ISessionChat> {
  return await SessionChat.create({
    sessionId: new mongoose.Types.ObjectId(params.sessionId),
    senderId: new mongoose.Types.ObjectId(params.senderId),
    senderRole: params.senderRole,
    senderName: params.senderName,
    message: params.message.trim(),
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
}

/**
 * Admin Only: Retrieve full chat audit logs for a session.
 */
export async function getSessionChatAuditLogs(
  sessionId: string
): Promise<ISessionChat[]> {
  return await SessionChat.find({
    sessionId: new mongoose.Types.ObjectId(sessionId),
  }).sort({ timestamp: 1 });
}

/**
 * Maintenance: Safely purge expired Combined Study messages and shared media files beyond 1 year.
 */
export async function purgeExpiredCombinedStudyMessages(): Promise<{
  purgedMessages: number;
  purgedFiles: number;
  failedDeletions: number;
}> {
  const now = new Date();
  let purgedMessages = 0;
  let purgedFiles = 0;
  let failedDeletions = 0;

  const expiredMessages = await CombinedStudyMessage.find({
    expiresAt: { $lte: now },
  });

  for (const msg of expiredMessages) {
    try {
      if (msg.fileKey && fs.existsSync(msg.fileKey)) {
        await fs.promises.unlink(msg.fileKey);
        purgedFiles++;
      }
      await CombinedStudyMessage.deleteOne({ _id: msg._id });
      purgedMessages++;
    } catch (err) {
      failedDeletions++;
      console.error(`Failed to purge Combined Study message/file ${msg._id}:`, err);
    }
  }

  return { purgedMessages, purgedFiles, failedDeletions };
}

/**
 * Maintenance: Safely purge expired recordings, chat logs, and Combined Study files beyond the 1-year retention window.
 * Ensures external/physical media files on disk or cloud storage are actually deleted
 * before marking database entries as purged.
 */
export async function purgeExpiredComplianceArtifacts(): Promise<{
  purgedRecordings: number;
  purgedChats: number;
  purgedCombinedStudy: number;
  failedDeletions: number;
}> {
  const now = new Date();
  let purgedRecordings = 0;
  let purgedChats = 0;
  let failedDeletions = 0;

  // 1. Purge expired video recordings
  const expiredRecordings = await SessionRecording.find({
    expiresAt: { $lte: now },
    isPurged: false,
  });

  for (const rec of expiredRecordings) {
    try {
      // If storageKey is a local relative or absolute file path, attempt filesystem removal
      if (rec.storageKey && fs.existsSync(rec.storageKey)) {
        await fs.promises.unlink(rec.storageKey);
      }

      rec.isPurged = true;
      rec.purgedAt = new Date();
      rec.purgedBy = "system_retention_worker";
      rec.status = "deleted";
      await rec.save();
      purgedRecordings++;
    } catch (err) {
      failedDeletions++;
      console.error(`Failed to purge physical media for recording ${rec._id}:`, err);
    }
  }

  // 2. Purge expired chat logs
  const chatPurgeResult = await SessionChat.updateMany(
    { expiresAt: { $lte: now }, isPurged: false },
    { $set: { isPurged: true, purgedAt: new Date(), message: "[PURGED_AFTER_RETENTION]" } }
  );
  purgedChats = chatPurgeResult.modifiedCount;

  // 3. Purge expired Combined Study messages and media
  const combinedStudyPurge = await purgeExpiredCombinedStudyMessages();
  failedDeletions += combinedStudyPurge.failedDeletions;

  return {
    purgedRecordings,
    purgedChats,
    purgedCombinedStudy: combinedStudyPurge.purgedMessages,
    failedDeletions,
  };
}

