import mongoose, { Document, Schema } from "mongoose";

export type LiveClassStatus = "scheduled" | "live" | "ended";
export type LiveClassSessionType = "smartboard_ad_hoc" | "tuition" | "class_section";

export interface ILiveParticipant {
  userId: mongoose.Types.ObjectId;
  name: string;
  role: "host" | "student";
  isMicMuted: boolean;
  isVideoMuted: boolean;
  joinedAt: Date;
  lastSeenAt: Date;
}

export interface IAttendanceLog {
  userId: mongoose.Types.ObjectId;
  name: string;
  role: "host" | "student";
  joinedAt: Date;
  leftAt: Date;
  durationMinutes: number;
}

export interface ILiveChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: "host" | "student" | "teacher" | string;
  text: string;
  messageType?: "text" | "voice" | "attachment" | string;
  voiceUrl?: string;
  voiceDuration?: number;
  attachment?: {
    name?: string;
    url?: string;
    fileType?: string;
    size?: number;
  };
  timestamp: Date;
}

export interface ILiveClassSession extends Document {
  title: string;
  hostId: mongoose.Types.ObjectId;
  hostRole: "teacher" | "tuition_provider" | "institution";
  status: LiveClassStatus;
  sessionType: LiveClassSessionType;
  tuitionSessionId?: mongoose.Types.ObjectId;
  offeringId?: mongoose.Types.ObjectId;
  batchId?: mongoose.Types.ObjectId;
  lessonPlanId?: mongoose.Types.ObjectId;
  planSessionNumber?: number;
  authorizedStudentIds: mongoose.Types.ObjectId[];
  activeParticipants: ILiveParticipant[];
  attendanceLogs?: IAttendanceLog[];
  chatMessages?: ILiveChatMessage[];
  totalDurationMinutes?: number;
  settings: {
    allowMicrophone: boolean;
    allowCamera: boolean;
    allowScreenShare: boolean;
    allowChat: boolean;
  };
  startedAt?: Date;
  endedAt?: Date;
  scheduledEndTime?: Date;
  autoEndedAt?: Date;
  isForceLoggedOut?: boolean;
  forceLogoutReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const liveClassSessionSchema = new Schema<ILiveClassSession>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    hostId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    hostRole: {
      type: String,
      enum: ["teacher", "tuition_provider", "institution"],
      default: "teacher",
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "ended"],
      default: "live",
      index: true,
    },
    sessionType: {
      type: String,
      enum: ["smartboard_ad_hoc", "tuition", "class_section"],
      default: "smartboard_ad_hoc",
    },
    tuitionSessionId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionSession",
      index: true,
    },
    offeringId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionOffering",
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: "TuitionBatch",
    },
    lessonPlanId: {
      type: Schema.Types.ObjectId,
      ref: "LessonPlan",
    },
    planSessionNumber: {
      type: Number,
    },
    authorizedStudentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    activeParticipants: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ["host", "student"],
          default: "student",
        },
        isMicMuted: {
          type: Boolean,
          default: false,
        },
        isVideoMuted: {
          type: Boolean,
          default: false,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        lastSeenAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    attendanceLogs: [
      {
        userId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        role: {
          type: String,
          enum: ["host", "student"],
          default: "student",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        leftAt: {
          type: Date,
          default: Date.now,
        },
        durationMinutes: {
          type: Number,
          default: 0,
        },
      },
    ],
    chatMessages: [
      {
        id: { type: String, required: true },
        senderId: { type: String, required: true },
        senderName: { type: String, required: true },
        senderRole: { type: String, default: "student" },
        text: { type: String, default: "", trim: true },
        messageType: { type: String, default: "text" },
        voiceUrl: { type: String },
        voiceDuration: { type: Number },
        attachment: {
          name: { type: String },
          url: { type: String },
          fileType: { type: String },
          size: { type: Number },
        },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    totalDurationMinutes: {
      type: Number,
      default: 0,
    },
    settings: {
      allowMicrophone: {
        type: Boolean,
        default: true,
      },
      allowCamera: {
        type: Boolean,
        default: true,
      },
      allowScreenShare: {
        type: Boolean,
        default: true,
      },
      allowChat: {
        type: Boolean,
        default: true,
      },
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
    },
    scheduledEndTime: {
      type: Date,
      index: true,
    },
    autoEndedAt: {
      type: Date,
    },
    isForceLoggedOut: {
      type: Boolean,
      default: false,
    },
    forceLogoutReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

liveClassSessionSchema.index({ hostId: 1, status: 1 });
liveClassSessionSchema.index({ authorizedStudentIds: 1, status: 1 });

const LiveClassSession =
  mongoose.models.LiveClassSession ||
  mongoose.model<ILiveClassSession>("LiveClassSession", liveClassSessionSchema);

export default LiveClassSession;

