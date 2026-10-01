import mongoose from "mongoose";
import Manuscript, { IManuscript, ManuscriptStatus } from "../models/Manuscript";
import ManuscriptSection, {
  IManuscriptSection,
  ManuscriptSectionType,
} from "../models/ManuscriptSection";
import ResearchProject from "../models/ResearchProject";
import ResearchPaper from "../models/ResearchPaper";
import ResearchNote from "../models/ResearchNote";

export const DEFAULT_MANUSCRIPT_SECTIONS: Array<{
  title: string;
  sectionType: ManuscriptSectionType;
  order: number;
}> = [
  { title: "Abstract", sectionType: "abstract", order: 0 },
  { title: "Introduction", sectionType: "introduction", order: 1 },
  { title: "Literature Review", sectionType: "literature_review", order: 2 },
  { title: "Research Gap", sectionType: "research_gap", order: 3 },
  { title: "Methodology", sectionType: "methodology", order: 4 },
  { title: "Results", sectionType: "results", order: 5 },
  { title: "Discussion", sectionType: "discussion", order: 6 },
  { title: "Conclusion", sectionType: "conclusion", order: 7 },
  { title: "References", sectionType: "references", order: 8 },
];

export interface CreateManuscriptInput {
  projectId: string;
  title: string;
  description?: string;
  citationStyle?: string;
  status?: ManuscriptStatus;
  customSections?: Array<{ title: string; sectionType?: string }>;
}

