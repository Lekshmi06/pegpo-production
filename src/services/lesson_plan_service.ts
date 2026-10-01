import mongoose from "mongoose";
import LessonPlan, {
  ILessonPlan,
  ILessonSession,
  LessonPlanStatus,
  LessonSessionStatus,
  IAssessmentRecommendation,
  ILessonResource,
  FlashcardDeckResource,
} from "../models/LessonPlan";
import TeachingContext from "../models/TeachingContext";
import Curriculum from "../models/Curriculum";
import LessonPlanTemplate, { ILessonPlanTemplate } from "../models/LessonPlanTemplate";
import { generateFlashcards } from "./gemini_service";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const CANDIDATE_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.6-flash",
];

export interface TeachingScheduleConstraints {
  sessionsPerWeek?: number;
  durationMinutes?: number;
  teachingDays?: string[];
  startDate?: string;
  targetCompletionDate?: string;
}

export interface CreateLessonPlanInput {
  contextId: string;
  curriculumId?: string;
  templateId?: string;
  templateName?: string;
  templateSchema?: any;
  templateSections?: Array<{ sectionKey: string; label: string; content: any }>;
  chapterTitle: string;
  unitNumber?: number;
  totalEstimatedHours?: number;
  status?: LessonPlanStatus;
  sessions?: Partial<ILessonSession>[];
}

export interface UpdateLessonPlanInput {
  chapterTitle?: string;
  unitNumber?: number;
  totalEstimatedHours?: number;
  status?: LessonPlanStatus;
  sessions?: ILessonSession[];
  templateId?: string;
  templateName?: string;
  templateSchema?: any;
  templateSections?: Array<{ sectionKey: string; label: string; content: any }>;
}

export interface AILessonPlanParams {
  contextId: string;
  chapterTitle?: string;
  curriculumId?: string;
  templateId?: string;
  templateSchema?: any;
  availableSessions?: number;
  durationMinutes?: number;
  additionalGuidelines?: string;
  teachingSchedule?: TeachingScheduleConstraints;
}

export const createLessonPlan = async (
  teacherId: string | mongoose.Types.ObjectId,
  data: CreateLessonPlanInput
): Promise<ILessonPlan> => {
  if (!data.contextId || !mongoose.Types.ObjectId.isValid(data.contextId)) {
    throw new Error("Valid contextId is required");
  }
  if (!data.chapterTitle?.trim()) {
    throw new Error("chapterTitle is required");
  }

  // Ensure teacher owns this context
  const context = await TeachingContext.findById(data.contextId);
  if (!context) {
    throw new Error("Teaching context not found");
  }
  if (context.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  // If curriculumId provided, verify it belongs to this context & teacher
  let resolvedCurriculumId: mongoose.Types.ObjectId | undefined;
  if (data.curriculumId) {
    if (!mongoose.Types.ObjectId.isValid(data.curriculumId)) {
      throw new Error("Invalid curriculumId");
    }
    const curriculum = await Curriculum.findById(data.curriculumId);
    if (!curriculum || curriculum.teacherId.toString() !== teacherId.toString()) {
      throw new Error("Unauthorized or invalid curriculum");
    }
    resolvedCurriculumId = curriculum._id;
  }

  const formattedSessions: ILessonSession[] = (data.sessions || []).map((s, idx) => ({
    sessionNumber: s.sessionNumber ?? idx + 1,
    title: s.title || `Session ${idx + 1}`,
    durationMinutes: s.durationMinutes ?? 45,
    learningObjectives: s.learningObjectives || [],
    teachingMethod: s.teachingMethod || "Lecture & Interactive Discussion",
    activities: s.activities || [],
    keyConcepts: s.keyConcepts || [],
    resources: s.resources || [],
    assignment: s.assignment || "",
    assessmentRecommendation: s.assessmentRecommendation,
    status: s.status || "planned",
    notes: s.notes || "",
    templateSections: s.templateSections,
  }));

  let resolvedTemplateId: mongoose.Types.ObjectId | undefined;
  if (data.templateId) {
    if (mongoose.Types.ObjectId.isValid(data.templateId)) {
      resolvedTemplateId = new mongoose.Types.ObjectId(data.templateId);
    }
  }

  const plan = await LessonPlan.create({
    teacherId,
    contextId: context._id,
    curriculumId: resolvedCurriculumId,
    templateId: resolvedTemplateId,
    templateName: data.templateName,
    templateSchema: data.templateSchema,
    templateSections: data.templateSections,
    classLevel: context.classLevel,
    subject: context.subject,
    chapterTitle: data.chapterTitle.trim(),
    unitNumber: data.unitNumber ?? 1,
    totalEstimatedHours: data.totalEstimatedHours ?? 3,
    status: data.status || "draft",
    sessions: formattedSessions,
  });

  return plan;
};

export const getLessonPlansByContext = async (
  contextId: string,
  teacherId: string | mongoose.Types.ObjectId
): Promise<ILessonPlan[]> => {
  if (!mongoose.Types.ObjectId.isValid(contextId)) {
    throw new Error("Invalid contextId");
  }

  const context = await TeachingContext.findById(contextId);
  if (!context) {
    throw new Error("Teaching context not found");
  }
  if (context.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  return LessonPlan.find({ contextId })
    .sort({ unitNumber: 1, createdAt: 1 })
    .lean();
};

export const getLessonPlanById = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId
): Promise<ILessonPlan> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) {
    throw new Error("Lesson plan not found");
  }
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }
  return plan;
};

