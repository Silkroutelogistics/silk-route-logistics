"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border p-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-6">
          <Logo size="lg" />
        </Link>
        <h1 className="text-2xl font-bold mb-2">Join Silk Route Logistics</h1>
        <p className="text-slate-500 text-sm mb-8">
          Choose how you&apos;d like to get started with our platform.
        </p>

        <div className="space-y-4">
          <Link href="/onboarding"
            className="block w-full px-6 py-4 bg-gold text-navy font-semibold rounded-xl hover:bg-gold-light transition text-left">
            <p className="text-lg font-bold">Carrier Registration</p>
            <p className="text-sm opacity-80 mt-1">Register your fleet and start hauling with us</p>
          </Link>

          <Link href="/auth/login"
            className="block w-full px-6 py-4 border-2 border-slate-200 rounded-xl hover:border-gold/30 transition text-left">
            <p className="text-lg font-bold text-slate-800">Employee Login</p>
            <p className="text-sm text-slate-500 mt-1">Internal staff — dispatch, operations, accounting</p>
          </Link>
        </div>

        <p className="text-sm text-slate-500 mt-8">
          Already registered?{" "}
          <Link href="/auth/login" className="text-gold font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
