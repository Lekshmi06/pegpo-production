import { Request, Response } from "express";
import * as ssoService from "../services/sso_service";

/**
 * POST /api/sso/exchange
 * Exchanges a valid SSO Token for an authenticated Core session
 */
export async function handleSSOExchange(req: Request, res: Response): Promise<void> {
  try {
    const { ssoToken } = req.body;

    if (!ssoToken || typeof ssoToken !== "string") {
      res.status(400).json({
        success: false,
        message: "ssoToken string is required in request body",
        code: "MISSING_SSO_TOKEN",
      });
      return;
    }

    const result = await ssoService.exchangeSSOToken(ssoToken);

    res.status(200).json({
      success: true,
      message: `SSO authentication successful for ${result.sourceSystem} ${result.role}`,
      data: result,
    });
  } catch (error: any) {
    const statusCode = error instanceof ssoService.SSOAuthError ? error.statusCode : 500;
    const errorCode = error instanceof ssoService.SSOAuthError ? error.code : "INTERNAL_ERROR";

    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to exchange SSO token",
      code: errorCode,
    });
  }
}

/**
 * POST /api/sso/verify
 * Inspects and validates an SSO Token without consuming its JTI (dry-run check)
 */
export async function handleSSOVerify(req: Request, res: Response): Promise<void> {
  try {
    const { ssoToken } = req.body;

    if (!ssoToken || typeof ssoToken !== "string") {
      res.status(400).json({
        success: false,
        message: "ssoToken string is required in request body",
        code: "MISSING_SSO_TOKEN",
      });
      return;
    }

    const payload = ssoService.verifySSOToken(ssoToken, { checkReplay: false });

    res.status(200).json({
      success: true,
      message: "SSO token is valid",
      data: {
        payload,
        expiresIn: Math.max(0, payload.exp - Math.floor(Date.now() / 1000)),
      },
    });
  } catch (error: any) {
    const statusCode = error instanceof ssoService.SSOAuthError ? error.statusCode : 500;
    const errorCode = error instanceof ssoService.SSOAuthError ? error.code : "INTERNAL_ERROR";

    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to verify SSO token",
      code: errorCode,
    });
  }
}

/**
 * POST /api/sso/revoke
 * Revokes an SSO Token by its unique JTI
 */
export async function handleSSORevoke(req: Request, res: Response): Promise<void> {
  try {
    const { jti } = req.body;

    if (!jti || typeof jti !== "string") {
      res.status(400).json({
        success: false,
        message: "jti string is required",
        code: "MISSING_JTI",
      });
      return;
    }

    await ssoService.revokeSSOToken(jti);

    res.status(200).json({
      success: true,
      message: `Token JTI '${jti}' has been revoked successfully`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to revoke token",
    });
  }
}