export const updateLessonPlan = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  data: UpdateLessonPlanInput
): Promise<ILessonPlan> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) {
    throw new Error("Lesson plan not found");
  }
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }

  if (data.chapterTitle !== undefined) plan.chapterTitle = data.chapterTitle.trim();
  if (data.unitNumber !== undefined) plan.unitNumber = data.unitNumber;
  if (data.totalEstimatedHours !== undefined) plan.totalEstimatedHours = data.totalEstimatedHours;
  if (data.status !== undefined) plan.status = data.status;
  if (data.sessions !== undefined) plan.sessions = data.sessions;
  if (data.templateId !== undefined) plan.templateId = data.templateId as any;
  if (data.templateName !== undefined) plan.templateName = data.templateName;
  if (data.templateSchema !== undefined) plan.templateSchema = data.templateSchema;
  if (data.templateSections !== undefined) plan.templateSections = data.templateSections;

  await plan.save();
  return plan;
};

export const updateLessonSessionStatus = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  sessionNum: number,
  status: LessonSessionStatus,
  notes?: string
): Promise<ILessonPlan> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) {
    throw new Error("Lesson plan not found");
  }
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }

  const session = plan.sessions.find((s) => s.sessionNumber === sessionNum);
  if (!session) {
    throw new Error(`Session number ${sessionNum} not found in this lesson plan`);
  }

  session.status = status;
  if (status === "completed") {
    session.completedAt = new Date();
  } else {
    session.completedAt = undefined;
  }
  if (notes !== undefined) {
    session.notes = notes;
  }

  await plan.save();
  return plan;
};

/**
 * Normalizes session resources, safely converting legacy string items into structured reference resources.
 */
export function normalizeSessionResources(resources?: any[]): ILessonResource[] {
  if (!Array.isArray(resources)) return [];
  return resources.map((r, idx) => {
    if (typeof r === "string") {
      return {
        id: `res_legacy_${idx}_${Date.now()}`,
        type: "reference" as const,
        title: r,
        description: "Course reference material",
        referenceText: r,
        source: "teacher_added" as const,
        isApproved: true,
      };
    }
    if (r && typeof r === "object") {
      const id = r.id || (r as any)._id?.toString() || `res_${idx}_${Date.now()}`;
      return {
        ...r,
        id,
        source: r.source || "teacher_added",
        isApproved: r.isApproved !== undefined ? Boolean(r.isApproved) : true,
      } as ILessonResource;
    }
    return {
      id: `res_${idx}_${Date.now()}`,
      type: "reference" as const,
      title: String(r),
      referenceText: String(r),
      source: "teacher_added" as const,
      isApproved: true,
    };
  });
}

