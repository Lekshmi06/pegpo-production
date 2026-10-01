import { Request, Response } from "express";
import { TeacherMaterialService } from "../services/teacher_material_service";

/**
 * Teacher uploads new material / document / slides
 */
export const createTeacherMaterialController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Teacher profile required. Please log in as a teacher.",
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: "No file was uploaded. Please attach a document or slides.",
      });
      return;
    }

    const {
      title,
      description,
      category,
      subject,
      classLevel,
      classSectionId,
      targetAudience,
      status,
      allowStudentDownload,
      allowAIChat,
    } = req.body;

    if (!title || !title.trim()) {
      res.status(400).json({
        success: false,
        message: "Material title is required.",
      });
      return;
    }

    const material = await TeacherMaterialService.createMaterial(
      teacherProfile,
      req.file,
      {
        title,
        description,
        category,
        subject,
        classLevel,
        classSectionId,
        targetAudience,
        status,
        allowStudentDownload:
          allowStudentDownload === "true" || allowStudentDownload === true,
        allowAIChat: allowAIChat === "true" || allowAIChat === true,
      }
    );

    res.status(201).json({
      success: true,
      message:
        material.status === "published"
          ? "Material uploaded and published to students successfully!"
          : "Material uploaded and saved as draft.",
      data: material,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload material";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Get all materials for the authenticated teacher
 */
export const getTeacherMaterialsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({
        success: false,
        message: "Teacher profile required.",
      });
      return;
    }

    const { status, subject, classLevel, category, search } = req.query;

    const materials = await TeacherMaterialService.getTeacherMaterials(
      teacherProfile._id,
      {
        status: status as string,
        subject: subject as string,
        classLevel: classLevel as string,
        category: category as string,
        search: search as string,
      }
    );

    res.status(200).json({
      success: true,
      data: materials,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retrieve materials";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Get single material
 */
export const getTeacherMaterialByIdController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const materialId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const material = await TeacherMaterialService.getMaterialById(materialId);

    if (!material) {
      res.status(404).json({ success: false, message: "Material not found" });
      return;
    }

    res.status(200).json({ success: true, data: material });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch material";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Update material metadata & permissions
 */
export const updateTeacherMaterialController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher profile required" });
      return;
    }

    const materialId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await TeacherMaterialService.updateMaterial(
      materialId,
      teacherProfile._id,
      req.body
    );

    if (!updated) {
      res.status(404).json({ success: false, message: "Material not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Material updated successfully",
      data: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update material";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Toggle or explicitly set material publish status
 */
export const publishTeacherMaterialController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher profile required" });
      return;
    }

    const materialId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, targetAudience, classSectionId } = req.body;

    const updated = await TeacherMaterialService.setPublishStatus(
      materialId,
      teacherProfile._id,
      status,
      targetAudience,
      classSectionId
    );

    if (!updated) {
      res.status(404).json({ success: false, message: "Material not found" });
      return;
    }

    const isPublished = updated.status === "published";
    res.status(200).json({
      success: true,
      message: isPublished
        ? `"${updated.title}" has been published to students!`
        : `"${updated.title}" is now saved as draft (hidden from students).`,
      data: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to change publish status";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Delete material
 */
export const deleteTeacherMaterialController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const teacherProfile = req.teacherProfile;
    if (!teacherProfile) {
      res.status(401).json({ success: false, message: "Teacher profile required" });
      return;
    }

    const materialId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = await TeacherMaterialService.deleteMaterial(
      materialId,
      teacherProfile._id
    );

    if (!deleted) {
      res.status(404).json({ success: false, message: "Material not found" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Material deleted successfully",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete material";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Student endpoint: get all published teacher materials
 */
export const getStudentPublishedMaterialsController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentProfile = req.studentProfile;
    const { subject, category, classLevel, classSectionId, search } = req.query;

    const materials = await TeacherMaterialService.getPublishedMaterialsForStudents(
      {
        subject: subject as string,
        category: category as string,
        classLevel: classLevel as string,
        classSectionId: classSectionId as string,
        search: search as string,
      },
      studentProfile
    );

    res.status(200).json({
      success: true,
      data: materials,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to retrieve student materials";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Record download count
 */
export const recordMaterialDownloadController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const materialId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updated = await TeacherMaterialService.recordDownload(materialId);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record download";
    res.status(500).json({ success: false, message });
  }
};

/**
 * Student imports a published teacher document into their personal AI Source Studio
 */
export const importToStudentSourceController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const studentProfile = req.studentProfile;
    const targetStudentId =
      studentProfile?._id?.toString() ||
      (req.headers["x-student-profile-id"] as string) ||
      (req.body.studentProfileId as string);

    if (!targetStudentId) {
      res.status(401).json({
        success: false,
        message: "Student profile required to import material into AI studio",
      });
      return;
    }

    const materialId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const source = await TeacherMaterialService.importToStudentSource(
      materialId,
      targetStudentId
    );

    res.status(201).json({
      success: true,
      message: "Material imported into your AI Study Studio successfully!",
      data: source,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import material";
    res.status(500).json({ success: false, message });
  }
};
