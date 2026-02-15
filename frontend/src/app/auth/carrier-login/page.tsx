"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import axios from "axios";
import { Logo } from "@/components/ui/Logo";
import { Package, MapPin, Award, Zap, Truck, Lock } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

const carrierFacts = [
  { cat: "CARRIER TIP", text: "Owner-operators who diversify across 3+ quality brokerages see 23% higher annual revenue.", src: "OOIDA Foundation Survey, 2024" },
  { cat: "CARRIER INSIGHT", text: "Carriers with 95%+ on-time delivery rates earn 12% more per mile through premium load access.", src: "DAT Solutions" },
  { cat: "CARAVAN REWARDS", text: "Carriers in the Caravan Partner Program earn priority loads and reduced Quick Pay fees.", src: "Silk Route Logistics" },
  { cat: "MONEY SAVER", text: "Proper tire inflation alone can improve fuel efficiency by up to 3.3%, saving over $2,000 per year.", src: "U.S. DOE / FMCSA" },
  { cat: "INDUSTRY FACT", text: "Owner-operators\u2019 average gross income is $220,000\u2013$350,000 per year before expenses.", src: "OOIDA / ATRI" },
  { cat: "COMPLIANCE TIP", text: "Pre-trip inspections take 15 minutes but prevent 30% of roadside violations. Protect your CSA score.", src: "FMCSA" },
  { cat: "TECH TIP", text: "Carriers using digital document upload have 50% fewer payment delays \u2014 upload PODs same day.", src: "TriumphPay" },
  { cat: "QUICK PAY", text: "Quick Pay improves cash flow by 25+ days. SRL offers Quick Pay at 1.5\u20133% depending on your CPP tier.", src: "Silk Route Logistics" },
  { cat: "MAINTENANCE", text: "Preventive maintenance reduces breakdowns by 25% and extends truck life by 3\u20135 years.", src: "TMC/ATA" },
  { cat: "EFFICIENCY", text: "Planning routes to avoid congestion saves the average carrier 8,000 miles and $12,000 in fuel per year.", src: "ATRI" },
  { cat: "PARTNERSHIP", text: "SRL pays carriers within terms, every time. No excuses, no delays. Your cash flow is our priority.", src: "Silk Route Logistics" },
  { cat: "DRIVER WELLNESS", text: "Taking a 15-minute walk at every fuel stop reduces back pain risk by 40% and boosts alertness.", src: "NIOSH" },
  { cat: "SAFETY FIRST", text: "Drowsy driving causes 13% of all large truck crashes. Rest when tired \u2014 no load is worth your life.", src: "FMCSA" },
  { cat: "MOTIVATION", text: "Every mile you drive is a mile closer to your goals. Keep moving.", src: "Silk Route Logistics" },
  { cat: "SILK ROAD HISTORY", text: "Ancient Silk Road merchants traveled in caravans of up to 1,000 camels \u2014 the original fleet operations.", src: "UNESCO / Britannica" },
  { cat: "SRL PROMISE", text: "At Silk Route, carriers aren\u2019t a number \u2014 you\u2019re a partner. Fair rates, fast pay, a voice that matters.", src: "Silk Route Logistics" },
  { cat: "SRL VALUES", text: "Zero double-brokering. Period. Your load stays your load, and your rate stays your rate.", src: "Silk Route Logistics" },
];

function getDailyFact() {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((today.getTime() - start.getTime()) / 86400000);
  return carrierFacts[dayOfYear % carrierFacts.length];
}