export const addSessionResource = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  sessionNum: number,
  resourceData: any
): Promise<{ plan: ILessonPlan; resource: ILessonResource }> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) throw new Error("Lesson plan not found");
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }
  const session = plan.sessions.find((s) => s.sessionNumber === sessionNum);
  if (!session) throw new Error(`Session number ${sessionNum} not found`);

  const id = resourceData.id || `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const resource: ILessonResource = {
    ...resourceData,
    id,
    source: resourceData.source || "teacher_added",
    isApproved: resourceData.isApproved !== undefined ? resourceData.isApproved : true,
  };

  const currentResources = normalizeSessionResources(session.resources);
  currentResources.push(resource);
  session.resources = currentResources;

  await plan.save();
  return { plan, resource };
};

export const updateSessionResource = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  sessionNum: number,
  resourceId: string,
  resourceData: Partial<ILessonResource>
): Promise<{ plan: ILessonPlan; resource: ILessonResource }> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) throw new Error("Lesson plan not found");
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }
  const session = plan.sessions.find((s) => s.sessionNumber === sessionNum);
  if (!session) throw new Error(`Session number ${sessionNum} not found`);

  const currentResources = normalizeSessionResources(session.resources);
  const index = currentResources.findIndex((r) => r.id === resourceId);
  if (index === -1) throw new Error(`Resource ${resourceId} not found in session ${sessionNum}`);

  currentResources[index] = {
    ...currentResources[index],
    ...resourceData,
    id: resourceId,
  } as ILessonResource;

  session.resources = currentResources;
  await plan.save();
  return { plan, resource: currentResources[index] };
};

export const deleteSessionResource = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  sessionNum: number,
  resourceId: string
): Promise<ILessonPlan> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) throw new Error("Lesson plan not found");
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }
  const session = plan.sessions.find((s) => s.sessionNumber === sessionNum);
  if (!session) throw new Error(`Session number ${sessionNum} not found`);

  const currentResources = normalizeSessionResources(session.resources);
  session.resources = currentResources.filter((r) => r.id !== resourceId);

  await plan.save();
  return plan;
};

export const toggleSessionResourceApproval = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  sessionNum: number,
  resourceId: string,
  isApproved?: boolean
): Promise<{ plan: ILessonPlan; resource: ILessonResource }> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) throw new Error("Lesson plan not found");
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }
  const session = plan.sessions.find((s) => s.sessionNumber === sessionNum);
  if (!session) throw new Error(`Session number ${sessionNum} not found`);

  const currentResources = normalizeSessionResources(session.resources);
  const index = currentResources.findIndex((r) => r.id === resourceId);
  if (index === -1) throw new Error(`Resource ${resourceId} not found in session ${sessionNum}`);

  const newStatus = isApproved !== undefined ? isApproved : !currentResources[index].isApproved;
  currentResources[index].isApproved = newStatus;

  session.resources = currentResources;
  await plan.save();
  return { plan, resource: currentResources[index] };
};

export const generateSessionFlashcards = async (
  planId: string,
  teacherId: string | mongoose.Types.ObjectId,
  sessionNum: number,
  count = 5
): Promise<{ plan: ILessonPlan; resource: FlashcardDeckResource }> => {
  const plan = await LessonPlan.findById(planId);
  if (!plan) throw new Error("Lesson plan not found");
  if (plan.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this lesson plan");
  }
  const session = plan.sessions.find((s) => s.sessionNumber === sessionNum);
  if (!session) throw new Error(`Session number ${sessionNum} not found`);

  const contextSample = `
Subject: ${plan.subject}
Grade: ${plan.classLevel}
Chapter: ${plan.chapterTitle}
Session ${session.sessionNumber}: ${session.title}
Key Concepts: ${session.keyConcepts.join(", ")}
Learning Objectives: ${session.learningObjectives.join("; ")}
Teaching Method: ${session.teachingMethod || ""}
Activities: ${(session.activities || []).join("; ")}
`;

  const rawCards = await generateFlashcards(contextSample, count);
  const formattedCards = rawCards.map((c) => ({
    front: c.front,
    back: c.back,
    hint: c.hint,
    difficulty: "medium" as const,
  }));

  const flashcardDeck: FlashcardDeckResource = {
    id: `fc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type: "flashcard_deck",
    title: `${session.title} Flashcards`,
    description: `High-yield recall cards for ${session.keyConcepts.join(", ") || session.title}`,
    source: "ai_recommended",
    isApproved: false,
    cards: formattedCards,
  };

  const currentResources = normalizeSessionResources(session.resources);
  currentResources.push(flashcardDeck);
  session.resources = currentResources;

  await plan.save();
  return { plan, resource: flashcardDeck };
};

/**
 * Intelligently maps or synthesizes template sections for a session
 * to guarantee that all detected template sections are populated.
 */
