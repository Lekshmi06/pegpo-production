import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import TeacherMaterial, {
  ITeacherMaterial,
  MaterialCategory,
  MaterialStatus,
} from "../models/TeacherMaterial";
import { ITeacherProfile } from "../models/TeacherProfile";
import { IStudentProfile } from "../models/StudentProfile";
import Source from "../models/source_model";
import SourceContent from "../models/source_content_model";
import { extractDocumentText } from "./document_extraction_service";
import { processDocumentWithGemini } from "./gemini_service";

export interface CreateMaterialInput {
  title: string;
  description?: string;
  category: MaterialCategory;
  subject: string;
  classLevel: string;
  classSectionId?: string;
  targetAudience?: "all" | "class_section";
  status?: MaterialStatus;
  allowStudentDownload?: boolean;
  allowAIChat?: boolean;
}

export interface TeacherMaterialFilter {
  status?: string;
  subject?: string;
  classLevel?: string;
  category?: string;
  search?: string;
}

export interface StudentMaterialFilter {
  subject?: string;
  category?: string;
  classLevel?: string;
  classSectionId?: string;
  search?: string;
}

export class TeacherMaterialService {
  /**
   * Upload and register a new teacher material / document
   */
  static async createMaterial(
    teacherProfile: ITeacherProfile,
    file: Express.Multer.File,
    data: CreateMaterialInput
  ): Promise<ITeacherMaterial> {
    const teacherId = teacherProfile._id as mongoose.Types.ObjectId;
    const teacherName = teacherProfile.name || "Teacher";

    // Build public static URL
    const relativeToUploads = path
      .relative(path.resolve("uploads"), file.path)
      .replace(/\\/g, "/");
    const fileUrl = `/uploads/${relativeToUploads}`;

    const isPublished = data.status === "published";

    const material = await TeacherMaterial.create({
      teacherId,
      teacherName,
      title: data.title.trim(),
      description: data.description?.trim() || "",
      category: data.category || "notes",
      subject: data.subject?.trim() || "General",
      classLevel: data.classLevel?.trim() || "All Classes",
      classSectionId:
        data.classSectionId && mongoose.Types.ObjectId.isValid(data.classSectionId)
          ? new mongoose.Types.ObjectId(data.classSectionId)
          : undefined,
      targetAudience: data.targetAudience || "all",

      originalName: file.originalname,
      storedName: file.filename,
      fileUrl,
      storagePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,

      status: isPublished ? "published" : "draft",
      publishedAt: isPublished ? new Date() : null,
      allowStudentDownload:
        data.allowStudentDownload !== undefined
          ? Boolean(data.allowStudentDownload)
          : true,
      allowAIChat:
        data.allowAIChat !== undefined ? Boolean(data.allowAIChat) : true,
      downloadsCount: 0,
    });

    return material;
  }

  /**
   * Get all materials uploaded by the teacher
   */
  static async getTeacherMaterials(
    teacherId: string | mongoose.Types.ObjectId,
    filter: TeacherMaterialFilter = {}
  ): Promise<ITeacherMaterial[]> {
    const query: Record<string, any> = { teacherId };

    if (filter.status && filter.status !== "all") {
      query.status = filter.status;
    }
    if (filter.subject && filter.subject !== "all") {
      query.subject = filter.subject;
    }
    if (filter.category && filter.category !== "all") {
      query.category = filter.category;
    }
    if (filter.classLevel && filter.classLevel !== "all") {
      query.classLevel = filter.classLevel;
    }
    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      query.$or = [
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { originalName: { $regex: term, $options: "i" } },
      ];
    }

