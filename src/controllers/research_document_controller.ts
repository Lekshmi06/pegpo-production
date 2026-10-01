import { Request, Response } from "express";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import { ResearchDocument, ResearchDocType } from "../models/ResearchDocument";
import { ResearchFolder } from "../models/ResearchFolder";
import ResearchPaper from "../models/ResearchPaper";
import ResearchProject from "../models/ResearchProject";
import ResearcherProfile from "../models/ResearcherProfile";
import User from "../models/User";

const resolveResearcherId = async (req: Request): Promise<string | undefined> => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7).trim()
    : undefined;

  const rawCandidate =
    (req.headers["x-researcher-id"] as string) ||
    (req.headers["x-researcher-profile-id"] as string) ||
    (req.headers["x-user-id"] as string) ||
    bearerToken ||
    (req.headers["x-user-email"] as string) ||
    (req.query.researcherId as string) ||
    (req.query.userId as string) ||
    req.body?.researcherId ||
    req.body?.userId ||
    undefined;

  if (!rawCandidate || typeof rawCandidate !== "string") {
    const defaultProfile = await ResearcherProfile.findOne();
    return defaultProfile?._id?.toString();
  }

  const clean = rawCandidate.trim();
  if (!clean) return undefined;

  if (clean.includes("@")) {
    const user = await User.findOne({ email: clean.toLowerCase() });
    if (user) {
      let profile = await ResearcherProfile.findOne({ userId: user._id });
      if (!profile) {
        profile = await ResearcherProfile.create({
          userId: user._id,
          fullName: user.name || clean.split("@")[0],
          contact: { email: user.email },
          onboardingCompleted: false,
          onboardingStep: 1,
        });
      }
      return profile._id.toString();
    }
    const profile = await ResearcherProfile.findOne({ "contact.email": clean.toLowerCase() });
    if (profile) return profile._id.toString();
  }

  if (mongoose.Types.ObjectId.isValid(clean)) {
    const objId = new mongoose.Types.ObjectId(clean);

    const profile = await ResearcherProfile.findById(objId);
    if (profile) return profile._id.toString();

    const profileByUser = await ResearcherProfile.findOne({ userId: objId });
    if (profileByUser) return profileByUser._id.toString();

    const user = await User.findById(objId);
    if (user) {
      const newProfile = await ResearcherProfile.create({
        userId: user._id,
        fullName: user.name || user.email.split("@")[0],
        contact: { email: user.email },
        onboardingCompleted: false,
        onboardingStep: 1,
      });
      return newProfile._id.toString();
    }

    return clean;
  }

  return clean;
};

const inferDocType = (fileName: string, mimeType: string, requestedType?: string): ResearchDocType => {
  if (requestedType && ["paper", "dataset", "manuscript", "proposal", "slides", "notes", "other"].includes(requestedType)) {
    return requestedType as ResearchDocType;
  }

  const ext = path.extname(fileName).toLowerCase();
  if ([".csv", ".tsv", ".json", ".xlsx", ".xls"].includes(ext)) {
    return "dataset";
  }
  if ([".pptx", ".ppt"].includes(ext)) {
    return "slides";
  }
  if (ext === ".pdf") {
    return "paper";
  }
  if ([".docx", ".doc", ".md"].includes(ext)) {
    return "manuscript";
  }
  return "other";
};

export const uploadResearchDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({
        success: false,
        message: "No document file provided for upload",
      });
      return;
    }

    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required to upload documents",
      });
      return;
    }

    const {
      title,
      docType: requestedDocType,
      projectId,
      folderId,
      description,
      tags,
    } = req.body;

    const extension = path.extname(file.originalname).toLowerCase().replace(".", "");
    const docType = inferDocType(file.originalname, file.mimetype, requestedDocType);
    const parsedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const fileUrl = `/uploads/research/documents/${file.filename}`;

    // Validate folder exists and belongs to this researcher if specified
    let validFolderId: mongoose.Types.ObjectId | undefined = undefined;
    if (folderId && mongoose.Types.ObjectId.isValid(folderId)) {
      const folderExists = await ResearchFolder.findOne({
        _id: folderId,
        ownerId: new mongoose.Types.ObjectId(researcherId),
      });
      if (folderExists) {
        validFolderId = folderExists._id;
      }
    }

    // Validate project if specified
    let validProjectId: mongoose.Types.ObjectId | undefined = undefined;
    if (projectId && mongoose.Types.ObjectId.isValid(projectId)) {
      const projectExists = await ResearchProject.findById(projectId);
      if (projectExists) {
        validProjectId = projectExists._id;
      }
    }

    const cleanTitle = (title && typeof title === "string" && title.trim())
      ? title.trim()
      : path.basename(file.originalname, path.extname(file.originalname)).replace(/[-_]/g, " ");

    const document = await ResearchDocument.create({
      ownerId: new mongoose.Types.ObjectId(researcherId),
      projectId: validProjectId,
      folderId: validFolderId,
      title: cleanTitle,
      originalFileName: file.originalname,
      fileName: file.filename,
      fileSize: file.size,
      fileType: file.mimetype,
      fileExtension: extension,
      fileUrl,
      storagePath: file.path,
      docType,
      description: description?.trim() || "",
      tags: parsedTags,
    });

    // If it's a paper or PDF, optionally integrate into ResearchPaper library as well
    if (docType === "paper" || extension === "pdf") {
      try {
        const researchPaper = await ResearchPaper.create({
          title: cleanTitle,
          authors: ["Uploaded Document"],
          abstract: description?.trim() || `User uploaded academic document: ${file.originalname}`,
          year: new Date().getFullYear(),
          venue: "Uploaded Literature",
          sourceProvider: "upload",
          pdfUrl: fileUrl,
          localDocumentPath: file.path,
          tags: parsedTags,
          projectIds: validProjectId ? [validProjectId] : [],
          ownerId: new mongoose.Types.ObjectId(researcherId),
          isStarred: false,
          savedAt: new Date(),
        });

        document.paperId = researchPaper._id;
        await document.save();
      } catch (paperErr) {
        console.warn("Could not auto-register ResearchPaper duplicate:", paperErr);
      }
    }

    const populated = await ResearchDocument.findById(document._id)
      .populate("folderId", "name color category")
      .populate("projectId", "title domain currentStage")
      .lean();

    res.status(201).json({
      success: true,
      message: "Research document uploaded successfully",
      data: populated,
    });
  } catch (error: any) {
    console.error("uploadResearchDocumentController error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to process document upload",
    });
  }
};