function populateSessionTemplateSections(
  rawSession: any,
  templateSchema: any,
  defaultTitle: string
): Array<{ sectionKey: string; label: string; content: any }> {
  if (!templateSchema?.sections || !Array.isArray(templateSchema.sections) || templateSchema.sections.length === 0) {
    return Array.isArray(rawSession?.templateSections) ? rawSession.templateSections : [];
  }

  const existingMap = new Map<string, any>();
  if (Array.isArray(rawSession?.templateSections)) {
    for (const ts of rawSession.templateSections) {
      if (ts?.sectionKey) {
        existingMap.set(String(ts.sectionKey).toLowerCase(), ts.content);
      }
      if (ts?.label) {
        existingMap.set(String(ts.label).toLowerCase(), ts.content);
      }
    }
  }

  const title = rawSession?.title || defaultTitle;

  return templateSchema.sections.map((sec: any) => {
    const keyLower = String(sec.key || "").toLowerCase();
    const labelLower = String(sec.label || "").toLowerCase();

    const existing = existingMap.get(keyLower) ?? existingMap.get(labelLower);
    if (existing !== undefined && existing !== null && (typeof existing === "string" ? existing.trim() !== "" : true)) {
      return {
        sectionKey: sec.key,
        label: sec.label,
        content: existing,
      };
    }

    // Map based on section keywords and pedagogical concepts
    let mappedContent: any = "";

    if (
      keyLower.includes("objective") ||
      labelLower.includes("objective") ||
      labelLower.includes("goal") ||
      labelLower.includes("outcome")
    ) {
      mappedContent = rawSession?.learningObjectives?.length
        ? rawSession.learningObjectives.join("; ")
        : `Master core pedagogical concepts and problem-solving techniques for ${title}.`;
    } else if (
      keyLower.includes("warm") ||
      labelLower.includes("warm") ||
      labelLower.includes("hook") ||
      labelLower.includes("anticipatory") ||
      labelLower.includes("intro") ||
      labelLower.includes("engage") ||
      labelLower.includes("starter")
    ) {
      mappedContent = rawSession?.activities?.[0] || `Engage students with a real-world inquiry prompt on ${title}.`;
    } else if (
      keyLower.includes("method") ||
      labelLower.includes("method") ||
      keyLower.includes("instruction") ||
      labelLower.includes("instruction") ||
      labelLower.includes("procedure") ||
      labelLower.includes("teach") ||
      labelLower.includes("model")
    ) {
      mappedContent = rawSession?.teachingMethod || "Interactive guided concept instruction and teacher walkthrough.";
    } else if (
      keyLower.includes("guided") ||
      labelLower.includes("guided") ||
      keyLower.includes("explore") ||
      labelLower.includes("explore")
    ) {
      mappedContent =
        rawSession?.activities?.[1] ||
        rawSession?.activities?.[0] ||
        `Guided problem-solving walkthrough with teacher mentoring.`;
    } else if (
      keyLower.includes("independent") ||
      labelLower.includes("independent") ||
      labelLower.includes("practice") ||
      labelLower.includes("elaborate") ||
      labelLower.includes("activity")
    ) {
      mappedContent =
        rawSession?.activities?.[0] || `Independent exercises and peer group problem breakdown for ${title}.`;
    } else if (
      keyLower.includes("concept") ||
      labelLower.includes("concept") ||
      keyLower.includes("vocab") ||
      labelLower.includes("vocab") ||
      labelLower.includes("term")
    ) {
      mappedContent = rawSession?.keyConcepts?.length ? rawSession.keyConcepts.join(", ") : `${title} core concepts`;
    } else if (
      keyLower.includes("resource") ||
      labelLower.includes("resource") ||
      keyLower.includes("material") ||
      labelLower.includes("material") ||
      labelLower.includes("equipment")
    ) {
      mappedContent = rawSession?.resources?.length ? rawSession.resources.join(", ") : "Textbook, whiteboard, practice worksheets";
    } else if (
      keyLower.includes("assess") ||
      labelLower.includes("assess") ||
      keyLower.includes("evaluate") ||
      labelLower.includes("check") ||
      labelLower.includes("quiz") ||
      labelLower.includes("closure") ||
      labelLower.includes("exit") ||
      labelLower.includes("summary")
    ) {
      const rec = rawSession?.assessmentRecommendation;
      mappedContent = rec?.recommended
        ? `Formative ${rec.type || "quiz"} on ${rec.topic || title} to check student understanding.`
        : `Exit ticket / formative quick check on key takeaways of ${title}.`;
    } else if (
      keyLower.includes("homework") ||
      labelLower.includes("homework") ||
      keyLower.includes("assign") ||
      labelLower.includes("assign") ||
      labelLower.includes("extension")
    ) {
      mappedContent = rawSession?.assignment || `Review notes and complete textbook practice problems for ${title}.`;
    } else {
      mappedContent = `${sec.label} instructional plan for ${title}`;
    }

    return {
      sectionKey: sec.key,
      label: sec.label,
      content: mappedContent,
    };
  });
}

/**
 * Validates AI teaching plan payload and guarantees template section consistency
 */