    return TeacherMaterial.find(query)
      .populate("classSectionId", "name classLevel section board")
      .sort({ createdAt: -1 });
  }

  /**
   * Get single material by ID
   */
  static async getMaterialById(
    materialId: string,
    teacherId?: string | mongoose.Types.ObjectId
  ): Promise<ITeacherMaterial | null> {
    const query: Record<string, any> = { _id: materialId };
    if (teacherId) {
      query.teacherId = teacherId;
    }
    return TeacherMaterial.findOne(query).populate(
      "classSectionId",
      "name classLevel section board"
    );
  }

  /**
   * Update material details
   */
  static async updateMaterial(
    materialId: string,
    teacherId: string | mongoose.Types.ObjectId,
    updates: Partial<CreateMaterialInput>
  ): Promise<ITeacherMaterial | null> {
    const material = await TeacherMaterial.findOne({ _id: materialId, teacherId });
    if (!material) return null;

    if (updates.title) material.title = updates.title.trim();
    if (updates.description !== undefined)
      material.description = updates.description.trim();
    if (updates.category) material.category = updates.category;
    if (updates.subject) material.subject = updates.subject.trim();
    if (updates.classLevel) material.classLevel = updates.classLevel.trim();
    if (updates.targetAudience) material.targetAudience = updates.targetAudience;

    if (updates.classSectionId !== undefined) {
      material.classSectionId =
        updates.classSectionId &&
        mongoose.Types.ObjectId.isValid(updates.classSectionId)
          ? new mongoose.Types.ObjectId(updates.classSectionId)
          : undefined;
    }

    if (updates.allowStudentDownload !== undefined) {
      material.allowStudentDownload = Boolean(updates.allowStudentDownload);
    }
    if (updates.allowAIChat !== undefined) {
      material.allowAIChat = Boolean(updates.allowAIChat);
    }

    if (updates.status && updates.status !== material.status) {
      material.status = updates.status;
      material.publishedAt = updates.status === "published" ? new Date() : null;
    }

    await material.save();
    return material;
  }

  /**
   * Toggle or set publish status
   */
  static async setPublishStatus(
    materialId: string,
    teacherId: string | mongoose.Types.ObjectId,
    status?: MaterialStatus,
    targetAudience?: "all" | "class_section",
    classSectionId?: string
  ): Promise<ITeacherMaterial | null> {
    const material = await TeacherMaterial.findOne({ _id: materialId, teacherId });
    if (!material) return null;

    const nextStatus: MaterialStatus =
      status || (material.status === "published" ? "draft" : "published");

    material.status = nextStatus;
    material.publishedAt = nextStatus === "published" ? new Date() : null;

    if (targetAudience) {
      material.targetAudience = targetAudience;
    }
    if (classSectionId !== undefined) {
      material.classSectionId =
        classSectionId && mongoose.Types.ObjectId.isValid(classSectionId)
          ? new mongoose.Types.ObjectId(classSectionId)
          : undefined;
    }

    await material.save();
    return material;
  }

  /**
   * Delete teacher material and clean up storage
   */
  static async deleteMaterial(
    materialId: string,
    teacherId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    const material = await TeacherMaterial.findOne({ _id: materialId, teacherId });
    if (!material) return false;

    // Delete file from disk if it exists
    if (material.storagePath && fs.existsSync(material.storagePath)) {
      try {
        fs.unlinkSync(material.storagePath);
      } catch (err) {
        console.warn("Could not delete physical file:", err);
      }
    }

    await TeacherMaterial.deleteOne({ _id: material._id });
    return true;
  }

  /**
   * Get materials published for students
   */
  static async getPublishedMaterialsForStudents(
    filter: StudentMaterialFilter = {},
    studentProfile?: IStudentProfile | null
  ): Promise<ITeacherMaterial[]> {
    const query: Record<string, any> = { status: "published" };

    // If student belongs to a class section or level, match accordingly:
    const classConditions: any[] = [{ targetAudience: "all" }];

    if (studentProfile?.classSectionId) {
      classConditions.push({
        targetAudience: "class_section",
        classSectionId: studentProfile.classSectionId,
      });
    }

    if (filter.classSectionId && mongoose.Types.ObjectId.isValid(filter.classSectionId)) {
      classConditions.push({
        classSectionId: new mongoose.Types.ObjectId(filter.classSectionId),
      });
    }

    const studentClass =
      studentProfile?.schoolDetails?.classLevel ||
      studentProfile?.education?.classLevel;
    if (studentClass) {
      classConditions.push({ classLevel: studentClass });
      classConditions.push({ classLevel: "All Classes" });
    }

    if (classConditions.length > 0) {
      query.$or = classConditions;
    }

    if (filter.subject && filter.subject !== "all") {
      query.subject = filter.subject;
    }
    if (filter.category && filter.category !== "all") {
      query.category = filter.category;
    }
    if (filter.search && filter.search.trim()) {
      const term = filter.search.trim();
      const searchOr = [
        { title: { $regex: term, $options: "i" } },
        { description: { $regex: term, $options: "i" } },
        { subject: { $regex: term, $options: "i" } },
        { teacherName: { $regex: term, $options: "i" } },
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    return TeacherMaterial.find(query)
      .populate("classSectionId", "name classLevel section board")
      .sort({ publishedAt: -1, createdAt: -1 });
  }

  /**
   * Increment download counter
   */
  static async recordDownload(materialId: string): Promise<ITeacherMaterial | null> {
    return TeacherMaterial.findByIdAndUpdate(
      materialId,
      { $inc: { downloadsCount: 1 } },
      { returnDocument: "after" }
    );
  }

  /**
   * Clone / import a teacher's published document into a student's personal AI Source Studio
   */
  static async importToStudentSource(
    materialId: string,
    studentProfileId: string
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
      throw new Error("Invalid student ID");
    }

    const material = await TeacherMaterial.findById(materialId);
    if (!material || material.status !== "published") {
      throw new Error("Published material not found");
    }

    if (!material.storagePath || !fs.existsSync(material.storagePath)) {
      throw new Error("Underlying file is not accessible on server");
    }

    // Copy file to student upload directory
    const studentUploadDir = path.resolve("uploads", "sources", studentProfileId);
    fs.mkdirSync(studentUploadDir, { recursive: true });

    const ext = path.extname(material.originalName);
    const newStoredName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const destinationPath = path.join(studentUploadDir, newStoredName);

    fs.copyFileSync(material.storagePath, destinationPath);

    const relativeStorage = path
      .relative(process.cwd(), destinationPath)
      .replace(/\\/g, "/");

    // Create student source
    const source = await Source.create({
      studentId: new mongoose.Types.ObjectId(studentProfileId),
      originalName: material.originalName,
      storedName: newStoredName,
      type: "file",
      mimeType: material.mimeType,
      size: material.fileSize,
      storagePath: relativeStorage,
      status: "processing",
      aiReady: false,
      aiStatus: "processing",
    });

    // Run extraction & AI pipeline in background / async
    try {
      const extracted = await extractDocumentText(destinationPath, material.mimeType);
      const aiResult = await processDocumentWithGemini(extracted.text, material.originalName);

      await SourceContent.create({
        sourceId: source._id,
        text: extracted.text,
        aiSummary: aiResult.summary,
        aiChapters: aiResult.chapters,
        aiMindMap: aiResult.mindMap,
      });

      source.status = "ready";
      source.aiReady = true;
      source.aiStatus = "ready";
      source.aiOverview = {
        summary: aiResult.summary,
        difficulty: aiResult.difficulty,
        readingTimeMinutes: aiResult.readingTimeMinutes,
        wordCount: aiResult.wordCount,
        keyConcepts: aiResult.keyConcepts,
        suggestedQuestions: aiResult.suggestedQuestions,
      };
      await source.save();
    } catch (err) {
      console.warn("AI processing warning for imported teacher material:", err);
      source.status = "ready";
      source.aiReady = true;
      source.aiStatus = "ready";
      await source.save();
    }

    return source;
  }
}
