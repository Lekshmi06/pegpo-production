import mongoose from "mongoose";
import ResearcherProfile, {
  IResearcherProfile,
} from "../models/ResearcherProfile";
import User from "../models/User";

export interface CreateResearcherProfileInput {
  userId?: string;
  email?: string;
  fullName?: string;
  profileImage?: string;
  contact?: {
    email?: string;
    phone?: string;
  };
  location?: {
    country?: string;
    state?: string;
  };
  academicInfo?: any;
  researchDomains?: string[];
  researchSpecializations?: string[];
  researchInterests?: string[];
  researchExperience?: any;
  researchGoals?: any;
  currentResearchProject?: any;
  researchTools?: string[];
  technicalSkills?: string[];
  preferences?: any;
  onboardingStep?: number;
  onboardingCompleted?: boolean;
}

export const createResearcherProfile = async (
  data: CreateResearcherProfileInput
): Promise<IResearcherProfile> => {
  let userId = data.userId;
  const cleanEmail = (data.contact?.email || data.email || "").toLowerCase().trim();

  let user = null;
  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    user = await User.findById(userId);
  }

  if (!user && cleanEmail) {
    user = await User.findOne({ email: cleanEmail });
    if (!user) {
      const resolvedName =
        data.fullName?.trim() ||
        cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      user = await User.create({
        email: cleanEmail,
        name: resolvedName,
        userType: "researcher",
        language: data.preferences?.language || "English",
      });
    }
  }

  if (user) {
    userId = (user._id as any).toString();
    if (user.userType !== "researcher") {
      user.userType = "researcher";
      await user.save();
    }
  }

  if (!userId) {
    throw new Error("userId or valid user email is required to create researcher profile");
  }

  const existing = await ResearcherProfile.findOne({ userId });
  if (existing) {
    return existing;
  }

  const fullName =
    data.fullName?.trim() ||
    user?.name ||
    user?.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Researcher";

  const profile = await ResearcherProfile.create({
    userId: new mongoose.Types.ObjectId(userId),
    fullName,
    profileImage: data.profileImage || "",
    contact: {
      email: data.contact?.email || user?.email || cleanEmail || "",
      phone: data.contact?.phone || "",
    },
    location: {
      country: data.location?.country || "India",
      state: data.location?.state || "",
    },
    academicInfo: data.academicInfo || {},
    researchDomains: data.researchDomains || [],
    researchSpecializations: data.researchSpecializations || [],
    researchInterests: data.researchInterests || [],
    researchExperience: data.researchExperience || {
      level: "Beginner",
      hasWorkedOnProject: false,
      hasPublishedPaper: false,
      hasParticipatedConference: false,
      hasWorkedWithDatasets: false,
      hasWorkedWithDataAnalysisTools: false,
      previousProjects: [],
      publications: [],
      conferences: [],
      researchLabs: [],
    },
    researchGoals: data.researchGoals || { primaryGoals: [], customGoal: "" },
    currentResearchProject: data.currentResearchProject || {
      hasProject: "exploring",
    },
    researchTools: data.researchTools || [],
    technicalSkills: data.technicalSkills || [],
    preferences: data.preferences || {
      citationStyle: "APA",
      outputFormat: "PDF",
      language: user?.language || "English",
      notificationPreferences: {
        emailAlerts: true,
        paperRecommendations: true,
        collaborationInvites: true,
      },
    },
    onboardingStep: data.onboardingStep ?? 1,
    onboardingCompleted: data.onboardingCompleted ?? false,
  });

  return profile;
};

export const getResearcherById = async (
  id: string
): Promise<IResearcherProfile> => {
  const profile = await ResearcherProfile.findById(id).populate("userId", "email name userType language");
  if (!profile) {
    throw new Error("Researcher profile not found");
  }
  return profile;
};

export const getResearcherByUserId = async (
  userId: string
): Promise<IResearcherProfile | null> => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return null;
  }
  return ResearcherProfile.findOne({ userId }).populate("userId", "email name userType language");
};

