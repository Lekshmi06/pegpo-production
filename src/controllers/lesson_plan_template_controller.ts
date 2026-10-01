import { Request, Response } from "express";
import fs from "fs/promises";
import LessonPlanTemplate from "../models/LessonPlanTemplate";
import {
  analyzeTemplateImage,
  validateTemplateSchema,
} from "../services/template_analysis_service";

export const getLessonPlanTemplatesController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    // Retrieve active predefined templates + teacher's own custom templates
    const templates = await LessonPlanTemplate.find({
      isActive: true,
      $or: [{ type: "predefined" }, { type: "custom", createdBy: teacherProfile._id }],
    })
      .sort({ type: 1, createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch lesson plan templates";
    res.status(500).json({ success: false, message });
  }
};

export const analyzeTemplateController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({
      success: false,
      message: "Please upload a template image file (PNG, JPG, JPEG, or WEBP)",
    });
    return;
  }

  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const analysis = await analyzeTemplateImage(file.path, file.mimetype);

    res.status(200).json({
      success: true,
      message: "Template image analyzed successfully",
      data: analysis,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to reliably detect the lesson-plan structure from this image.";
    res.status(400).json({ success: false, message });
  } finally {
    // Ephemeral storage requirement: permanently remove temporary uploaded image after analysis
    if (file?.path) {
      await fs.unlink(file.path).catch(() => {});
    }
  }
};

export const createCustomTemplateController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const { name, description, schema } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ success: false, message: "Template name is required" });
      return;
    }

    if (!schema) {
      res.status(400).json({ success: false, message: "Template schema is required" });
      return;
    }

    const validatedSchema = validateTemplateSchema(schema);

    const template = await LessonPlanTemplate.create({
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : validatedSchema.description,
      type: "custom",
      extractedSchema: {
        templateName: validatedSchema.templateName || name.trim(),
        description: validatedSchema.description,
        sections: validatedSchema.sections,
      },
      createdBy: teacherProfile._id,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Custom template created successfully",
      data: template,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create custom template";
    res.status(400).json({ success: false, message });
  }
};

export const getLessonPlanTemplateByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher authentication required" });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const template = await LessonPlanTemplate.findById(id);

    if (!template || !template.isActive) {
      res.status(404).json({ success: false, message: "Lesson plan template not found" });
      return;
    }

    // Ownership check for custom templates
    if (
      template.type === "custom" &&
      template.createdBy?.toString() !== teacherProfile._id.toString()
    ) {
      res.status(403).json({
        success: false,
        message: "Unauthorized: you do not have access to this custom template",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch template";
    res.status(400).json({ success: false, message });
  }
};
