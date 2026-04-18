import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Reset Password | Carrier Portal — Silk Route Logistics" };

export default function CarrierResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm headline="Set a new carrier password" backToLoginHref="/carrier/login" />
    </Suspense>
  );
}
