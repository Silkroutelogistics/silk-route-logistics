import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Forgot Password | Shipper Portal — Silk Route Logistics" };

export default function ShipperForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      variant="shipper"
      headline="Reset your shipper password"
      subhead="We'll email you a link to choose a new one."
      backToLoginHref="/shipper/login"
    />
  );
}
