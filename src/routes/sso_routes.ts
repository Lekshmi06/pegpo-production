import { Router } from "express";
import * as ssoCtrl from "../controllers/sso_controller";

const router = Router();

// SSO Handshake & Exchange
router.post("/exchange", ssoCtrl.handleSSOExchange);
router.post("/verify", ssoCtrl.handleSSOVerify);
router.post("/revoke", ssoCtrl.handleSSORevoke);

export default router;
