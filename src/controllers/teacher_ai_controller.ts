import { Request, Response } from "express";
import { processTeacherAIChatQuery } from "../services/teacher_ai_assistant_service";

export const handleTeacherAIChatController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { message, pageContext, history } = req.body || {};

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "A valid query message string is required.",
      });
      return;
    }

    const result = await processTeacherAIChatQuery({
      message: message.trim(),
      pageContext: typeof pageContext === "object" ? pageContext : undefined,
      teacherProfile: req.teacherProfile,
      history: Array.isArray(history) ? history : undefined,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in Teacher AI Chat controller:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process teacher AI query";
    res.status(500).json({
      success: false,
      message,
    });
  }
};
