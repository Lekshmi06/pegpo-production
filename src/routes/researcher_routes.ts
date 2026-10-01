import { Router } from "express";
import {
  createResearcherController,
  getResearcherController,
  getResearcherByEmailController,
  getResearcherMeController,
  updateResearcherController,
  updateResearcherStepController,
  completeResearcherOnboardingController,
} from "../controllers/researcher_controller";

const router = Router();

router.post("/", createResearcherController);
router.get("/me", getResearcherMeController);
router.get("/by-email/:email", getResearcherByEmailController);
router.patch("/step", updateResearcherStepController);
router.put("/step", updateResearcherStepController);
router.post("/complete", completeResearcherOnboardingController);
router.get("/:id", getResearcherController);
router.put("/:id", updateResearcherController);

export default router;
