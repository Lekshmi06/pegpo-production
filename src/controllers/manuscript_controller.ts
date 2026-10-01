import { Request, Response } from "express";
import { manuscriptService } from "../services/manuscript_service";
import { researchAiService } from "../services/research_ai_service";

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

export const createManuscriptController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = resolveOwnerId(req);
    const manuscript = await manuscriptService.createManuscript(req.body, ownerId);

    res.status(201).json({
      success: true,
      message: "Research manuscript created successfully",
      data: manuscript,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to create manuscript",
    });
  }
};

export const listManuscriptsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const ownerId = resolveOwnerId(req);
    const projectId = req.query.projectId as string | undefined;

    const manuscripts = await manuscriptService.listManuscripts(ownerId, projectId);

    res.status(200).json({
      success: true,
      count: manuscripts.length,
      data: manuscripts,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve manuscripts",
    });
  }
};

export const getManuscriptByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const manuscript = await manuscriptService.getManuscriptById(id, ownerId);
    if (!manuscript) {
      res.status(404).json({
        success: false,
        message: "Manuscript not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: manuscript,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve manuscript",
    });
  }
};

export const updateManuscriptController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const updated = await manuscriptService.updateManuscript(id, req.body, ownerId);
    if (!updated) {
      res.status(404).json({
        success: false,
        message: "Manuscript not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Manuscript updated successfully",
      data: updated,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to update manuscript",
    });
  }
};

export const deleteManuscriptController = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const result = await manuscriptService.deleteManuscript(id, ownerId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to delete manuscript",
    });
  }
};

export const createSectionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const manuscriptId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const section = await manuscriptService.createSection(manuscriptId, req.body, ownerId);

    res.status(201).json({
      success: true,
      message: "Manuscript section added successfully",
      data: section,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to add section to manuscript",
    });
  }
};

export const getSectionsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const manuscriptId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const sections = await manuscriptService.getSections(manuscriptId, ownerId);

    res.status(200).json({
      success: true,
      count: sections.length,
      data: sections,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to retrieve manuscript sections",
    });
  }
};

export const updateSectionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const sectionId = Array.isArray(req.params.sectionId) ? req.params.sectionId[0] : (req.params.sectionId as string);
    const ownerId = resolveOwnerId(req);

    const updated = await manuscriptService.updateSection(sectionId, req.body, ownerId);
    if (!updated) {
      res.status(404).json({
        success: false,
        message: "Manuscript section not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Manuscript section updated successfully",
      data: updated,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to update manuscript section",
    });
  }
};

export const deleteSectionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const sectionId = Array.isArray(req.params.sectionId) ? req.params.sectionId[0] : (req.params.sectionId as string);
    const ownerId = resolveOwnerId(req);

    const result = await manuscriptService.deleteSection(sectionId, ownerId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to delete manuscript section",
    });
  }
};

export const reorderSectionsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const manuscriptId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);
    const { sectionOrders } = req.body;

    if (!Array.isArray(sectionOrders)) {
      res.status(400).json({
        success: false,
        message: "sectionOrders array is required",
      });
      return;
    }

    const reordered = await manuscriptService.reorderSections(manuscriptId, sectionOrders, ownerId);

    res.status(200).json({
      success: true,
      message: "Manuscript sections reordered successfully",
      data: reordered,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Failed to reorder sections",
    });
  }
};

export const manuscriptAiAssistController = async (req: Request, res: Response): Promise<void> => {
  try {
    const manuscriptId = Array.isArray(req.params.id) ? req.params.id[0] : (req.params.id as string);
    const ownerId = resolveOwnerId(req);

    const response = await researchAiService.assistManuscriptWriting({
      ...req.body,
      manuscriptId,
      researcherId: ownerId,
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error: any) {
    const statusCode = error?.message?.includes("Unauthorized") ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error?.message || "Manuscript AI assistance failed",
    });
  }
};
