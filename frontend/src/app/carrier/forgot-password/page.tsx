import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Forgot Password | Carrier Portal — Silk Route Logistics" };

export default function CarrierForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      headline="Reset your carrier password"
      subhead="We'll email you a link to choose a new one."
      backToLoginHref="/carrier/login"
    />
  );
}
