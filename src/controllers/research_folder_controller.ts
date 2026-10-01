import { Request, Response } from "express";
import mongoose from "mongoose";
import { ResearchFolder } from "../models/ResearchFolder";
import { ResearchDocument } from "../models/ResearchDocument";
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
    // Fallback: check first researcher profile in dev
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

export const getResearchFoldersController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required to access folders",
      });
      return;
    }

    const { projectId, search } = req.query;
    const filter: Record<string, any> = {
      ownerId: new mongoose.Types.ObjectId(researcherId),
    };

    if (projectId && mongoose.Types.ObjectId.isValid(projectId as string)) {
      filter.projectId = new mongoose.Types.ObjectId(projectId as string);
    }

    if (search && typeof search === "string" && search.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }

    const folders = await ResearchFolder.find(filter)
      .populate("projectId", "title domain currentStage")
      .sort({ createdAt: -1 })
      .lean();

    // Attach document count to each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder) => {
        const docCount = await ResearchDocument.countDocuments({
          ownerId: new mongoose.Types.ObjectId(researcherId),
          folderId: folder._id,
        });
        return {
          ...folder,
          documentCount: docCount,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: foldersWithCounts,
    });
  } catch (error: any) {
    console.error("getResearchFoldersController error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to retrieve research folders",
    });
  }
};

export const createResearchFolderController = async (req: Request, res: Response): Promise<void> => {
  try {
    const researcherId = await resolveResearcherId(req);
    if (!researcherId) {
      res.status(401).json({
        success: false,
        message: "Researcher identity required to create folders",
      });
      return;
    }

    const { name, description, color, category, projectId, isFavorite } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: "Folder name is required",
      });
      return;
    }

    const newFolder = await ResearchFolder.create({
      ownerId: new mongoose.Types.ObjectId(researcherId),
      name: name.trim(),
      description: description?.trim() || "",
      color: color || "#1c75bc",
      category: category || "general",
      projectId: projectId && mongoose.Types.ObjectId.isValid(projectId) ? new mongoose.Types.ObjectId(projectId) : undefined,
      isFavorite: Boolean(isFavorite),
    });

    const populated = await ResearchFolder.findById(newFolder._id)
      .populate("projectId", "title domain currentStage")
      .lean();

    res.status(201).json({
      success: true,
      message: "Research folder created successfully",
      data: {
        ...populated,
        documentCount: 0,
      },
    });
  } catch (error: any) {
    console.error("createResearchFolderController error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to create research folder",
    });
  }
};

export const getResearchFolderByIdController = async (req: Request, res: Response): Promise<void> => {
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
    const folderId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      res.status(400).json({ success: false, message: "Invalid folder ID" });
      return;
    }

    const folder = await ResearchFolder.findOne({
      _id: folderId,
      ownerId: new mongoose.Types.ObjectId(researcherId),
    })
      .populate("projectId", "title domain currentStage")
      .lean();

    if (!folder) {
      res.status(404).json({ success: false, message: "Folder not found or unauthorized" });
      return;
    }

    const docCount = await ResearchDocument.countDocuments({
      ownerId: new mongoose.Types.ObjectId(researcherId),
      folderId: folder._id,
    });

    res.status(200).json({
      success: true,
      data: {
        ...folder,
        documentCount: docCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to get research folder",
    });
  }
};

export const updateResearchFolderController = async (req: Request, res: Response): Promise<void> => {
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
    const folderId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      res.status(400).json({ success: false, message: "Invalid folder ID" });
      return;
    }

    const { name, description, color, category, projectId, isFavorite } = req.body;
    const updateData: Record<string, any> = {};

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (color !== undefined) updateData.color = color;
    if (category !== undefined) updateData.category = category;
    if (isFavorite !== undefined) updateData.isFavorite = Boolean(isFavorite);
    if (projectId !== undefined) {
      updateData.projectId =
        projectId && mongoose.Types.ObjectId.isValid(projectId)
          ? new mongoose.Types.ObjectId(projectId)
          : null;
    }

    const updated = await ResearchFolder.findOneAndUpdate(
      {
        _id: folderId,
        ownerId: new mongoose.Types.ObjectId(researcherId),
      },
      updateData,
      { returnDocument: "after", runValidators: true }
    )
      .populate("projectId", "title domain currentStage")
      .lean();

    if (!updated) {
      res.status(404).json({ success: false, message: "Folder not found or unauthorized" });
      return;
    }

    const docCount = await ResearchDocument.countDocuments({
      ownerId: new mongoose.Types.ObjectId(researcherId),
      folderId: updated._id,
    });

    res.status(200).json({
      success: true,
      message: "Folder updated successfully",
      data: {
        ...updated,
        documentCount: docCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to update research folder",
    });
  }
};

export const deleteResearchFolderController = async (req: Request, res: Response): Promise<void> => {
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
    const folderId = Array.isArray(rawId) ? rawId[0] : (rawId as string);
    if (!folderId || !mongoose.Types.ObjectId.isValid(folderId)) {
      res.status(400).json({ success: false, message: "Invalid folder ID" });
      return;
    }

    const deleted = await ResearchFolder.findOneAndDelete({
      _id: folderId,
      ownerId: new mongoose.Types.ObjectId(researcherId),
    });

    if (!deleted) {
      res.status(404).json({ success: false, message: "Folder not found or unauthorized" });
      return;
    }

    // Unlink documents from deleted folder
    await ResearchDocument.updateMany(
      {
        folderId: new mongoose.Types.ObjectId(folderId),
        ownerId: new mongoose.Types.ObjectId(researcherId),
      },
      { $unset: { folderId: 1 } }
    );

    res.status(200).json({
      success: true,
      message: "Research folder deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to delete research folder",
    });
  }
};
