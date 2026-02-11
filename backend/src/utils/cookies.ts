import { Response } from "express";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Set a JWT token as an httpOnly, secure cookie.
 * Also returns the token in the JSON body for backward compatibility.
 *
 * NOTE: For cross-origin cookies to work in production, the API must be on a
 * subdomain of the same parent domain (e.g., api.silkroutelogistics.ai) and
 * the cookie domain set to ".silkroutelogistics.ai".
 */
export function setTokenCookie(res: Response, token: string, maxAgeMs?: number) {
  res.cookie("srl_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    maxAge: maxAgeMs || 7 * 24 * 60 * 60 * 1000, // 7 days default
    path: "/",
    ...(isProduction ? { domain: ".silkroutelogistics.ai" } : {}),
  });
}

/**
 * Clear the JWT cookie on logout.
 */
export function clearTokenCookie(res: Response) {
  res.clearCookie("srl_token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    ...(isProduction ? { domain: ".silkroutelogistics.ai" } : {}),
  });
}
