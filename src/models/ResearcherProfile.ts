import mongoose, { Document, Schema } from "mongoose";

export const ACADEMIC_STATUS_OPTIONS = [
  "Undergraduate Student",
  "Postgraduate Student",
  "PhD Scholar",
  "Research Fellow",
  "Faculty/Professor",
  "Independent Researcher",
  "Industry Researcher",
  "Other",
] as const;

export type AcademicStatus = (typeof ACADEMIC_STATUS_OPTIONS)[number];

export const RESEARCH_DOMAINS = [
  "Computer Science",
  "Engineering",
  "Medicine",
  "Life Sciences",
  "Physics",
  "Chemistry",
  "Mathematics",
  "Social Sciences",
  "Economics",
  "Business",
  "Humanities",
  "Environmental Science",
  "Education",
  "Other",
] as const;

export type ResearchDomain = (typeof RESEARCH_DOMAINS)[number];

export const EXPERIENCE_LEVELS = [
  "Beginner",
  "Intermediate",
  "Experienced",
  "Advanced",
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const PROJECT_STAGES = [
  "Idea exploration",
  "Problem identification",
  "Literature review",
  "Proposal development",
  "Methodology design",
  "Data collection",
  "Experimentation",
  "Analysis",
  "Writing",
  "Publication",
  "Completed",
] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const CITATION_STYLES = [
  "APA",
  "MLA",
  "IEEE",
  "Chicago",
  "Harvard",
  "Vancouver",
  "Other",
] as const;

export type CitationStyle = (typeof CITATION_STYLES)[number];

export interface IAcademicInfo {
  currentStatus?: AcademicStatus | string;
  highestQualification?: string;
  institution?: string;
  department?: string;
  currentCourse?: string;
  yearOfStudy?: string;
  graduationYear?: string;
  researcherId?: string;
}

export interface IResearchExperience {
  level?: ExperienceLevel | string;
  hasWorkedOnProject?: boolean;
  hasPublishedPaper?: boolean;
  hasParticipatedConference?: boolean;
  hasWorkedWithDatasets?: boolean;
  hasWorkedWithDataAnalysisTools?: boolean;
  previousProjects?: string[];
  publications?: string[];
  conferences?: string[];
  researchLabs?: string[];
}

export interface IResearchGoals {
  primaryGoals: string[];
  customGoal?: string;
}

export interface ICurrentResearchProject {
  hasProject: "yes" | "no" | "exploring";
  title?: string;
  domain?: string;
  problemStatement?: string;
  researchObjectives?: string;
  researchQuestions?: string;
  currentStage?: ProjectStage | string;
}

export interface IResearchPreferences {
  citationStyle?: CitationStyle | string;
  outputFormat?: string;
  language?: string;
  notificationPreferences?: {
    emailAlerts?: boolean;
    paperRecommendations?: boolean;
    collaborationInvites?: boolean;
  };
}

export interface IResearcherProfile extends Document {
  userId: mongoose.Types.ObjectId;
  fullName: string;
  profileImage?: string;
  contact?: {
    email: string;
    phone?: string;
  };
  location?: {
    country?: string;
    state?: string;
  };
  academicInfo?: IAcademicInfo;
  researchDomains: string[];
  researchSpecializations: string[];
  researchInterests: string[];
  researchExperience?: IResearchExperience;
  researchGoals?: IResearchGoals;
  currentResearchProject?: ICurrentResearchProject;
  researchTools: string[];
  technicalSkills: string[];
  preferences?: IResearchPreferences;
  onboardingCompleted: boolean;
  onboardingStep: number;
  createdAt: Date;
  updatedAt: Date;
}

const researcherProfileSchema = new Schema<IResearcherProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    profileImage: {
      type: String,
      trim: true,
    },
    contact: {
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },
    location: {
      country: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
    },
    academicInfo: {
      currentStatus: {
        type: String,
        trim: true,
      },
      highestQualification: {
        type: String,
        trim: true,
      },
      institution: {
        type: String,
        trim: true,
        index: true,
      },
      department: {
        type: String,
        trim: true,
      },
      currentCourse: {
        type: String,
        trim: true,
      },
      yearOfStudy: {
        type: String,
        trim: true,
      },
      graduationYear: {
        type: String,
        trim: true,
      },
      researcherId: {
        type: String,
        trim: true,
      },
    },
    researchDomains: {
      type: [String],
      default: [],
      index: true,
    },
    researchSpecializations: {
      type: [String],
      default: [],
    },
    researchInterests: {
      type: [String],
      default: [],
    },
    researchExperience: {
      level: {
        type: String,
        enum: ["Beginner", "Intermediate", "Experienced", "Advanced"],
        default: "Beginner",
      },
      hasWorkedOnProject: {
        type: Boolean,
        default: false,
      },
      hasPublishedPaper: {
        type: Boolean,
        default: false,
      },
      hasParticipatedConference: {
        type: Boolean,
        default: false,
      },
      hasWorkedWithDatasets: {
        type: Boolean,
        default: false,
      },
      hasWorkedWithDataAnalysisTools: {
        type: Boolean,
        default: false,
      },
      previousProjects: {
        type: [String],
        default: [],
      },
      publications: {
        type: [String],
        default: [],
      },
      conferences: {
        type: [String],
        default: [],
      },
      researchLabs: {
        type: [String],
        default: [],
      },
    },
    researchGoals: {
      primaryGoals: {
        type: [String],
        default: [],
      },
      customGoal: {
        type: String,
        trim: true,
      },
    },
    currentResearchProject: {
      hasProject: {
        type: String,
        enum: ["yes", "no", "exploring"],
        default: "exploring",
      },
      title: {
        type: String,
        trim: true,
      },
      domain: {
        type: String,
        trim: true,
      },
      problemStatement: {
        type: String,
        trim: true,
      },
      researchObjectives: {
        type: String,
        trim: true,
      },
      researchQuestions: {
        type: String,
        trim: true,
      },
      currentStage: {
        type: String,
        trim: true,
      },
    },
    researchTools: {
      type: [String],
      default: [],
    },
    technicalSkills: {
      type: [String],
      default: [],
    },
    preferences: {
      citationStyle: {
        type: String,
        default: "APA",
        trim: true,
      },
      outputFormat: {
        type: String,
        default: "PDF",
        trim: true,
      },
      language: {
        type: String,
        default: "English",
        trim: true,
      },
      notificationPreferences: {
        emailAlerts: { type: Boolean, default: true },
        paperRecommendations: { type: Boolean, default: true },
        collaborationInvites: { type: Boolean, default: true },
      },
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    onboardingStep: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

const ResearcherProfile = mongoose.model<IResearcherProfile>(
  "ResearcherProfile",
  researcherProfileSchema
);

export default ResearcherProfile;