export default function CarrierLoginPage() {
  const { register, handleSubmit, formState: { errors }, setValue } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Must-change-password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  const fact = getDailyFact();

  useEffect(() => {
    setMounted(true);

    // Check for session expired param
    const params = new URLSearchParams(window.location.search);
    if (params.get("expired") === "1") setSessionExpired(true);

    // Auto-fill remembered email
    const savedEmail = localStorage.getItem("carrier_remembered_email");
    if (savedEmail) {
      setValue("email", savedEmail);
      setRememberMe(true);
    }

    // If already logged in, redirect
    const token = sessionStorage.getItem("carrier_token") || localStorage.getItem("carrier_token");
    if (token) window.location.href = "/carrier/dashboard.html";
  }, [setValue]);

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError(null);
    setSessionExpired(false);

    try {
      const res = await axios.post(`${API_URL}/carrier-auth/login`, {
        email: data.email,
        password: data.password,
      }, { timeout: 30000 });

      const result = res.data;

      // Store token
      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("carrier_token", result.token);
      storage.setItem("carrier_user", JSON.stringify(result.user));

      // Remember email
      if (rememberMe) {
        localStorage.setItem("carrier_remembered_email", data.email);
      } else {
        localStorage.removeItem("carrier_remembered_email");
      }

      if (result.mustChangePassword) {
        setTempToken(result.token);
        setShowPasswordModal(true);
        setIsLoading(false);
      } else {
        window.location.href = "/carrier/dashboard.html";
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } }; code?: string };
      let message = axiosErr?.response?.data?.error || "Login failed";
      if (axiosErr?.code === "ECONNABORTED") message = "Server is starting up — please try again in a few seconds.";
      if (axiosErr?.code === "ERR_NETWORK") message = "Cannot reach server. Please check your connection or try again shortly.";
      setError(message);
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setPasswordLoading(true);
    try {
      await axios.post(`${API_URL}/carrier-auth/force-change-password`, {
        newPassword,
      }, {
        headers: { Authorization: `Bearer ${tempToken}` },
        timeout: 30000,
      });
      window.location.href = "/carrier/dashboard.html";
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to change password";
      setPasswordError(message);
      setPasswordLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex bg-[#0f172a] overflow-hidden">
        {/* Left Panel — Carrier Branding */}
        <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0D1B2A] via-[#12263e] to-[#0f2035]" />
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-20 w-72 h-72 bg-[#C8963E]/20 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-32 right-16 w-96 h-96 bg-[#C8963E]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
          </div>

          <div className={`relative z-10 max-w-[520px] w-full px-[60px] transition-all duration-1000 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="mb-8">
              <Logo size="md" />
            </div>

            <p className="text-[13px] font-semibold tracking-[4px] uppercase text-[#C8963E] mb-1">
              SILK ROUTE LOGISTICS
            </p>
            <h2 className="text-[28px] font-bold text-white mb-1.5 -tracking-wide">
              Carrier Portal
            </h2>
            <p className="text-sm text-slate-500 mb-10">
              Your loads, payments, and rewards in one place
            </p>

            {/* Feature pills */}
            <div className="grid grid-cols-2 gap-2.5 mb-9">
              {[
                { icon: Package, label: "Available Loads", delay: "200ms" },
                { icon: MapPin, label: "Real-Time Tracking", delay: "400ms" },
                { icon: Award, label: "Caravan Rewards", delay: "600ms" },
                { icon: Zap, label: "Instant Pay", delay: "800ms" },
              ].map(({ icon: Icon, label, delay }) => (
                <div
                  key={label}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-[10px] bg-[#C8963E]/[0.04] border border-[#C8963E]/[0.08] hover:bg-[#C8963E]/[0.08] hover:border-[#C8963E]/[0.15] hover:-translate-y-px transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                  style={{ transitionDelay: delay }}
                >
                  <Icon className="w-4 h-4 text-[#C8963E] shrink-0" />
                  <span className="text-[12.5px] text-slate-400 font-medium tracking-wide">{label}</span>
                </div>
              ))}
            </div>

            <p className="text-[13.5px] text-slate-500 leading-7 mb-10 max-w-[440px]">
              Join our carrier network for priority loads, fast payment, and AI-powered dispatch from Kalamazoo, Michigan.
            </p>

            {/* Daily Insight */}
            <div className={`p-6 rounded-xl bg-gradient-to-br from-[#C8963E]/[0.05] to-[#C8963E]/[0.02] border-l-[3px] border-l-[#C8963E] transition-all duration-1000 delay-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
              <p className="text-[9.5px] font-semibold tracking-[2.5px] uppercase text-[#C8963E] mb-2.5">
                {fact.cat}
              </p>
              <p className="text-[14.5px] text-slate-300 leading-7 italic">
                &ldquo;{fact.text}&rdquo;
              </p>
              <p className="text-[11px] text-slate-600 mt-3">
                &mdash; {fact.src}
              </p>
            </div>

            {/* Silk Road decorative line */}
            <svg className="mt-10 opacity-[0.12]" width="100%" height="24" viewBox="0 0 500 24">
              <path d="M0,12 Q60,4 120,12 Q180,20 240,12 Q300,4 360,12 Q420,20 480,12 L500,12" stroke="#c8a951" strokeWidth="1.5" fill="none" strokeDasharray="8,6" />
              <circle cx="0" cy="12" r="2.5" fill="#c8a951" opacity="0.6" />
              <circle cx="250" cy="12" r="2" fill="#c8a951" opacity="0.4" />
              <circle cx="500" cy="12" r="2.5" fill="#c8a951" opacity="0.6" />
            </svg>

            <p className="text-[11px] text-slate-700 mt-4">
              &copy; 2026 Silk Route Logistics Inc. &bull; Kalamazoo, MI
            </p>
          </div>
        </div>

        {/* Right Panel — Login Form */}
        <div className="w-full lg:w-[45%] flex items-center justify-center px-6 py-12 bg-gradient-to-b from-[#101d2e] to-[#0c1825] lg:border-l lg:border-[#C8963E]/[0.06]">
          <div className={`w-full max-w-[380px] transition-all duration-700 delay-300 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}>
            {/* Mobile logo */}
            <div className="flex flex-col items-center mb-8 lg:hidden">
              <Logo size="lg" />
            </div>

            {/* Form header */}
            <div className="flex flex-col items-center mb-8">
              <div className="hidden lg:block mb-3.5">
                <img src="/logo.png" alt="Silk Route Logistics" className="h-12 rounded-[10px]" />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-5 h-5 text-[#C8963E]" />
                <h1 className="text-xl font-semibold text-[#C8963E]">Carrier Portal</h1>
              </div>
              <p className="text-[13px] text-slate-500 mt-1">Sign in to manage your loads &amp; payments</p>
            </div>

            {/* Session expired warning */}
            {sessionExpired && (
              <div className="mb-5 p-3 bg-yellow-500/[0.08] border border-yellow-500/20 text-yellow-400 rounded-lg text-[13px] text-center leading-relaxed">
                Session expired due to inactivity. Please sign in again.
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-5 p-3 bg-red-500/[0.08] border border-red-500/20 text-red-400 rounded-lg text-[13px] text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} autoComplete="on">
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  {...register("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="carrier@example.com"
                  className="w-full px-4 py-3 text-[14.5px] bg-[#162236] border border-[#243447] rounded-lg text-white placeholder-slate-600 focus:border-[#C8963E] focus:shadow-[0_0_0_3px_rgba(200,150,62,0.1)] focus:bg-[#1a2840] outline-none transition-all"
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div className="mb-1">
                <label className="block text-[11.5px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  {...register("password")}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 text-[14.5px] bg-[#162236] border border-[#243447] rounded-lg text-white placeholder-slate-600 focus:border-[#C8963E] focus:shadow-[0_0_0_3px_rgba(200,150,62,0.1)] focus:bg-[#1a2840] outline-none transition-all"
                />
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>

              <div className="flex items-center justify-between my-4">
                <label className="flex items-center gap-2 cursor-pointer text-[13px] text-slate-500">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-[15px] h-[15px] accent-[#C8963E] cursor-pointer"
                  />
                  Remember me
                </label>
                <Link href="/auth/forgot-password" className="text-[13px] text-[#C8963E] font-medium hover:opacity-80 transition">
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 text-[15px] font-semibold bg-gradient-to-br from-[#C8963E] to-[#b8963e] text-[#0D1B2A] rounded-lg hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(200,150,62,0.25)] active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none transition-all"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-[18px] h-[18px] border-2 border-[#0D1B2A]/30 border-t-[#0D1B2A] rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center my-5 gap-3">
              <div className="flex-1 h-px bg-[#1f3044]" />
              <span className="text-xs text-slate-600">or</span>
              <div className="flex-1 h-px bg-[#1f3044]" />
            </div>

            <Link
              href="/auth/login"
              className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-[#C8963E] border border-[#C8963E]/25 rounded-lg hover:bg-[#C8963E]/[0.05] hover:border-[#C8963E]/40 transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
              </svg>
              Employee Login
            </Link>

            <p className="text-[13px] text-slate-500 text-center mt-5">
              New to SRL?{" "}
              <Link href="/onboarding" className="text-[#C8963E] font-medium hover:underline">
                Register as a Carrier
              </Link>
            </p>

            <div className="flex items-center justify-center gap-1.5 mt-7 text-[11px] text-slate-700">
              <Lock className="w-3 h-3 opacity-40" />
              256-bit SSL encrypted &bull; SOC 2 compliant
            </div>
          </div>
        </div>
      </div>

      {/* Must-Change-Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000]">
          <div className="bg-[#1a2332] border border-white/10 rounded-2xl p-8 w-full max-w-[400px] mx-4">
            <h2 className="text-[#C8963E] text-lg font-semibold mb-2">Set New Password</h2>
            <p className="text-slate-400 text-[13px] mb-5">
              For security, please set a new password on first login.
            </p>

            <form onSubmit={handlePasswordChange}>
              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  className="w-full px-4 py-3 text-[14.5px] bg-[#162236] border border-[#243447] rounded-lg text-white placeholder-slate-600 focus:border-[#C8963E] focus:shadow-[0_0_0_3px_rgba(200,150,62,0.1)] outline-none transition-all"
                />
              </div>

              <div className="mb-4">
                <label className="block text-[11.5px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                  className="w-full px-4 py-3 text-[14.5px] bg-[#162236] border border-[#243447] rounded-lg text-white placeholder-slate-600 focus:border-[#C8963E] focus:shadow-[0_0_0_3px_rgba(200,150,62,0.1)] outline-none transition-all"
                />
              </div>

              {passwordError && (
                <p className="text-red-400 text-[13px] text-center mb-4">{passwordError}</p>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full py-3.5 text-[15px] font-semibold bg-gradient-to-br from-[#C8963E] to-[#b8963e] text-[#0D1B2A] rounded-lg hover:-translate-y-px hover:shadow-[0_4px_20px_rgba(200,150,62,0.25)] disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {passwordLoading ? "Setting password..." : "Set Password & Continue"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