export const getResearcherByEmail = async (
  email: string
): Promise<IResearcherProfile> => {
  const cleanEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: cleanEmail });
  if (!user) {
    const resolvedName = cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    user = await User.create({
      email: cleanEmail,
      name: resolvedName,
      userType: "researcher",
      language: "English",
    });
  } else if (user.userType !== "researcher") {
    user.userType = "researcher";
    await user.save();
  }

  let profile = await ResearcherProfile.findOne({ userId: user._id });
  if (!profile) {
    profile = await ResearcherProfile.findOne({ "contact.email": cleanEmail });
  }
  if (!profile) {
    profile = await ResearcherProfile.create({
      userId: user._id,
      fullName: user.name || cleanEmail.split("@")[0],
      contact: { email: user.email },
      onboardingCompleted: false,
      onboardingStep: 1,
    });
  }

  return profile;
};

export const updateResearcherProfile = async (
  id: string,
  data: Partial<CreateResearcherProfileInput>
): Promise<IResearcherProfile> => {
  const profile = await ResearcherProfile.findById(id);
  if (!profile) {
    throw new Error("Researcher profile not found");
  }

  if (data.fullName) profile.fullName = data.fullName.trim();
  if (data.profileImage !== undefined) profile.profileImage = data.profileImage;
  if (data.contact) {
    profile.contact = {
      email: data.contact.email || profile.contact?.email || "",
      phone: data.contact.phone !== undefined ? data.contact.phone : profile.contact?.phone,
    };
  }
  if (data.location) {
    profile.location = {
      country: data.location.country !== undefined ? data.location.country : profile.location?.country,
      state: data.location.state !== undefined ? data.location.state : profile.location?.state,
    };
  }
  if (data.academicInfo) {
    profile.academicInfo = {
      ...profile.academicInfo,
      ...data.academicInfo,
    };
  }
  if (data.researchDomains) profile.researchDomains = data.researchDomains;
  if (data.researchSpecializations) profile.researchSpecializations = data.researchSpecializations;
  if (data.researchInterests) profile.researchInterests = data.researchInterests;
  if (data.researchExperience) {
    profile.researchExperience = {
      ...profile.researchExperience,
      ...data.researchExperience,
    };
  }
  if (data.researchGoals) {
    profile.researchGoals = {
      ...profile.researchGoals,
      ...data.researchGoals,
    };
  }
  if (data.currentResearchProject) {
    profile.currentResearchProject = {
      ...profile.currentResearchProject,
      ...data.currentResearchProject,
    };
  }
  if (data.researchTools) profile.researchTools = data.researchTools;
  if (data.technicalSkills) profile.technicalSkills = data.technicalSkills;
  if (data.preferences) {
    profile.preferences = {
      ...profile.preferences,
      ...data.preferences,
    };
  }
  if (data.onboardingStep !== undefined) profile.onboardingStep = data.onboardingStep;
  if (data.onboardingCompleted !== undefined) profile.onboardingCompleted = data.onboardingCompleted;

  await profile.save();
  return profile;
};

export interface ResearcherStepIdentifier {
  profileId?: string;
  userId?: string;
  email?: string;
}

