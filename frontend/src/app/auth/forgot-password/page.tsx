import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = { title: "Forgot Password — Silk Route Logistics" };

export default function AuthForgotPasswordPage() {
  return (
    <ForgotPasswordForm
      variant="ae"
      headline="Reset your password"
      subhead="We'll email you a link to choose a new one."
      backToLoginHref="/auth/login"
    />
  );
}