function validateAITeachingPlanOutput(
  parsed: any,
  defaultChapterTitle: string,
  defaultDuration: number,
  targetCount: number,
  templateSchema?: any
) {
  const chapterTitle =
    typeof parsed?.chapterTitle === "string" && parsed.chapterTitle.trim()
      ? parsed.chapterTitle.trim()
      : defaultChapterTitle;

  const unitNumber = typeof parsed?.unitNumber === "number" ? parsed.unitNumber : 1;
  const rawSessions = Array.isArray(parsed?.sessions) ? parsed.sessions : [];

  const sessions: ILessonSession[] = rawSessions.map((s: any, idx: number) => {
    const sessionNumber = typeof s?.sessionNumber === "number" ? s.sessionNumber : idx + 1;
    const title = typeof s?.title === "string" && s.title.trim() ? s.title.trim() : `Session ${sessionNumber}`;
    const durationMinutes =
      typeof s?.durationMinutes === "number" && s.durationMinutes > 0 ? s.durationMinutes : defaultDuration;
    const learningObjectives = Array.isArray(s?.learningObjectives)
      ? s.learningObjectives.filter((o: any) => typeof o === "string" && o.trim().length > 0)
      : [];
    const teachingMethod =
      typeof s?.teachingMethod === "string" && s.teachingMethod.trim()
        ? s.teachingMethod.trim()
        : "Lecture & Interactive Discussion";
    const activities = Array.isArray(s?.activities)
      ? s.activities.filter((a: any) => typeof a === "string" && a.trim().length > 0)
      : [];
    const keyConcepts = Array.isArray(s?.keyConcepts)
      ? s.keyConcepts.filter((c: any) => typeof c === "string" && c.trim().length > 0)
      : [];
    let resources = normalizeSessionResources(s?.resources);
    if (resources.length === 0) {
      // Synthesize selective recommended resources for this session
      resources = [
        {
          id: `res_vid_${sessionNumber}_${Date.now()}`,
          type: "video" as const,
          title: `${title} Video Concept`,
          searchQuery: `${title} educational tutorial`,
          recommendationReason: `Visual explanation of core concepts for ${title}`,
          source: "ai_recommended" as const,
          isApproved: false,
        },
        {
          id: `res_fc_${sessionNumber}_${Date.now()}`,
          type: "flashcard_deck" as const,
          title: `${title} Flashcards`,
          source: "ai_recommended" as const,
          isApproved: false,
          cards: keyConcepts.slice(0, 3).map((concept: string) => ({
            front: `What is ${concept}?`,
            back: `Core definition and pedagogical significance of ${concept} in ${title}.`,
            hint: `Session ${sessionNumber} key concept`,
            difficulty: "medium" as const,
          })),
        },
      ];
    }
    const assignment = typeof s?.assignment === "string" ? s.assignment.trim() : "";

    let assessmentRecommendation: IAssessmentRecommendation | undefined;
    if (s?.assessmentRecommendation && typeof s.assessmentRecommendation === "object") {
      assessmentRecommendation = {
        type: s.assessmentRecommendation.type || "quiz",
        recommended: Boolean(s.assessmentRecommendation.recommended),
        topic: s.assessmentRecommendation.topic || title,
        suggestedQuestionsCount: s.assessmentRecommendation.suggestedQuestionsCount || 5,
      };
    } else if (idx === rawSessions.length - 1) {
      // Recommend an assessment at the conclusion of the chapter
      assessmentRecommendation = {
        type: "quiz",
        recommended: true,
        topic: `${chapterTitle} Review`,
        suggestedQuestionsCount: 5,
      };
    }

    let templateSections: any[] | undefined = undefined;
    if (templateSchema?.sections && Array.isArray(templateSchema.sections) && templateSchema.sections.length > 0) {
      templateSections = populateSessionTemplateSections(s, templateSchema, title);
    } else if (Array.isArray(s?.templateSections) && s.templateSections.length > 0) {
      templateSections = s.templateSections.map((ts: any) => ({
        sectionKey: typeof ts?.sectionKey === "string" ? ts.sectionKey : "section",
        label: typeof ts?.label === "string" ? ts.label : "Section",
        content: ts?.content ?? "",
      }));
    }

    return {
      sessionNumber,
      title,
      durationMinutes,
      learningObjectives,
      teachingMethod,
      activities,
      keyConcepts,
      resources,
      assignment,
      assessmentRecommendation,
      status: "planned" as LessonSessionStatus,
      notes: "",
      templateSections,
    };
  });

  const totalEstimatedHours =
    typeof parsed?.totalEstimatedHours === "number"
      ? parsed.totalEstimatedHours
      : Math.round((sessions.length * defaultDuration) / 60) || 3;

  let planTemplateSections: any[] | undefined = undefined;
  if (Array.isArray(parsed?.templateSections) && parsed.templateSections.length > 0) {
    planTemplateSections = parsed.templateSections.map((ts: any) => ({
      sectionKey: typeof ts?.sectionKey === "string" ? ts.sectionKey : "section",
      label: typeof ts?.label === "string" ? ts.label : "Section",
      content: ts?.content ?? "",
    }));
  } else if (templateSchema?.sections && Array.isArray(templateSchema.sections)) {
    planTemplateSections = templateSchema.sections.map((sec: any) => ({
      sectionKey: sec.key,
      label: sec.label,
      content: `Curriculum unit plan for ${chapterTitle}`,
    }));
  }

  return {
    chapterTitle,
    unitNumber,
    totalEstimatedHours,
    templateSections: planTemplateSections,
    sessions,
  };
}