export const updateResearcherStep = async (
  identifier: ResearcherStepIdentifier,
  stepNumber: number,
  stepData: any = {}
): Promise<IResearcherProfile> => {
  let profile: IResearcherProfile | null = null;
  let user: any = null;

  const candidateEmail = (
    identifier.email ||
    stepData.contact?.email ||
    stepData.email ||
    ""
  ).toLowerCase().trim();

  // 1. Resolve by profileId if provided
  if (identifier.profileId && mongoose.Types.ObjectId.isValid(identifier.profileId)) {
    profile = await ResearcherProfile.findById(identifier.profileId);
  }

  // 2. Resolve by userId if provided
  if (!profile && identifier.userId && mongoose.Types.ObjectId.isValid(identifier.userId)) {
    profile = await ResearcherProfile.findOne({ userId: identifier.userId });
    if (!profile) {
      user = await User.findById(identifier.userId);
    }
  }

  // 3. Resolve by candidate email
  if (!profile && candidateEmail) {
    profile = await ResearcherProfile.findOne({ "contact.email": candidateEmail });
    if (!profile) {
      user = await User.findOne({ email: candidateEmail });
      if (user) {
        profile = await ResearcherProfile.findOne({ userId: user._id });
      }
    }
  }

  // 4. If profile was found but user is not resolved yet, fetch linked User
  if (profile && !user) {
    user = await User.findById(profile.userId);
  }

  // 5. If profile still not found, create User and ResearcherProfile
  if (!profile) {
    if (!user && candidateEmail) {
      user = await User.findOne({ email: candidateEmail });
      if (!user) {
        const resolvedName =
          stepData.fullName?.trim() ||
          candidateEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        user = await User.create({
          email: candidateEmail,
          name: resolvedName,
          userType: "researcher",
          language: stepData.preferredLanguage || stepData.preferences?.language || "English",
        });
      }
    }

    if (user) {
      if (user.userType !== "researcher") {
        user.userType = "researcher";
        await user.save();
      }

      const resolvedName =
        stepData.fullName?.trim() ||
        user.name ||
        user.email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

      profile = await ResearcherProfile.create({
        userId: user._id,
        fullName: resolvedName,
        contact: {
          email: user.email,
          phone: stepData.phone || stepData.contact?.phone || "",
        },
        location: {
          country: stepData.country || stepData.location?.country || "India",
          state: stepData.state || stepData.location?.state || "",
        },
        onboardingStep: stepNumber,
        onboardingCompleted: false,
      });
    }
  }

  if (!profile) {
    throw new Error(
      "Researcher profile or user identifier (profileId, userId, or email) is required to save step progress"
    );
  }

  // Ensure linked User role is updated to researcher
  if (user && user.userType !== "researcher") {
    user.userType = "researcher";
    await user.save();
  }

  // Update step progress
  profile.onboardingStep = Math.max(profile.onboardingStep || 1, stepNumber);

  // Full Name & Profile Image
  if (stepData.fullName) profile.fullName = stepData.fullName.trim();
  if (stepData.profileImage !== undefined) profile.profileImage = stepData.profileImage;

  // Contact (flat or nested)
  const contactEmail = stepData.contact?.email || stepData.email || profile.contact?.email;
  const contactPhone =
    stepData.contact?.phone !== undefined
      ? stepData.contact.phone
      : stepData.phone !== undefined
      ? stepData.phone
      : profile.contact?.phone;

  if (contactEmail || contactPhone !== undefined) {
    profile.contact = {
      email: (contactEmail || "").trim().toLowerCase(),
      phone: contactPhone || "",
    };
  }

  // Location (flat or nested)
  const locCountry =
    stepData.location?.country !== undefined
      ? stepData.location.country
      : stepData.country !== undefined
      ? stepData.country
      : profile.location?.country;

  const locState =
    stepData.location?.state !== undefined
      ? stepData.location.state
      : stepData.state !== undefined
      ? stepData.state
      : profile.location?.state;

  if (locCountry !== undefined || locState !== undefined) {
    profile.location = {
      country: locCountry || "",
      state: locState || "",
    };
  }

  // Academic Info (Step 2 - flat or nested)
  const academicUpdates: Record<string, any> = {};
  if (stepData.academicInfo && typeof stepData.academicInfo === "object") {
    Object.assign(academicUpdates, stepData.academicInfo);
  }
  if (stepData.currentStatus !== undefined) academicUpdates.currentStatus = stepData.currentStatus;
  if (stepData.highestQualification !== undefined) academicUpdates.highestQualification = stepData.highestQualification;
  if (stepData.institution !== undefined) academicUpdates.institution = stepData.institution;
  if (stepData.department !== undefined) academicUpdates.department = stepData.department;
  if (stepData.currentCourse !== undefined) academicUpdates.currentCourse = stepData.currentCourse;
  if (stepData.yearOfStudy !== undefined) academicUpdates.yearOfStudy = stepData.yearOfStudy;
  if (stepData.graduationYear !== undefined) academicUpdates.graduationYear = stepData.graduationYear;
  if (stepData.researcherId !== undefined) academicUpdates.researcherId = stepData.researcherId;

  if (Object.keys(academicUpdates).length > 0) {
    if (!profile.academicInfo) profile.academicInfo = {};
    for (const [key, val] of Object.entries(academicUpdates)) {
      if (val !== undefined) {
        (profile.academicInfo as any)[key] = val;
      }
    }
  }

  // Research Domains, Specializations, Interests (Step 3 - flat or nested)
  if (Array.isArray(stepData.researchDomains)) {
    profile.researchDomains = stepData.researchDomains;
  } else if (stepData.primaryDomain) {
    profile.researchDomains = [stepData.primaryDomain];
  }

  if (Array.isArray(stepData.researchSpecializations)) {
    profile.researchSpecializations = stepData.researchSpecializations;
  } else if (Array.isArray(stepData.specializations)) {
    profile.researchSpecializations = stepData.specializations;
  }

  if (Array.isArray(stepData.researchInterests)) {
    profile.researchInterests = stepData.researchInterests;
  } else if (Array.isArray(stepData.interests)) {
    profile.researchInterests = stepData.interests;
  }

  // Research Experience (Step 4 - flat or nested)
  const expUpdates: Record<string, any> = {};
  if (stepData.researchExperience && typeof stepData.researchExperience === "object") {
    Object.assign(expUpdates, stepData.researchExperience);
  }
  if (stepData.level !== undefined) expUpdates.level = stepData.level;
  if (stepData.hasWorkedOnProject !== undefined) expUpdates.hasWorkedOnProject = stepData.hasWorkedOnProject;
  if (stepData.hasPublishedPaper !== undefined) expUpdates.hasPublishedPaper = stepData.hasPublishedPaper;
  if (stepData.hasParticipatedConference !== undefined) expUpdates.hasParticipatedConference = stepData.hasParticipatedConference;
  if (stepData.hasWorkedWithDatasets !== undefined) expUpdates.hasWorkedWithDatasets = stepData.hasWorkedWithDatasets;
  if (stepData.hasWorkedWithDataAnalysisTools !== undefined) expUpdates.hasWorkedWithDataAnalysisTools = stepData.hasWorkedWithDataAnalysisTools;
  if (stepData.previousProjects !== undefined) expUpdates.previousProjects = stepData.previousProjects;
  if (stepData.publications !== undefined) expUpdates.publications = stepData.publications;
  if (stepData.conferences !== undefined) expUpdates.conferences = stepData.conferences;
  if (stepData.researchLabs !== undefined) expUpdates.researchLabs = stepData.researchLabs;

  if (Object.keys(expUpdates).length > 0) {
    if (!profile.researchExperience) {
      profile.researchExperience = {
        level: "Beginner",
        hasWorkedOnProject: false,
        hasPublishedPaper: false,
        hasParticipatedConference: false,
        hasWorkedWithDatasets: false,
        hasWorkedWithDataAnalysisTools: false,
        previousProjects: [],
        publications: [],
        conferences: [],
        researchLabs: [],
      };
    }
    for (const [key, val] of Object.entries(expUpdates)) {
      if (val !== undefined) {
        (profile.researchExperience as any)[key] = val;
      }
    }
  }

  // Research Goals (Step 5 - flat or nested)
  const goalUpdates: Record<string, any> = {};
  if (stepData.researchGoals && typeof stepData.researchGoals === "object") {
    Object.assign(goalUpdates, stepData.researchGoals);
  }
  if (stepData.primaryGoals !== undefined) goalUpdates.primaryGoals = stepData.primaryGoals;
  if (stepData.customGoal !== undefined) goalUpdates.customGoal = stepData.customGoal;

  if (Object.keys(goalUpdates).length > 0) {
    if (!profile.researchGoals) {
      profile.researchGoals = { primaryGoals: [], customGoal: "" };
    }
    if (goalUpdates.primaryGoals !== undefined) profile.researchGoals.primaryGoals = goalUpdates.primaryGoals;
    if (goalUpdates.customGoal !== undefined) profile.researchGoals.customGoal = goalUpdates.customGoal;
  }

  // Current Research Project (Step 6 - flat or nested)
  const projUpdates: Record<string, any> = {};
  if (stepData.currentResearchProject && typeof stepData.currentResearchProject === "object") {
    Object.assign(projUpdates, stepData.currentResearchProject);
  }
  if (stepData.hasProject !== undefined) projUpdates.hasProject = stepData.hasProject;
  if (stepData.title !== undefined) projUpdates.title = stepData.title;
  if (stepData.domain !== undefined) projUpdates.domain = stepData.domain;
  if (stepData.problemStatement !== undefined) projUpdates.problemStatement = stepData.problemStatement;
  if (stepData.researchObjectives !== undefined) projUpdates.researchObjectives = stepData.researchObjectives;
  if (stepData.researchQuestions !== undefined) projUpdates.researchQuestions = stepData.researchQuestions;
  if (stepData.currentStage !== undefined) projUpdates.currentStage = stepData.currentStage;

  if (Object.keys(projUpdates).length > 0) {
    if (!profile.currentResearchProject) {
      profile.currentResearchProject = { hasProject: "exploring" };
    }
    for (const [key, val] of Object.entries(projUpdates)) {
      if (val !== undefined) {
        (profile.currentResearchProject as any)[key] = val;
      }
    }
  }

  // Research Tools & Skills (Step 7)
  if (Array.isArray(stepData.researchTools)) profile.researchTools = stepData.researchTools;
  if (Array.isArray(stepData.technicalSkills)) profile.technicalSkills = stepData.technicalSkills;

  // Preferences (Step 8 - flat or nested)
  const prefUpdates: Record<string, any> = {};
  if (stepData.preferences && typeof stepData.preferences === "object") {
    Object.assign(prefUpdates, stepData.preferences);
  }
  if (stepData.citationStyle !== undefined) prefUpdates.citationStyle = stepData.citationStyle;
  if (stepData.outputFormat !== undefined) prefUpdates.outputFormat = stepData.outputFormat;
  if (stepData.language !== undefined) prefUpdates.language = stepData.language;
  if (stepData.preferredLanguage !== undefined) prefUpdates.language = stepData.preferredLanguage;
  if (stepData.notificationPreferences !== undefined) {
    prefUpdates.notificationPreferences = stepData.notificationPreferences;
  }

  if (Object.keys(prefUpdates).length > 0) {
    if (!profile.preferences) {
      profile.preferences = {
        citationStyle: "APA",
        outputFormat: "PDF",
        language: "English",
        notificationPreferences: {
          emailAlerts: true,
          paperRecommendations: true,
          collaborationInvites: true,
        },
      };
    }
    if (prefUpdates.citationStyle !== undefined) profile.preferences.citationStyle = prefUpdates.citationStyle;
    if (prefUpdates.outputFormat !== undefined) profile.preferences.outputFormat = prefUpdates.outputFormat;
    if (prefUpdates.language !== undefined) profile.preferences.language = prefUpdates.language;
    if (prefUpdates.notificationPreferences) {
      if (!profile.preferences.notificationPreferences) {
        profile.preferences.notificationPreferences = {
          emailAlerts: true,
          paperRecommendations: true,
          collaborationInvites: true,
        };
      }
      if (prefUpdates.notificationPreferences.emailAlerts !== undefined) {
        profile.preferences.notificationPreferences.emailAlerts = prefUpdates.notificationPreferences.emailAlerts;
      }
      if (prefUpdates.notificationPreferences.paperRecommendations !== undefined) {
        profile.preferences.notificationPreferences.paperRecommendations = prefUpdates.notificationPreferences.paperRecommendations;
      }
      if (prefUpdates.notificationPreferences.collaborationInvites !== undefined) {
        profile.preferences.notificationPreferences.collaborationInvites = prefUpdates.notificationPreferences.collaborationInvites;
      }
    }
  }

  if (stepData.onboardingCompleted !== undefined) {
    profile.onboardingCompleted = stepData.onboardingCompleted;
  }

  await profile.save();
  return profile;
};