export const getResearchDocumentsController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required to view documents",
      });
      return;
    }

    const { folderId, projectId, docType, search, isStarred } = req.query;
    const filter: Record<string, any> = {
      ownerId: new mongoose.Types.ObjectId(researcherId),
    };

    if (folderId) {
      if (folderId === "unorganized" || folderId === "null") {
        filter.folderId = { $exists: false };
      } else if (mongoose.Types.ObjectId.isValid(folderId as string)) {
        filter.folderId = new mongoose.Types.ObjectId(folderId as string);
      }
    }

    if (projectId && mongoose.Types.ObjectId.isValid(projectId as string)) {
      filter.projectId = new mongoose.Types.ObjectId(projectId as string);
    }

    if (docType && typeof docType === "string" && docType !== "all") {
      filter.docType = docType;
    }

    if (isStarred === "true") {
      filter.isStarred = true;
    }

    if (search && typeof search === "string" && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { originalFileName: { $regex: q, $options: "i" } },
        { tags: { $in: [new RegExp(q, "i")] } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const documents = await ResearchDocument.find(filter)
      .populate("folderId", "name color category")
      .populate("projectId", "title domain currentStage")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: documents,
    });
  } catch (error: any) {
    console.error("getResearchDocumentsController error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve research documents",
    });
  }
};

export const getResearchDocumentByIdController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required",
      });
      return;
    }

    const rawId = req.params.id;
    const docId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
      res.status(400).json({ success: false, message: "Invalid document ID" });
      return;
    }

    const document = await ResearchDocument.findOne({
      _id: docId,
      ownerId: new mongoose.Types.ObjectId(researcherId),
    })
      .populate("folderId", "name color category")
      .populate("projectId", "title domain currentStage")
      .lean();

    if (!document) {
      res.status(404).json({ success: false, message: "Document not found or unauthorized" });
      return;
    }

    res.status(200).json({
      success: true,
      data: document,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve document",
    });
  }
};

export const updateResearchDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required",
      });
      return;
    }

    const rawId = req.params.id;
    const docId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
      res.status(400).json({ success: false, message: "Invalid document ID" });
      return;
    }

    const { title, folderId, projectId, docType, description, tags, isStarred } = req.body;
    const updateData: Record<string, any> = {};

    if (title !== undefined) updateData.title = title.trim();
    if (docType !== undefined) updateData.docType = docType;
    if (description !== undefined) updateData.description = description.trim();
    if (isStarred !== undefined) updateData.isStarred = Boolean(isStarred);

    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags)
        ? tags
        : typeof tags === "string"
        ? tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
    }

    if (folderId !== undefined) {
      if (!folderId || folderId === "null" || folderId === "none") {
        updateData.$unset = { ...updateData.$unset, folderId: 1 };
      } else if (mongoose.Types.ObjectId.isValid(folderId)) {
        updateData.folderId = new mongoose.Types.ObjectId(folderId);
      }
    }

    if (projectId !== undefined) {
      if (!projectId || projectId === "null" || projectId === "none") {
        updateData.$unset = { ...updateData.$unset, projectId: 1 };
      } else if (mongoose.Types.ObjectId.isValid(projectId)) {
        updateData.projectId = new mongoose.Types.ObjectId(projectId);
      }
    }

    const updated = await ResearchDocument.findOneAndUpdate(
      {
        _id: docId,
        ownerId: new mongoose.Types.ObjectId(researcherId),
      },
      updateData,
      { returnDocument: "after", runValidators: true }
    )
      .populate("folderId", "name color category")
      .populate("projectId", "title domain currentStage")
      .lean();

    if (!updated) {
      res.status(404).json({ success: false, message: "Document not found or unauthorized" });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Document updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to update document",
    });
  }
};

export const deleteResearchDocumentController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required",
      });
      return;
    }

    const rawId = req.params.id;
    const docId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    if (!docId || !mongoose.Types.ObjectId.isValid(docId)) {
      res.status(400).json({ success: false, message: "Invalid document ID" });
      return;
    }

    const deleted = await ResearchDocument.findOneAndDelete({
      _id: docId,
      ownerId: new mongoose.Types.ObjectId(researcherId),
    });

    if (!deleted) {
      res.status(404).json({ success: false, message: "Document not found or unauthorized" });
      return;
    }

    // Try to remove local file from disk if present
    if (deleted.storagePath && fs.existsSync(deleted.storagePath)) {
      try {
        fs.unlinkSync(deleted.storagePath);
      } catch (unlinkErr) {
        console.warn("Could not delete file from disk:", unlinkErr);
      }
    }

    // Also remove paired ResearchPaper if registered
    if (deleted.paperId) {
      await ResearchPaper.findByIdAndDelete(deleted.paperId).catch(() => null);
    }

    res.status(200).json({
      success: true,
      message: "Research document deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to delete document",
    });
  }
};
