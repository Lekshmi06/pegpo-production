import { Request, Response } from "express";
import fs from "fs";

import {
  createSource,
  deleteSource,
  getSourceById,
  getSourceFilePath,
  getSourcesByStudent,
  getSourceContent,
  chatWithSourceService,
  triggerSourceAIActionService,
  saveSourceNotesService,
} from "../services/source_service";

export const getSourceContentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    const content = await getSourceContent(sourceId);

    res.status(200).json({
      success: true,
      data: content,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch source content";

    if (message === "Invalid source ID") {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    if (
      message === "Source not found" ||
      message === "Source content not found"
    ) {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const uploadSourceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentId = Array.isArray(req.params.studentId)
      ? req.params.studentId[0]
      : req.params.studentId;

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
      return;
    }

    const source = await createSource(studentId, req.file);

    res.status(201).json({
      success: true,
      message: "Source uploaded successfully",
      data: source,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to upload source";

    if (
      message === "Invalid student ID" ||
      message === "No file uploaded"
    ) {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    if (message === "Student not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getStudentSourcesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentId = Array.isArray(req.params.studentId)
      ? req.params.studentId[0]
      : req.params.studentId;

    const sources = await getSourcesByStudent(studentId);

    res.status(200).json({
      success: true,
      data: sources,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch sources";

    if (message === "Invalid student ID") {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    if (message === "Student not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getSourceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    const source = await getSourceById(sourceId);

    res.status(200).json({
      success: true,
      data: source,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch source";

    if (message === "Invalid source ID") {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    if (message === "Source not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const downloadSourceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    const { source, filePath } = await getSourceFilePath(sourceId);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({
        success: false,
        message: "Source file not found",
      });
      return;
    }

    res.download(filePath, source.originalName);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to retrieve source file";

    if (message === "Invalid source ID") {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    if (message === "Source not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const deleteSourceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    await deleteSource(sourceId);

    res.status(200).json({
      success: true,
      message: "Source deleted successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete source";

    if (message === "Invalid source ID") {
      res.status(400).json({
        success: false,
        message,
      });
      return;
    }

    if (message === "Source not found") {
      res.status(404).json({
        success: false,
        message,
      });
      return;
    }

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const chatWithSourceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    const { query, message, history } = req.body;
    const promptText = query || message;

    if (!promptText || typeof promptText !== "string" || !promptText.trim()) {
      res.status(400).json({
        success: false,
        message: "Question or message is required",
      });
      return;
    }

    const result = await chatWithSourceService(
      sourceId,
      promptText.trim(),
      history || []
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to chat with source";

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const generateSourceAIActionController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    const { action, options } = req.body;

    if (!action || typeof action !== "string") {
      res.status(400).json({
        success: false,
        message:
          "AI action name is required (e.g. quiz, flashcard, mindmap, summary, notes, chapter, analyse, timeline, audio, video)",
      });
      return;
    }

    const result = await triggerSourceAIActionService(
      sourceId,
      action,
      options
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to execute AI action";

    res.status(500).json({
      success: false,
      message,
    });
  }
};

export const saveSourceNotesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sourceId = Array.isArray(req.params.sourceId)
      ? req.params.sourceId[0]
      : req.params.sourceId;

    const { notes } = req.body;

    const result = await saveSourceNotesService(sourceId, notes || "");

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save source notes";

    res.status(500).json({
      success: false,
      message,
    });
  }
};