export const completeResearcherOnboarding = async (
  identifier: ResearcherStepIdentifier
): Promise<IResearcherProfile> => {
  let profile: IResearcherProfile | null = null;
  const cleanEmail = identifier.email?.toLowerCase().trim();

  if (identifier.profileId && mongoose.Types.ObjectId.isValid(identifier.profileId)) {
    profile = await ResearcherProfile.findById(identifier.profileId);
  }

  if (!profile && identifier.userId && mongoose.Types.ObjectId.isValid(identifier.userId)) {
    profile = await ResearcherProfile.findOne({ userId: identifier.userId });
  }

  if (!profile && cleanEmail) {
    profile = await ResearcherProfile.findOne({ "contact.email": cleanEmail });
    if (!profile) {
      const user = await User.findOne({ email: cleanEmail });
      if (user) {
        profile = await ResearcherProfile.findOne({ userId: user._id });
      }
    }
  }

  if (!profile) {
    throw new Error("Researcher profile not found to complete onboarding");
  }

  if (profile.userId) {
    const user = await User.findById(profile.userId);
    if (user && user.userType !== "researcher") {
      user.userType = "researcher";
      await user.save();
    }
  }

  profile.onboardingCompleted = true;
  profile.onboardingStep = 9;
  await profile.save();
  return profile;
};
