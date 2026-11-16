import { Request, Response } from "express";
import * as marketplaceService from "../services/tuition_marketplace_service";

/**
 * DEPRECATED: Public tutor search has been decommissioned.
 * Returns clean deprecation response guiding users to the centralized tuition request flow.
 */
export const searchProviders = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      deprecated: true,
      count: 0,
      providers: [],
      message:
        "The open tutor marketplace has been decommissioned. EduPye operates as a centralized 1:1 tuition provider. Please submit a tuition request through the student portal.",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DEPRECATED: Public offerings search has been decommissioned.
 */
export const searchOfferings = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      deprecated: true,
      count: 0,
      offerings: [],
      message:
        "The public tuition marketplace has been decommissioned. EduPye centrally governs curricula and allocates 1:1 teachers. Please use the tuition request workflow.",
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getOfferingPublicDetails = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const details = await marketplaceService.getPublicOfferingDetails(id);
    res.status(200).json({ success: true, ...details });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
};

export const getProviderPublicProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const details = await marketplaceService.getPublicTuitionProviderDetails(id);
    res.status(200).json({ success: true, ...details });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
};
