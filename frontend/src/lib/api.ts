import axios from "axios";
import { Sentry } from "@/lib/sentry";

const resolvedBaseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

// Warn loudly in production if falling back to localhost
if (typeof window !== "undefined" && resolvedBaseURL.includes("localhost") && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
  console.error("[SRL] CRITICAL: API URL is localhost but app is running on", window.location.hostname, "— set NEXT_PUBLIC_API_URL environment variable");
}

export const api = axios.create({
  baseURL: resolvedBaseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000, // 30s timeout — Render free tier cold starts can take ~15s
  withCredentials: true, // Send httpOnly cookies with every request
});

// Note: Auth tokens are managed via httpOnly cookies set by the backend.
// localStorage is no longer used for JWT storage (XSS protection).
// The Bearer header is only used for temporary tokens (TOTP, force-password-change).

api.interceptors.response.use(
  (response) => response,
  (error) => {
    Sentry.addBreadcrumb({
      category: "api",
      message: `${error.config?.method?.toUpperCase()} ${error.config?.url} → ${error.response?.status || "NETWORK_ERROR"}`,
      level: "error",
      data: {
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
      },
    });
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // Check if this is a session timeout
      const code = error.response?.data?.code;
      const isLoginPage = window.location.pathname.includes("/login") || window.location.pathname.includes("/auth/");
      if (!isLoginPage) {
        window.location.href = code === "SESSION_TIMEOUT" ? "/auth/login?reason=timeout" : "/auth/login";
      }
    }
    return Promise.reject(error);
  }
);
