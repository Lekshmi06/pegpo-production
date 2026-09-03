import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";

import Source from "../models/source_model";
import StudentProfile from "../models/StudentProfile";

import SourceContent from "../models/source_content_model";
import { extractDocumentText } from "./document_extraction_service";

interface UploadedFile {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
  path: string;
}

export const createSource = async (
  studentId: string,
  file: UploadedFile
) => {
  if (!mongoose.isValidObjectId(studentId)) {
    await removeUploadedFile(file.path);

    throw new Error("Invalid student ID");
  }

  const student = await StudentProfile.findById(studentId);

  if (!student) {
    await removeUploadedFile(file.path);

    throw new Error("Student not found");
  }

  const storagePath = path
    .relative(process.cwd(), file.path)
    .replace(/\\/g, "/");

  let source;

  try {
    source = await Source.create({
      studentId,
      originalName: file.originalname,
      storedName: file.filename,
      type: "file",
      mimeType: file.mimetype,
      size: file.size,
      storagePath,
      status: "processing",
    });

    const extractedDocument = await extractDocumentText(
      file.path,
      file.mimetype
    );

    await SourceContent.create({
      sourceId: source._id,
      text: extractedDocument.text,
    });

    source.status = "ready";
    await source.save();

    return source;
  } catch (error) {
    if (source) {
      source.status = "failed";
      await source.save();
    }

    throw error;
  }
};

export const getSourcesByStudent = async (studentId: string) => {
  if (!mongoose.isValidObjectId(studentId)) {
    throw new Error("Invalid student ID");
  }

  const student = await StudentProfile.exists({
    _id: studentId,
  });

  if (!student) {
    throw new Error("Student not found");
  }

  return Source.find({
    studentId,
  })
    .sort({ createdAt: -1 })
    .lean();
};

export const getSourceById = async (sourceId: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const source = await Source.findById(sourceId).lean();

  if (!source) {
    throw new Error("Source not found");
  }

  return source;
};

export const getSourceFilePath = async (sourceId: string) => {
  const source = await getSourceById(sourceId);

  const filePath = path.resolve(process.cwd(), source.storagePath);

  return {
    source,
    filePath,
  };
};

export const deleteSource = async (sourceId: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const source = await Source.findById(sourceId);

  if (!source) {
    throw new Error("Source not found");
  }

  const filePath = path.resolve(process.cwd(), source.storagePath);

  await SourceContent.findOneAndDelete({
    sourceId,
  });

  await Source.findByIdAndDelete(sourceId);

  try {
    await fs.unlink(filePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code !== "ENOENT") {
      console.error("Failed to delete source file:", error);
    }
  }

  return source;
};

const removeUploadedFile = async (filePath: string) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;

    if (fileError.code !== "ENOENT") {
      console.error("Failed to remove uploaded file:", error);
    }
  }
};

export const getSourceContent = async (sourceId: string) => {
  if (!mongoose.isValidObjectId(sourceId)) {
    throw new Error("Invalid source ID");
  }

  const source = await Source.findById(sourceId);

  if (!source) {
    throw new Error("Source not found");
  }

  const content = await SourceContent.findOne({
    sourceId,
  }).lean();

  if (!content) {
    throw new Error("Source content not found");
  }

  return content;
};
