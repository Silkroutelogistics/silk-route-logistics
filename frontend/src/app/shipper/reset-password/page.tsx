import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = { title: "Reset Password | Shipper Portal — Silk Route Logistics" };

export default function ShipperResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm headline="Set a new shipper password" backToLoginHref="/shipper/login" />
    </Suspense>
  );
}
