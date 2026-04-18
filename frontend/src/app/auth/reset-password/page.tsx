import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Reset Password — Silk Route Logistics" };

export default function AuthResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm variant="ae" headline="Set a new password" backToLoginHref="/auth/login" />
    </Suspense>
  );
}