export const manuscriptService = {
  /**
   * Create a new research manuscript under a project with default or custom sections
   */
  createManuscript: async (
    input: CreateManuscriptInput,
    ownerId?: string
  ): Promise<any> => {
    if (!mongoose.isValidObjectId(input.projectId)) {
      throw new Error("Invalid project ID format");
    }

    const project = await ResearchProject.findById(input.projectId);
    if (!project) {
      throw new Error("Research project not found");
    }

    // Ownership / collaboration check
    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      const requesterOid = new mongoose.Types.ObjectId(ownerId);
      const isOwner = project.ownerId && project.ownerId.equals(requesterOid);
      const collab = project.collaborators?.find((c) => c.researcherId.equals(requesterOid));

      if (!isOwner && !collab) {
        throw new Error("Unauthorized: You do not have permission to create manuscripts in this project");
      }

      if (collab && (collab.role === "reviewer" || collab.role === "viewer")) {
        throw new Error("Forbidden: Reviewers and viewers have read-only access and cannot create or edit manuscripts");
      }
    }

    const resolvedOwnerId =
      ownerId && mongoose.isValidObjectId(ownerId)
        ? new mongoose.Types.ObjectId(ownerId)
        : project.ownerId || new mongoose.Types.ObjectId();

    const manuscript = await Manuscript.create({
      ownerId: resolvedOwnerId,
      projectId: project._id,
      title: input.title?.trim() || "Untitled Manuscript",
      description: input.description?.trim() || "",
      citationStyle: input.citationStyle?.trim() || "APA",
      status: input.status || "draft",
      sectionIds: [],
    });

    // Create sections: either custom sections or the 9 default sections
    const initialSections =
      input.customSections && input.customSections.length > 0
        ? input.customSections.map((sec, index) => ({
            ownerId: resolvedOwnerId,
            manuscriptId: manuscript._id,
            title: sec.title.trim() || `Section ${index + 1}`,
            sectionType: sec.sectionType || "custom",
            order: index,
            content: "",
            evidencePaperIds: [],
            evidenceNoteIds: [],
            aiAssisted: false,
          }))
        : DEFAULT_MANUSCRIPT_SECTIONS.map((sec) => ({
            ownerId: resolvedOwnerId,
            manuscriptId: manuscript._id,
            title: sec.title,
            sectionType: sec.sectionType,
            order: sec.order,
            content: "",
            evidencePaperIds: [],
            evidenceNoteIds: [],
            aiAssisted: false,
          }));

    const createdSections = await ManuscriptSection.insertMany(initialSections);
    manuscript.sectionIds = createdSections.map((s) => s._id as mongoose.Types.ObjectId);
    await manuscript.save();

    return {
      ...manuscript.toObject(),
      sections: createdSections,
    };
  },

  /**
   * List manuscripts for a researcher, optionally filtered by project
   */
  listManuscripts: async (
    ownerId?: string,
    projectId?: string
  ): Promise<any[]> => {
    const query: Record<string, any> = {};

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      query.ownerId = new mongoose.Types.ObjectId(ownerId);
    }

    if (projectId) {
      if (!mongoose.isValidObjectId(projectId)) {
        throw new Error("Invalid project ID format");
      }
      query.projectId = new mongoose.Types.ObjectId(projectId);

      // Verify researcher owns or collaborates on the project if ownerId is provided
      if (ownerId && mongoose.isValidObjectId(ownerId)) {
        const project = await ResearchProject.findById(projectId).lean();
        if (project) {
          const reqOid = new mongoose.Types.ObjectId(ownerId);
          const isOwner = project.ownerId && project.ownerId.equals(reqOid);
          const isCollab = project.collaborators?.some((c) => c.researcherId.equals(reqOid));
          if (!isOwner && !isCollab) {
            throw new Error("Unauthorized: You do not have permission to access manuscripts for this project");
          }
        }
      }
    }

    const manuscripts = await Manuscript.find(query)
      .populate("projectId", "title domain researchQuestion currentStage status")
      .sort({ updatedAt: -1 })
      .lean();

    // Populate section metrics for each manuscript
    const results = await Promise.all(
      manuscripts.map(async (m) => {
        const sections = await ManuscriptSection.find({ manuscriptId: m._id })
          .select("_id title sectionType order content aiAssisted")
          .sort({ order: 1 })
          .lean();

        const totalSections = sections.length;
        const completedSections = sections.filter(
          (s) => s.content && s.content.trim().length > 30
        ).length;

        return {
          ...m,
          sections,
          totalSections,
          completedSections,
          progress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
        };
      })
    );

    return results;
  },

  /**
   * Get single manuscript by ID with populated sections and project context
   */
  getManuscriptById: async (
    manuscriptId: string,
    ownerId?: string
  ): Promise<any> => {
    if (!mongoose.isValidObjectId(manuscriptId)) {
      throw new Error("Invalid manuscript ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId)
      .populate("projectId", "title domain researchQuestion objectives currentStage status paperIds noteIds")
      .lean();

    if (!manuscript) {
      return null;
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      const reqOid = new mongoose.Types.ObjectId(ownerId);
      const isOwner = manuscript.ownerId && manuscript.ownerId.equals(reqOid);
      let isCollab = false;
      if (!isOwner && manuscript.projectId) {
        const project = await ResearchProject.findById(manuscript.projectId).lean();
        isCollab = !!project?.collaborators?.some((c) => c.researcherId.equals(reqOid));
      }
      if (!isOwner && !isCollab) {
        throw new Error("Unauthorized: You do not have permission to access this manuscript");
      }
    }

    const sections = await ManuscriptSection.find({ manuscriptId: manuscript._id })
      .populate("evidencePaperIds", "title authors year venue doi abstract methodology datasets findings limitations")
      .populate("evidenceNoteIds", "title content noteType excerpt tags isPinned paperId")
      .sort({ order: 1 })
      .lean();

    const totalSections = sections.length;
    const completedSections = sections.filter(
      (s) => s.content && s.content.trim().length > 30
    ).length;

    return {
      ...manuscript,
      sections,
      totalSections,
      completedSections,
      progress: totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0,
    };
  },

  /**
   * Update manuscript metadata (title, description, status, citationStyle)
   */
  updateManuscript: async (
    manuscriptId: string,
    updates: Partial<{
      title: string;
      description: string;
      status: ManuscriptStatus;
      citationStyle: string;
    }>,
    ownerId?: string
  ): Promise<any> => {
    if (!mongoose.isValidObjectId(manuscriptId)) {
      throw new Error("Invalid manuscript ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId);
    if (!manuscript) {
      return null;
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      if (manuscript.ownerId && !manuscript.ownerId.equals(new mongoose.Types.ObjectId(ownerId))) {
        throw new Error("Unauthorized: You do not have permission to update this manuscript");
      }
    }

    if (updates.title !== undefined) manuscript.title = updates.title.trim();
    if (updates.description !== undefined) manuscript.description = updates.description.trim();
    if (updates.status !== undefined) manuscript.status = updates.status;
    if (updates.citationStyle !== undefined) manuscript.citationStyle = updates.citationStyle.trim();

    await manuscript.save();
    return manuscript.toObject();
  },

  /**
   * Delete manuscript and all its associated sections
   */
  deleteManuscript: async (
    manuscriptId: string,
    ownerId?: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!mongoose.isValidObjectId(manuscriptId)) {
      throw new Error("Invalid manuscript ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId);
    if (!manuscript) {
      throw new Error("Manuscript not found");
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      if (manuscript.ownerId && !manuscript.ownerId.equals(new mongoose.Types.ObjectId(ownerId))) {
        throw new Error("Unauthorized: You do not have permission to delete this manuscript");
      }
    }

    await ManuscriptSection.deleteMany({ manuscriptId: manuscript._id });
    await Manuscript.findByIdAndDelete(manuscriptId);

    return {
      success: true,
      message: "Manuscript and all associated sections deleted successfully",
    };
  },

  /**
   * Create a new section in a manuscript
   */
  createSection: async (
    manuscriptId: string,
    data: {
      title: string;
      sectionType?: string;
      content?: string;
      order?: number;
      evidencePaperIds?: string[];
      evidenceNoteIds?: string[];
    },
    ownerId?: string
  ): Promise<IManuscriptSection> => {
    if (!mongoose.isValidObjectId(manuscriptId)) {
      throw new Error("Invalid manuscript ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId);
    if (!manuscript) {
      throw new Error("Manuscript not found");
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      const requesterOid = new mongoose.Types.ObjectId(ownerId);
      const isOwner = manuscript.ownerId && manuscript.ownerId.equals(requesterOid);
      let isCollab = false;
      let collabRole: string | undefined = undefined;

      if (!isOwner && manuscript.projectId) {
        const project = await ResearchProject.findById(manuscript.projectId).lean();
        const found = project?.collaborators?.find((c) => c.researcherId.equals(requesterOid));
        if (found) {
          isCollab = true;
          collabRole = found.role;
        }
      }

      if (!isOwner && !isCollab) {
        throw new Error("Unauthorized: You do not have permission to add sections to this manuscript");
      }

      if (collabRole === "reviewer" || collabRole === "viewer") {
        throw new Error("Forbidden: Reviewers and viewers have read-only access and cannot edit manuscript content");
      }
    }

    // Determine order if not specified
    let targetOrder = data.order;
    if (targetOrder === undefined || targetOrder === null) {
      const highestOrderSection = await ManuscriptSection.findOne({
        manuscriptId: manuscript._id,
      })
        .sort({ order: -1 })
        .lean();
      targetOrder = highestOrderSection ? highestOrderSection.order + 1 : 0;
    }

    // Sanitize evidence IDs
    const validPaperIds = (data.evidencePaperIds || [])
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const validNoteIds = (data.evidenceNoteIds || [])
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const section = await ManuscriptSection.create({
      ownerId: manuscript.ownerId,
      manuscriptId: manuscript._id,
      title: data.title?.trim() || "Untitled Section",
      sectionType: data.sectionType || "custom",
      order: targetOrder,
      content: data.content || "",
      evidencePaperIds: validPaperIds,
      evidenceNoteIds: validNoteIds,
      aiAssisted: false,
    });

    if (!manuscript.sectionIds) {
      manuscript.sectionIds = [];
    }
    manuscript.sectionIds.push(section._id as mongoose.Types.ObjectId);
    await manuscript.save();

    const populated = await ManuscriptSection.findById(section._id)
      .populate("evidencePaperIds", "title authors year venue doi")
      .populate("evidenceNoteIds", "title content noteType excerpt")
      .lean();

    return (populated as unknown) as IManuscriptSection;
  },

  /**
   * Get all sections of a manuscript
   */
  getSections: async (
    manuscriptId: string,
    ownerId?: string
  ): Promise<IManuscriptSection[]> => {
    if (!mongoose.isValidObjectId(manuscriptId)) {
      throw new Error("Invalid manuscript ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId).lean();
    if (!manuscript) {
      throw new Error("Manuscript not found");
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      const reqOid = new mongoose.Types.ObjectId(ownerId);
      const isOwner = manuscript.ownerId && manuscript.ownerId.equals(reqOid);
      let isCollab = false;
      if (!isOwner && manuscript.projectId) {
        const project = await ResearchProject.findById(manuscript.projectId).lean();
        isCollab = !!project?.collaborators?.some((c) => c.researcherId.equals(reqOid));
      }
      if (!isOwner && !isCollab) {
        throw new Error("Unauthorized: You do not have permission to view sections of this manuscript");
      }
    }

    return (ManuscriptSection.find({ manuscriptId: new mongoose.Types.ObjectId(manuscriptId) })
      .populate("evidencePaperIds", "title authors year venue doi abstract methodology datasets findings limitations")
      .populate("evidenceNoteIds", "title content noteType excerpt tags isPinned paperId")
      .sort({ order: 1 })
      .lean() as unknown) as IManuscriptSection[];
  },

  /**
   * Update an existing manuscript section (content, title, evidence, order, aiAssisted)
   */
  updateSection: async (
    sectionId: string,
    updates: Partial<{
      title: string;
      sectionType: string;
      content: string;
      order: number;
      evidencePaperIds: string[];
      evidenceNoteIds: string[];
      aiAssisted: boolean;
    }>,
    ownerId?: string
  ): Promise<any> => {
    if (!mongoose.isValidObjectId(sectionId)) {
      throw new Error("Invalid section ID format");
    }

    const section = await ManuscriptSection.findById(sectionId);
    if (!section) {
      return null;
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      const requesterOid = new mongoose.Types.ObjectId(ownerId);
      const manuscript = await Manuscript.findById(section.manuscriptId).lean();
      if (!manuscript) {
        throw new Error("Manuscript not found");
      }

      const project = await ResearchProject.findById(manuscript.projectId).lean();
      if (!project) {
        throw new Error("Research project not found");
      }

      const isProjectOwner = project.ownerId && project.ownerId.equals(requesterOid);
      const collab = project.collaborators?.find((c) => c.researcherId.equals(requesterOid));

      if (!isProjectOwner && !collab) {
        throw new Error("Unauthorized: You do not have permission to update this section");
      }

      if (collab && (collab.role === "reviewer" || collab.role === "viewer")) {
        throw new Error("Forbidden: Reviewers and viewers have read-only access and cannot edit manuscript content");
      }
    }

    if (updates.title !== undefined) section.title = updates.title.trim();
    if (updates.sectionType !== undefined) section.sectionType = updates.sectionType;
    if (updates.content !== undefined) section.content = updates.content;
    if (updates.order !== undefined) section.order = updates.order;
    if (updates.aiAssisted !== undefined) section.aiAssisted = updates.aiAssisted;

    if (updates.evidencePaperIds !== undefined) {
      const validPaperIds = updates.evidencePaperIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      section.evidencePaperIds = validPaperIds;
    }

    if (updates.evidenceNoteIds !== undefined) {
      const validNoteIds = updates.evidenceNoteIds
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      section.evidenceNoteIds = validNoteIds;
    }

    await section.save();

    // Touch manuscript's updatedAt
    await Manuscript.findByIdAndUpdate(section.manuscriptId, { updatedAt: new Date() });

    const populated = await ManuscriptSection.findById(section._id)
      .populate("evidencePaperIds", "title authors year venue doi abstract methodology datasets findings limitations")
      .populate("evidenceNoteIds", "title content noteType excerpt tags isPinned paperId")
      .lean();

    return populated;
  },

  /**
   * Delete a manuscript section and normalize remaining orders
   */
  deleteSection: async (
    sectionId: string,
    ownerId?: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!mongoose.isValidObjectId(sectionId)) {
      throw new Error("Invalid section ID format");
    }

    const section = await ManuscriptSection.findById(sectionId);
    if (!section) {
      throw new Error("Section not found");
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      const requesterOid = new mongoose.Types.ObjectId(ownerId);
      const isOwner = section.ownerId && section.ownerId.equals(requesterOid);
      let isCoAuthor = false;

      const manuscript = await Manuscript.findById(section.manuscriptId).lean();
      if (manuscript && manuscript.projectId) {
        const project = await ResearchProject.findById(manuscript.projectId).lean();
        const collab = project?.collaborators?.find((c) => c.researcherId.equals(requesterOid));
        if (collab && collab.role === "co_author") {
          isCoAuthor = true;
        }
      }

      if (!isOwner && !isCoAuthor) {
        throw new Error("Unauthorized: You do not have permission to delete this section");
      }
    }

    const manuscriptId = section.manuscriptId;
    await ManuscriptSection.findByIdAndDelete(sectionId);

    // Remove from manuscript.sectionIds
    await Manuscript.findByIdAndUpdate(manuscriptId, {
      $pull: { sectionIds: section._id },
      updatedAt: new Date(),
    });

    // Normalize remaining sections order
    const remaining = await ManuscriptSection.find({ manuscriptId }).sort({ order: 1 });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        remaining[i].order = i;
        await remaining[i].save();
      }
    }

    return {
      success: true,
      message: "Section deleted and sequence updated successfully",
    };
  },

  /**
   * Reorder all sections of a manuscript in a single operation
   */
  reorderSections: async (
    manuscriptId: string,
    sectionOrders: Array<{ sectionId: string; order: number }>,
    ownerId?: string
  ): Promise<any[]> => {
    if (!mongoose.isValidObjectId(manuscriptId)) {
      throw new Error("Invalid manuscript ID format");
    }

    const manuscript = await Manuscript.findById(manuscriptId);
    if (!manuscript) {
      throw new Error("Manuscript not found");
    }

    if (ownerId && mongoose.isValidObjectId(ownerId)) {
      if (manuscript.ownerId && !manuscript.ownerId.equals(new mongoose.Types.ObjectId(ownerId))) {
        throw new Error("Unauthorized: You do not have permission to reorder sections in this manuscript");
      }
    }

    // Update each section's order
    await Promise.all(
      sectionOrders.map(async (item) => {
        if (mongoose.isValidObjectId(item.sectionId)) {
          await ManuscriptSection.updateOne(
            { _id: new mongoose.Types.ObjectId(item.sectionId), manuscriptId: manuscript._id },
            { $set: { order: item.order } }
          );
        }
      })
    );

    await Manuscript.findByIdAndUpdate(manuscript._id, { updatedAt: new Date() });

    return ManuscriptSection.find({ manuscriptId: manuscript._id })
      .populate("evidencePaperIds", "title authors year venue doi")
      .populate("evidenceNoteIds", "title content noteType excerpt")
      .sort({ order: 1 })
      .lean();
  },
};
