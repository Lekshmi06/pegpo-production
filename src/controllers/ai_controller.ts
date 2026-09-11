import { Request, Response } from "express";
import { processAIChatQuery } from "../services/ai_assistant_service";

export const handleAIChatController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { message, contextTitle, studentName } = req.body || {};

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "A valid message string is required.",
      });
      return;
    }

    const result = await processAIChatQuery({
      message: message.trim(),
      studentProfile: req.studentProfile,
      user: req.user,
      contextTitle: typeof contextTitle === "string" ? contextTitle : undefined,
      studentName: typeof studentName === "string" ? studentName.trim() : undefined,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error handling AI chat request:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process AI chat query";
    res.status(500).json({
      success: false,
      message,
    });
  }
};
