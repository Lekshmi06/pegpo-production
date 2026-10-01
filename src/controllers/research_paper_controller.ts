import { Request, Response } from "express";
import { researchPaperService } from "../services/research_paper_service";
import { researchAiService } from "../services/research_ai_service";
import { researchNoteService } from "../services/research_note_service";


export const searchPapersController = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = (req.query.q as string) || (req.query.query as string) || "";
    const year = req.query.year ? parseInt(req.query.year as string, 10) : undefined;
    const fromYear = req.query.fromYear ? parseInt(req.query.fromYear as string, 10) : undefined;
    const venue = req.query.venue as string | undefined;
    const author = req.query.author as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

    const result = await researchPaperService.searchPapers(query, {
      year,
      fromYear,
      venue,
      author,
      limit,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to search academic literature",
    });
  }
};

export const savePaperController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = (req.headers["x-researcher-id"] as string) || req.body.ownerId;
    const paper = await researchPaperService.savePaper(req.body, ownerId);

    res.status(201).json({
      success: true,
      message: "Paper saved to research library successfully",
      data: paper,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to save paper to library",
    });
  }
};

export const getLibraryPapersController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = (req.headers["x-researcher-id"] as string) || (req.query.ownerId as string);
    const isStarred = req.query.isStarred !== undefined ? req.query.isStarred === "true" : undefined;
    const projectId = req.query.projectId as string | undefined;
    const search = req.query.search as string | undefined;

    const papers = await researchPaperService.getLibraryPapers(ownerId, {
      isStarred,
      projectId,
      search,
    });

    res.status(200).json({
      success: true,
      count: papers.length,
      data: papers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch library papers",
    });
  }
};

export const getPaperByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const paper = await researchPaperService.getPaperById(id);

    if (!paper) {
      res.status(404).json({
        success: false,
        message: "Research paper not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: paper,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to retrieve paper details",
    });
  }
};

export const toggleStarPaperController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const updated = await researchPaperService.toggleStarPaper(id);

    res.status(200).json({
      success: true,
      message: `Paper ${updated?.isStarred ? "starred" : "unstarred"} successfully`,
      data: updated,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to toggle star on paper",
    });
  }
};

export const uploadPaperPdfController = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        message: "No PDF file provided for upload",
      });
      return;
    }

    const ownerId = (req.headers["x-researcher-id"] as string) || req.body.ownerId;
    const title = req.body.title;
    const venue = req.body.venue;

    const paper = await researchPaperService.uploadPaperPdf(
      file,
      ownerId,
      { title, venue }
    );

    res.status(201).json({
      success: true,
      message: "Research PDF uploaded and extracted successfully",
      data: paper,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to process PDF upload",
    });
  }
};

export const addPaperToProjectController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const { projectId } = req.body;

    if (!projectId) {
      res.status(400).json({
        success: false,
        message: "projectId is required",
      });
      return;
    }

    const result = await researchPaperService.addPaperToProject(id, projectId);

    res.status(200).json({
      success: true,
      message: "Paper attached to research project successfully",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to attach paper to project",
    });
  }
};

/**
 * Helper to resolve researcher owner ID from request headers or auth context
 */
const resolveOwnerId = (req: Request): string | undefined => {
  return (
    (req.headers["x-researcher-id"] as string) ||
    (req.headers["x-researcher-profile-id"] as string) ||
    (req.headers["x-user-id"] as string) ||
    (req.query.ownerId as string) ||
    req.body?.ownerId ||
    undefined
  );
};

export const listProjectsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = resolveOwnerId(req);
    const projects = await researchPaperService.listProjects(ownerId);

    res.status(200).json({
      success: true,
      data: projects,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve projects",
    });
  }
};

export const getProjectByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const project = await researchPaperService.getProjectById(id, ownerId);

    if (!project) {
      res.status(404).json({
        success: false,
        message: "Research project not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: project,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve project details",
    });
  }
};

export const createProjectController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = resolveOwnerId(req);
    const project = await researchPaperService.createProject(req.body, ownerId);

    res.status(201).json({
      success: true,
      message: "Research project created successfully",
      data: project,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to create project",
    });
  }
};

export const removePaperFromProjectController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const paperId = Array.isArray(req.params.paperId) ? req.params.paperId[0] : (req.params.paperId as string);
    const ownerId = resolveOwnerId(req);

    const result = await researchPaperService.removePaperFromProject(paperId, id, ownerId);

    res.status(200).json({
      success: true,
      message: "Paper removed from project successfully",
      data: result,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to remove paper from project",
    });
  }
};

export const queryResearchAIController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = resolveOwnerId(req);
    const response = await researchAiService.queryResearchAI({
      ...req.body,
      researcherId: ownerId || req.body.researcherId,
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Research AI query execution failed",
    });
  }
};


export const getProjectNotesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const notes = await researchNoteService.getProjectNotes(projectId, ownerId);

    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve project notes",
    });
  }
};

export const createProjectNoteController = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const note = await researchNoteService.createNote(
      {
        ...req.body,
        projectId,
      },
      ownerId
    );

    res.status(201).json({
      success: true,
      message: "Research note created successfully",
      data: note,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to create research note",
    });
  }
};

export const updateProjectNoteController = async (req: Request, res: Response): Promise<void> => {
  try {
    const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : (req.params.noteId as string);
    const ownerId = resolveOwnerId(req);

    const updated = await researchNoteService.updateNote(noteId, req.body, ownerId);
    if (!updated) {
      res.status(404).json({
        success: false,
        message: "Research note not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Research note updated successfully",
      data: updated,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to update research note",
    });
  }
};

export const deleteProjectNoteController = async (req: Request, res: Response): Promise<void> => {
  try {
    const noteId = Array.isArray(req.params.noteId) ? req.params.noteId[0] : (req.params.noteId as string);
    const ownerId = resolveOwnerId(req);

    const result = await researchNoteService.deleteNote(noteId, ownerId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to delete research note",
    });
  }
};

export const comparePapersController = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paperIds, projectId } = req.body;
    const ownerId = resolveOwnerId(req);
    const result = await researchPaperService.comparePapers(paperIds, projectId, ownerId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error?.message || "Failed to generate comparative paper matrix",
    });
  }
};

export const getAllNotesController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = resolveOwnerId(req);
    const filters = {
      projectId: req.query.projectId as string | undefined,
      noteType: req.query.noteType as string | undefined,
      search: req.query.search as string | undefined,
    };

    if (ownerId) {
      const notes = await researchNoteService.getAllResearcherNotes(ownerId, filters);
      res.status(200).json({
        success: true,
        data: notes,
      });
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const notes = await researchNoteService.getAllNotes(undefined, limit);

    res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve research notes",
    });
  }
};