export const generateAILessonPlan = async (
  teacherId: string | mongoose.Types.ObjectId,
  params: AILessonPlanParams
) => {
  const context = await TeachingContext.findById(params.contextId);
  if (!context) {
    throw new Error("Teaching context not found");
  }
  if (context.teacherId.toString() !== teacherId.toString()) {
    throw new Error("Unauthorized: you do not own this teaching context");
  }

  // Determine duration and session count based on schedule constraints
  const schedule = params.teachingSchedule || {};
  const duration = schedule.durationMinutes || params.durationMinutes || 45;

  let sessionCount = params.availableSessions || 4;
  if (schedule.sessionsPerWeek) {
    if (schedule.startDate && schedule.targetCompletionDate) {
      const start = new Date(schedule.startDate);
      const end = new Date(schedule.targetCompletionDate);
      const diffMs = end.getTime() - start.getTime();
      const diffWeeks = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 7)));
      sessionCount = Math.min(30, Math.max(2, diffWeeks * schedule.sessionsPerWeek));
    } else {
      sessionCount = Math.min(16, schedule.sessionsPerWeek * 2);
    }
  }

  // Load curriculum if provided
  let curriculumContextStr = "";
  let resolvedChapterTitle = params.chapterTitle?.trim() || "";

  if (params.curriculumId) {
    if (!mongoose.Types.ObjectId.isValid(params.curriculumId)) {
      throw new Error("Invalid curriculumId");
    }
    const curriculum = await Curriculum.findById(params.curriculumId);
    if (!curriculum || curriculum.teacherId.toString() !== teacherId.toString()) {
      throw new Error("Unauthorized or invalid curriculum");
    }

    if (!resolvedChapterTitle && curriculum.units.length > 0) {
      const firstCh = curriculum.units[0]?.chapters[0];
      if (firstCh) resolvedChapterTitle = firstCh.title;
    }

    curriculumContextStr = `
- CURRICULUM SYLLABUS CONTEXT:
  Board: ${curriculum.board}
  Subject: ${curriculum.subject}
  Class: ${curriculum.classLevel}
  Units and Chapters:
  ${curriculum.units
    .map(
      (u) =>
        `  Unit ${u.unitNumber}: ${u.title}\n` +
        u.chapters
          .map((ch) => `    Chapter: ${ch.title} (Topics: ${ch.topics.join(", ") || "Core topics"})`)
          .join("\n")
    )
    .join("\n")}
`;
  }

  if (!resolvedChapterTitle) {
    resolvedChapterTitle = `${context.subject} Core Modules`;
  }

  // Resolve template if requested
  let resolvedTemplate: ILessonPlanTemplate | null = null;
  let resolvedTemplateSchema: any = params.templateSchema || null;
  let resolvedTemplateName: string | undefined = undefined;

  if (params.templateId) {
    if (!mongoose.Types.ObjectId.isValid(params.templateId)) {
      throw new Error("Invalid templateId");
    }
    const tpl = await LessonPlanTemplate.findById(params.templateId);
    if (!tpl || !tpl.isActive) {
      throw new Error("Lesson plan template not found or inactive");
    }
    if (tpl.type === "custom" && tpl.createdBy?.toString() !== teacherId.toString()) {
      throw new Error("Unauthorized: you do not own this custom template");
    }
    resolvedTemplate = tpl;
    resolvedTemplateSchema = tpl.extractedSchema;
    resolvedTemplateName = tpl.name;
  } else if (resolvedTemplateSchema?.templateName) {
    resolvedTemplateName = resolvedTemplateSchema.templateName;
  }

  let templatePromptStr = "";
  if (resolvedTemplateSchema?.sections && Array.isArray(resolvedTemplateSchema.sections) && resolvedTemplateSchema.sections.length > 0) {
    templatePromptStr = `
- LESSON PLAN TEMPLATE STRUCTURE GUIDELINES:
  Template: "${resolvedTemplateName || "Selected Template"}"
  You MUST organize and represent the teaching plan according to the following template sections:
${resolvedTemplateSchema.sections.map((s: any, idx: number) => `  ${idx + 1}. [Key: "${s.key}"] "${s.label}" (${s.type || "text"}) - ${s.description || "Template structural section"}`).join("\n")}

  CRITICAL: In addition to standard session fields (title, objectives, methods, activities, resources, assessment), include a "templateSections" array on each session with the template content for that session:
  "templateSections": [
${resolvedTemplateSchema.sections.map((s: any) => `    { "sectionKey": "${s.key}", "label": "${s.label}", "content": "Pedagogical content for ${s.label}" }`).join(",\n")}
  ]
`;
  }

  const prompt = `You are an expert pedagogical curriculum designer for K-12 and higher education.
Generate a comprehensive, realistic teaching plan draft paced across the specified sessions.

TEACHING CONTEXT:
- Class / Grade: ${context.classLevel}
- Subject: ${context.subject}
- Curriculum Board: ${context.curriculumBoard}
- Chapter / Topic Title: "${resolvedChapterTitle}"
- Target Number of Sessions: ${sessionCount}
- Duration per Session: ${duration} minutes
${schedule.teachingDays?.length ? `- Teaching Days per Week: ${schedule.teachingDays.join(", ")}` : ""}
${schedule.startDate ? `- Start Date: ${schedule.startDate}` : ""}
${schedule.targetCompletionDate ? `- Target Completion Date: ${schedule.targetCompletionDate}` : ""}
${curriculumContextStr}
${params.additionalGuidelines ? `- Additional Teacher Instructions: ${params.additionalGuidelines}` : ""}
${templatePromptStr}

CRITICAL RULES:
1. Pacing must be realistic across all ${sessionCount} sessions.
2. Every session must have:
   - "sessionNumber": 1 to ${sessionCount}
   - "title": Clear and descriptive session topic
   - "durationMinutes": exactly ${duration}
   - "learningObjectives": 2-3 measurable pedagogical outcomes
   - "teachingMethod": Pedagogical strategy (e.g. Socratic Dialogue, Flipped Classroom, Visual Proof, Lab Problem Solving)
   - "activities": 1-2 interactive classroom activities or discussion prompts
   - "keyConcepts": 2-4 core terms or formulas
   - "resources": Selectively recommend 1-3 supporting teaching resources chosen based on whether this session benefits from visual, recall, practice, or active inquiry (DO NOT generate all resource types for every session).
     Supported resource objects:
     * Video: { "type": "video", "title": "Video title", "searchQuery": "Targeted YouTube search query (topic + concept)", "recommendationReason": "Why this video is recommended" } (NEVER invent fake URLs)
     * Visual: { "type": "visual/animation", "title": "Visual / Simulation Title", "visualType": "diagram"|"simulation"|"infographic", "promptOrConcept": "Concept to illustrate or PhET simulation topic" }
     * Flashcards: { "type": "flashcard_deck", "title": "Key Concept Recall Deck", "cards": [{ "front": "term or question", "back": "definition or concise answer", "hint": "optional hint" }] }
     * Worksheet: { "type": "worksheet", "title": "Practice Worksheet", "instructions": "Guidance", "exercises": ["Exercise 1", "Exercise 2"] }
     * Activity: { "type": "activity", "title": "Classroom Activity", "activityType": "pair"|"group"|"discussion", "instructions": "How to run", "durationMinutes": 15 }
     * Quiz: { "type": "quiz", "title": "Formative Check", "questions": [{ "question": "Question text", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "Why correct" }] }
     * Reference: { "type": "reference", "title": "Reference Material", "referenceText": "Textbook section or reading reference" }
   - "assessmentRecommendation": { "type": "quiz"|"test"|"assignment"|"oral", "recommended": true/false, "topic": "..." }
   - "assignment": Brief homework or revision task
${resolvedTemplateSchema?.sections?.length ? `   - "templateSections": Array of { "sectionKey", "label", "content" } matching the template structure` : ""}
3. Return strictly valid JSON with this exact schema without markdown wrapping:
{
  "chapterTitle": "${resolvedChapterTitle}",
  "unitNumber": 1,
  "totalEstimatedHours": ${Math.round((sessionCount * duration) / 60) || 3},
  "sessions": [
    {
      "sessionNumber": 1,
      "title": "Title of session",
      "durationMinutes": ${duration},
      "learningObjectives": ["Objective 1", "Objective 2"],
      "teachingMethod": "Concept Walkthrough & Inquiry",
      "activities": ["Interactive diagram breakdown", "Think-pair-share"],
      "keyConcepts": ["Concept A", "Concept B"],
      "resources": [
        {
          "type": "video",
          "title": "Topic Conceptual Video",
          "searchQuery": "${resolvedChapterTitle} tutorial Khan Academy",
          "recommendationReason": "Visual step-by-step walkthrough"
        },
        {
          "type": "flashcard_deck",
          "title": "Key Term Recall Cards",
          "cards": [
            { "front": "What is Concept A?", "back": "Precise definition of Concept A", "hint": "Session core term" }
          ]
        }
      ],
      "assessmentRecommendation": {
        "type": "quiz",
        "recommended": false,
        "topic": "Concept A Check"
      },
      "assignment": "Textbook Exercise 1-5"${resolvedTemplateSchema?.sections?.length ? `,
      "templateSections": [
${resolvedTemplateSchema.sections.map((s: any) => `        { "sectionKey": "${s.key}", "label": "${s.label}", "content": "Pedagogical details for ${s.label}" }`).join(",\n")}
      ]` : ""}
    }
  ]
}`;

  let parsedData: any = null;
  let isAiGenerated = false;

  if (ai) {
    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
        });
        const text = response.text || "";
        if (text) {
          const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
          parsedData = JSON.parse(cleaned);
          isAiGenerated = true;
          break;
        }
      } catch (err) {
        console.warn(`[generateAILessonPlan] Model ${model} failed, trying next candidate...`);
      }
    }
  }

  let finalPlan;
  if (parsedData && parsedData.sessions) {
    finalPlan = validateAITeachingPlanOutput(
      parsedData,
      resolvedChapterTitle,
      duration,
      sessionCount,
      resolvedTemplateSchema
    );
  } else {
    // Fallback heuristic pacing generator
    const fallbackSessions: ILessonSession[] = Array.from({ length: sessionCount }, (_, i) => {
      let fallbackTemplateSections: any[] | undefined = undefined;
      if (resolvedTemplateSchema?.sections && Array.isArray(resolvedTemplateSchema.sections)) {
        fallbackTemplateSections = resolvedTemplateSchema.sections.map((sec: any) => ({
          sectionKey: sec.key,
          label: sec.label,
          content: `${sec.label} for ${resolvedChapterTitle} (Session ${i + 1})`,
        }));
      }

      const fallbackResources: ILessonResource[] = [
        {
          id: `res_vid_${i + 1}_${Date.now()}`,
          type: "video",
          title: `${resolvedChapterTitle} Part ${i + 1} Video Walkthrough`,
          searchQuery: `${resolvedChapterTitle} Part ${i + 1} tutorial explanation`,
          recommendationReason: `Reinforces core concepts for ${resolvedChapterTitle} Part ${i + 1}`,
          source: "ai_recommended",
          isApproved: false,
        },
        {
          id: `res_fc_${i + 1}_${Date.now()}`,
          type: "flashcard_deck",
          title: `${resolvedChapterTitle} Recall Cards`,
          source: "ai_recommended",
          isApproved: false,
          cards: [
            {
              front: `What is ${resolvedChapterTitle} Principle ${i + 1}?`,
              back: `Foundational law and operational mechanism of ${resolvedChapterTitle} covered in Session ${i + 1}.`,
              hint: `Core Principle ${i + 1}`,
              difficulty: "medium",
            },
            {
              front: `Define Core Formula ${i + 1}`,
              back: `Mathematical relationship and boundary conditions applied in Session ${i + 1}.`,
              hint: `Formula ${i + 1}`,
              difficulty: "easy",
            },
          ],
        },
      ];

      return {
        sessionNumber: i + 1,
        title: `${resolvedChapterTitle} - Part ${i + 1}`,
        durationMinutes: duration,
        learningObjectives: [
          `Master definitions and formulas of ${resolvedChapterTitle} Part ${i + 1}`,
          `Apply conceptual models to solve standard curriculum questions`,
        ],
        teachingMethod: i === 0 ? "Introduction & Conceptual Framing" : "Structured Problem Solving & Interactive Review",
        activities: [
          `Guided analysis of ${resolvedChapterTitle} examples`,
          `Class discussion and peer problem walkthrough`,
        ],
        keyConcepts: [`${resolvedChapterTitle} Principle ${i + 1}`, `Core Formula ${i + 1}`],
        resources: fallbackResources,
        assignment: `Complete section ${i + 1} practice exercises and notes review.`,
        assessmentRecommendation: {
          type: i === sessionCount - 1 ? "test" : "quiz",
          recommended: i % 2 === 1 || i === sessionCount - 1,
          topic: `${resolvedChapterTitle} - Module ${i + 1} Assessment`,
          suggestedQuestionsCount: 5,
        },
        status: "planned",
        notes: "",
        templateSections: fallbackTemplateSections,
      };
    });

    finalPlan = {
      chapterTitle: resolvedChapterTitle,
      unitNumber: 1,
      totalEstimatedHours: Math.round((sessionCount * duration) / 60) || 3,
      sessions: fallbackSessions,
    };
  }

  return {
    isAiGenerated,
    curriculumId: params.curriculumId,
    templateId: resolvedTemplate?._id,
    templateName: resolvedTemplateName,
    templateSchema: resolvedTemplateSchema,
    data: {
      ...finalPlan,
      templateId: resolvedTemplate?._id,
      templateName: resolvedTemplateName,
      templateSchema: resolvedTemplateSchema,
    },
  };
};
