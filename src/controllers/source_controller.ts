import { Request, Response } from "express";
import fs from "fs";

import {
  createSource,
  deleteSource,
  getSourceById,
  getSourceFilePath,
  getSourcesByStudent,
  getSourceContent,
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