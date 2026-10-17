"use client";

import React, { useState } from "react";
import Image from "next/image";
import { SeiyaLogo } from "@/components/icons/seiya-logo";
import { SolarIcon } from "@/components/icons/solar";
import { Button } from "@/components/ui/button";
import { useApp, UserRole } from "@/lib/store";
import { formatMoneyConverted } from "@/lib/utils";

export type AuthMode =
  | "login"
  | "register"
  | "choose-path"
  | "story-intro"
  | "questionnaire";

interface AuthViewProps {
  initialMode?: AuthMode;
  onSuccess?: (persona?: UserRole) => void;
  onClose?: () => void;
}

export function AuthView({
  initialMode = "login",
  onSuccess,
  onClose,
}: AuthViewProps) {
  const {
    partnerAName,
    partnerBName,
    setCurrentUser,
    reportingCurrency,
    locale,
  } = useApp();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states (Login & Register)
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Join Space Invite Code Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("SEIYA-7F3X");
  const [joinError, setJoinError] = useState("");

  // =========================================================================
  // QUESTIONNAIRE STATES (Figma 469-8665: 3 Pillars + Review)
  // =========================================================================
  const [questionnairePillar, setQuestionnairePillar] = useState<1 | 2 | 3 | 4>(1);

  // Pillar 1: Context & Story of Money
  const [moneyMeaning, setMoneyMeaning] = useState<
    "rasa_aman" | "kebebasan" | "pengakuan" | "membantu_orang_lain"
  >("rasa_aman");
  const [talkFrequency, setTalkFrequency] = useState<
    "weekly" | "monthly" | "as_needed" | "not_yet"
  >("weekly");
  const [talkDuration, setTalkDuration] = useState<
    "under_15" | "15_30" | "30_60"
  >("15_30");
  const [familyDiscussed, setFamilyDiscussed] = useState<"yes" | "partial" | "not_yet">("yes");

  // Pillar 2: Style & Purpose
  const [spendingHabit, setSpendingHabit] = useState<number>(3); // 1-5 scale
  const [commStyle, setCommStyle] = useState<"langsung" | "waktu_khusus" | "lewat_tulisan">("waktu_khusus");
  const [permaGoal, setPermaGoal] = useState<"pencapaian" | "emosi_positif" | "keasyikan" | "hubungan" | "makna">("pencapaian");

  // Pillar 3: Rules & Privacy
  const [walletChoice, setWalletChoice] = useState<"both" | "shared" | "personal">("both");
  const [splitRatio, setSplitRatio] = useState<{ dina: number; raka: number }>({ dina: 50, raka: 50 });
  const [threshold, setThreshold] = useState<number>(500);
  const [coolingOff, setCoolingOff] = useState<boolean>(true);

  // Pillar 4: Signatures
  const [partnerASigned, setPartnerASigned] = useState<boolean>(false);
  const [partnerBSigned, setPartnerBSigned] = useState<boolean>(false);
  const canActivate = partnerASigned && partnerBSigned;

  // Handle Login submission
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetPersona: UserRole =
      fullName.toLowerCase().includes(partnerBName.toLowerCase())
        ? "partner_b"
        : "partner_a";
    setCurrentUser(targetPersona);
    if (onSuccess) {
      onSuccess(targetPersona);
    }
  };

  // Handle Register submission -> proceed to Choose Your Path
  const handleRegister = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMode("choose-path");
  };

  // Handle Join Space with Code
  const handleJoinSpace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setJoinError("Please enter a valid invite code");
      return;
    }
    setCurrentUser("partner_b");
    setShowJoinModal(false);
    if (onSuccess) {
      onSuccess("partner_b");
    }
  };

  // Quick fill demo user
  const handleQuickFill = (name: string) => {
    setFullName(name);
    setPassword("seiya2026");
    setConfirmPassword("seiya2026");
  };

  // Finish Questionnaire and enter Dashboard
  const handleCompleteQuestionnaire = () => {
    setCurrentUser("partner_a");
    if (onSuccess) {
      onSuccess("partner_a");
    }
  };

  return (
    <div className="min-h-screen bg-[#FEFBF5] text-[#2a2b2f] flex flex-col justify-between selection:bg-[#B45529]/20 selection:text-[#B45529] relative overflow-x-hidden">
      {/* Bottom Floating Navigation Pill for Reviewing Any Screen */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#2a2b2f]/90 text-white backdrop-blur-md px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 text-xs font-mono border border-white/10 opacity-90 hover:opacity-100 transition-opacity">
        <span className="text-white/40 px-2 hidden md:inline">VIEW:</span>
        <button
          onClick={() => setMode("login")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "login"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Login
        </button>
        <button
          onClick={() => setMode("register")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "register"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Register
        </button>
        <button
          onClick={() => setMode("choose-path")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "choose-path"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Choose Path
        </button>
        <button
          onClick={() => setMode("story-intro")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "story-intro"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Story Intro
        </button>
        <button
          onClick={() => setMode("questionnaire")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "questionnaire"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Questionnaire
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-1 pl-2 border-l border-white/20 text-white/50 hover:text-white cursor-pointer"
            title="Exit Auth"
          >
            ✕
          </button>
        )}
      </div>

      {/* =========================================================================
          SCREEN 1 & 2: LOGIN & REGISTER (Figma: 464-8568 & 460-9883)
          ========================================================================= */}
      {(mode === "login" || mode === "register") && (
        <div className="flex-1 flex flex-col lg:flex-row min-h-screen">
          {/* Left Form Column */}
          <div className="w-full lg:w-1/2 flex flex-col justify-between px-6 sm:px-12 md:px-16 lg:px-20 py-8 lg:py-12 bg-white">
            {/* Logo */}
            <div className="flex items-center justify-between">
              <div
                onClick={() => onClose && onClose()}
                className="cursor-pointer"
              >
                <SeiyaLogo height={38} />
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SolarIcon name="close-circle" size={16} />
                  <span>Close</span>
                </button>
              )}
            </div>

            {/* Form Container */}
            <div className="max-w-[460px] w-full mx-auto my-auto py-8">
              <h1 className="font-serif text-[32px] sm:text-[38px] font-normal text-[#2a2b2f] tracking-tight leading-tight">
                {mode === "login"
                  ? "Login Into Your Account"
                  : "Create an Account"}
              </h1>

              {/* Fast fill helpers */}
              <div className="flex items-center gap-2 mt-3 mb-6">
                <span className="text-[11px] text-[#8c827a]">Quick demo:</span>
                <button
                  type="button"
                  onClick={() => handleQuickFill(partnerAName)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-[#f5eee1] text-[#78716c] hover:text-[#2a2b2f] hover:bg-[#eeddc8] transition-colors cursor-pointer font-medium"
                >
                  {partnerAName}
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill(partnerBName)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-[#f5eee1] text-[#78716c] hover:text-[#2a2b2f] hover:bg-[#eeddc8] transition-colors cursor-pointer font-medium"
                >
                  {partnerBName}
                </button>
              </div>

              <form
                onSubmit={mode === "login" ? handleLogin : handleRegister}
                className="space-y-5"
              >
                {/* Full Name Field */}
                <div className="space-y-2">
                  <label className="block text-sm font-serif text-[#423f3b]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-4 py-3.5 rounded-xl border border-[#ded7ce] bg-white text-sm text-[#2a2b2f] placeholder-[#a69e96] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A] transition-all"
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <label className="block text-sm font-serif text-[#423f3b]">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create your password"
                      className="w-full pl-4 pr-12 py-3.5 rounded-xl border border-[#ded7ce] bg-white text-sm text-[#2a2b2f] placeholder-[#a69e96] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9a9187] hover:text-[#2a2b2f] transition-colors p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password (Register mode only) */}
                {mode === "register" && (
                  <div className="space-y-2">
                    <label className="block text-sm font-serif text-[#423f3b]">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm your password"
                        className="w-full pl-4 pr-12 py-3.5 rounded-xl border border-[#ded7ce] bg-white text-sm text-[#2a2b2f] placeholder-[#a69e96] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9a9187] hover:text-[#2a2b2f] transition-colors p-1"
                        aria-label={
                          showConfirmPassword
                            ? "Hide confirm password"
                            : "Show confirm password"
                        }
                      >
                        {showConfirmPassword ? (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.75}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.75}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.75}
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-4 px-6 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif font-normal text-base sm:text-lg transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-[0.99]"
                  >
                    {mode === "login" ? "Login" : "Create an account"}
                  </button>
                </div>

                {/* Switch between Login and Register */}
                <div className="text-center pt-2">
                  {mode === "login" ? (
                    <p className="text-sm text-[#78716c]">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("register")}
                        className="text-[#0088cc] hover:text-[#0070a8] font-medium hover:underline transition-colors cursor-pointer"
                      >
                        Register
                      </button>
                    </p>
                  ) : (
                    <p className="text-sm text-[#78716c]">
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => setMode("login")}
                        className="text-[#0088cc] hover:text-[#0070a8] font-medium hover:underline transition-colors cursor-pointer"
                      >
                        Login
                      </button>
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Bottom minimal note */}
            <div className="text-xs text-[#a69e96] text-center lg:text-left">
              © 2026 Seiya • AI Personal Finance for Couples
            </div>
          </div>

          {/* Right Mascot Illustration Column */}
          <div className="hidden lg:flex lg:w-1/2 bg-[#FEF9E9] relative items-center justify-center p-12 overflow-hidden border-l border-[#f2e7d7]">
            <div className="absolute inset-0 bg-radial from-white/60 via-transparent to-transparent pointer-events-none" />
            <div className="relative max-w-lg w-full flex flex-col items-center justify-center select-none">
              <div className="relative w-full aspect-[4/5] max-h-[640px] drop-shadow-sm">
                <Image
                  src="/images/auth/auth-mascot.png"
                  alt="Seiya Mascot on Laptop"
                  fill
                  priority
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 3: CHOOSE YOUR PATH (Figma: 466-8609)
          ========================================================================= */}
      {mode === "choose-path" && (
        <div className="min-h-screen bg-[#FEF9E9] flex flex-col justify-between">
          <header className="px-6 py-8 flex items-center justify-between max-w-6xl mx-auto w-full">
            <button
              onClick={() => setMode("register")}
              className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SolarIcon name="arrow-left" size={16} />
              <span>Back</span>
            </button>
            <div className="flex-1 flex justify-center -ml-12 sm:ml-0">
              <SeiyaLogo height={44} />
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span>Exit</span>
              </button>
            )}
          </header>

          <main className="max-w-5xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center w-full">
            <h1 className="text-center font-serif text-[34px] sm:text-[44px] font-normal text-[#2a2b2f] mb-8 sm:mb-12 tracking-tight">
              Choose Your Path
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto w-full">
              {/* Card 1: Create a Shared Space */}
              <div
                onClick={() => setMode("story-intro")}
                className="group relative bg-[#B4562A] hover:bg-[#a64e24] text-white rounded-[28px] p-7 sm:p-9 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1.5 overflow-hidden"
              >
                <div className="relative w-full aspect-square max-h-[290px] mx-auto flex items-center justify-center mb-6">
                  <Image
                    src="/images/auth/shared-space.png"
                    alt="Create a Shared Space"
                    fill
                    priority
                    className="object-contain transform group-hover:scale-105 transition-transform duration-300"
                  />
                </div>

                <div className="space-y-2 relative z-10">
                  <h3 className="font-serif text-[24px] sm:text-[26px] font-normal text-white">
                    Create a Shared Space
                  </h3>
                  <p className="text-white/85 text-xs sm:text-sm font-sans leading-relaxed">
                    The first user creates a shared financial space and obtains
                    an invitation code
                  </p>
                </div>
              </div>

              {/* Card 2: Join a Shared Space */}
              <div
                onClick={() => setShowJoinModal(true)}
                className="group relative bg-[#FDF8E7] hover:bg-[#fbf4de] text-[#2a2b2f] rounded-[28px] p-7 sm:p-9 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1.5 border border-[#eeddc8]/70 overflow-hidden"
              >
                <div className="relative w-full aspect-square max-h-[290px] mx-auto flex items-center justify-center mb-6">
                  <Image
                    src="/images/auth/join-space.png"
                    alt="Join a Shared Space"
                    fill
                    priority
                    className="object-contain transform group-hover:scale-105 transition-transform duration-300"
                  />
                </div>

                <div className="space-y-2 relative z-10">
                  <h3 className="font-serif text-[24px] sm:text-[26px] font-normal text-[#2a2b2f]">
                    Join a Shared Space
                  </h3>
                  <p className="text-[#686057] text-xs sm:text-sm font-sans leading-relaxed">
                    Enter your partner&apos;s invite code to join their shared
                    financial space
                  </p>
                </div>
              </div>
            </div>
          </main>

          <footer className="px-6 py-6 text-center text-xs text-[#8c827a]">
            Need help? Seiya keeps your financial journey collaborative & safe.
          </footer>
        </div>
      )}

      {/* =========================================================================
          SCREEN 4: ONBOARDING STORY INTRO (Figma: 470-8747)
          ========================================================================= */}
      {mode === "story-intro" && (
        <div className="min-h-screen bg-[#FEFBF5] flex flex-col justify-between">
          <header className="px-6 sm:px-12 py-5 border-b border-[#E6E6E6] bg-[#FEFBF5]/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMode("choose-path")}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="arrow-left" size={16} />
                <span className="hidden sm:inline">Choose Path</span>
              </button>
              <div className="h-4 w-px bg-[#eedecb]" />
              <SeiyaLogo height={36} />
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span>Exit</span>
              </button>
            )}
          </header>

          <main className="max-w-6xl mx-auto px-6 sm:px-12 py-10 sm:py-16 flex-1 flex items-center w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center w-full">
              <div className="lg:col-span-6 space-y-6 text-left">
                <h1 className="font-serif text-[40px] sm:text-[52px] lg:text-[58px] font-normal text-[#2a2b2f] leading-[1.12] tracking-tight">
                  Start with your story, <br className="hidden sm:inline" />
                  not with numbers
                </h1>

                <p className="text-base sm:text-lg text-[#5a534c] font-sans leading-relaxed max-w-lg">
                  Before Seiya helps you manage your finances together, Seiya
                  wants to understand how you communicate, make decisions, and
                  prioritize
                </p>

                <div className="pt-2">
                  <button
                    onClick={() => setMode("questionnaire")}
                    className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-medium text-sm transition-all shadow-sm hover:shadow-md cursor-pointer group active:scale-[0.99]"
                  >
                    <span className="font-serif text-base">Start</span>
                    <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                      <SolarIcon name="arrow-right" size={14} />
                    </span>
                  </button>
                </div>
              </div>

              <div className="lg:col-span-6 flex justify-center lg:justify-end">
                <div className="bg-white rounded-[24px] shadow-xl overflow-hidden border border-[#eedecb]/80 max-w-[440px] w-full">
                  <div className="relative w-full h-[165px] bg-[#f9eee0] overflow-hidden">
                    <Image
                      src="/images/auth/onboarding-banner.png"
                      alt="Seiya Onboarding Journey"
                      fill
                      priority
                      className="object-cover object-top"
                    />
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3.5 py-1">
                      <div className="w-7 h-7 rounded-full bg-[#B4562A] text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-xs">
                        1
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-serif text-sm font-normal text-[#2a2b2f]">
                          Context &amp; story of money
                        </h4>
                        <p className="text-xs text-[#78716c]">
                          Experiences that shape you
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-[#f1ebe3]" />

                    <div className="flex items-center gap-3.5 py-1">
                      <div className="w-7 h-7 rounded-full bg-[#B4562A] text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-xs">
                        2
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-serif text-sm font-normal text-[#2a2b2f]">
                          Style &amp; purpose
                        </h4>
                        <p className="text-xs text-[#78716c]">
                          How you see the future
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-[#f1ebe3]" />

                    <div className="flex items-center gap-3.5 py-1">
                      <div className="w-7 h-7 rounded-full bg-[#B4562A] text-white text-xs font-semibold flex items-center justify-center shrink-0 shadow-xs">
                        3
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-serif text-sm font-normal text-[#2a2b2f]">
                          Rules &amp; privacy
                        </h4>
                        <p className="text-xs text-[#78716c]">
                          Boundaries that make you comfortable
                        </p>
                      </div>
                    </div>

                    <div className="h-px bg-[#f1ebe3]" />

                    <p className="text-[11px] text-[#8c827a] leading-relaxed pt-1">
                      There are no right or wrong answers. You can also go back
                      and change your answers at any time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <footer className="px-6 py-6 text-center text-xs text-[#8c827a]">
            Step 1 of 5 • Guided Couple Agreement
          </footer>
        </div>
      )}

      {/* =========================================================================
          SCREEN 5: QUESTIONNAIRE (Figma: 469-8665 Canvas with 3 Pillars + Review)
          ========================================================================= */}
      {mode === "questionnaire" && (
        <div className="min-h-screen bg-[#FEFBF5] flex flex-col justify-between">
          {/* Header Layout strictly matching 469:8665 */}
          <header className="px-6 sm:px-12 py-5 border-b border-[#E6E6E6] bg-[#FEFBF5]/90 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between">
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                onClick={() => {
                  if (questionnairePillar > 1) {
                    setQuestionnairePillar((p) => (p - 1) as any);
                  } else {
                    setMode("story-intro");
                  }
                }}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="arrow-left" size={16} />
                <span className="hidden sm:inline">Back</span>
              </button>
              <div className="h-4 w-px bg-[#ded7ce]" />
              <SeiyaLogo height={38} />
            </div>

            {/* Pillar Step Indicators */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              {[
                { step: 1, label: "Context & Story" },
                { step: 2, label: "Style & Purpose" },
                { step: 3, label: "Rules & Privacy" },
                { step: 4, label: "Contract Review" },
              ].map((p) => (
                <button
                  key={p.step}
                  onClick={() => setQuestionnairePillar(p.step as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                    questionnairePillar === p.step
                      ? "bg-[#B4562A] text-white font-medium shadow-xs"
                      : questionnairePillar > p.step
                      ? "bg-[#2d5232]/10 text-[#2d5232] font-medium"
                      : "bg-[#f2e7d7]/60 text-[#8c827a] hover:bg-[#eeddc8]"
                  }`}
                >
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] bg-white/20">
                    {questionnairePillar > p.step ? "✓" : p.step}
                  </span>
                  <span className="hidden md:inline">{p.label}</span>
                </button>
              ))}
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span className="hidden sm:inline">Exit</span>
              </button>
            )}
          </header>

          {/* Main Questionnaire Container */}
          <main className="max-w-3xl mx-auto px-6 py-8 sm:py-12 flex-1 w-full">
            {/* PILLAR 1: Context & Story of Money */}
            {questionnairePillar === 1 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B4562A]/10 text-[#B4562A] text-xs font-semibold">
                    <span>Pillar 1 • Experiences that shape you</span>
                  </div>
                  <h2 className="font-serif text-[28px] sm:text-[34px] font-normal text-[#2a2b2f] tracking-tight">
                    Context &amp; Story of Money
                  </h2>
                  <p className="text-sm text-[#665e56] leading-relaxed">
                    Sebelum Seiya mengatur angka-angka, kami ingin memahami makna uang dan kebiasaan komunikasi yang paling mewakili Anda dalam hubungan.
                  </p>
                </div>

                {/* Question 1: Money Meaning */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    1. Apa makna uang yang paling utama bagi Anda?
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "rasa_aman",
                        icon: "shield-check",
                        title: "Rasa Aman (Security)",
                        desc: "Pos keuangan terlindungi, dana darurat siap, dan hati tenang untuk masa depan.",
                      },
                      {
                        id: "kebebasan",
                        icon: "sparkles",
                        title: "Kebebasan (Freedom)",
                        desc: "Memiliki ruang bernapas, fleksibilitas memilih gaya hidup, dan bebas berekspresi.",
                      },
                      {
                        id: "pengakuan",
                        icon: "cup",
                        title: "Apresiasi Hasil Kerja (Reward)",
                        desc: "Menikmati jerih payah bersama sebagai bukti kerja keras yang bermakna.",
                      },
                      {
                        id: "membantu_orang_lain",
                        icon: "heart",
                        title: "Membantu Sesama (Care)",
                        desc: "Kemampuan membahagiakan orang tua, keluarga besar, dan orang terdekat.",
                      },
                    ].map((opt) => (
                      <div
                        key={opt.id}
                        onClick={() => setMoneyMeaning(opt.id as any)}
                        className={`p-4 rounded-[16px] cursor-pointer transition-all border ${
                          moneyMeaning === opt.id
                            ? "bg-white border-[#B4562A] shadow-md ring-2 ring-[#B4562A]/10"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white hover:border-[#cbbfb0]"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[#B4562A]">
                              <SolarIcon name={opt.icon as any} size={18} />
                            </span>
                            <h4 className="font-serif text-sm font-normal text-[#2a2b2f]">
                              {opt.title}
                            </h4>
                          </div>
                          {moneyMeaning === opt.id && (
                            <span className="w-4 h-4 rounded-full bg-[#B4562A] text-white flex items-center justify-center text-[10px]">
                              ✓
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#665e56] leading-relaxed pl-6">
                          {opt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Question 2: Talk Frequency */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    2. Seberapa sering Anda dan pasangan membicarakan uang saat ini?
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: "weekly", label: "Setiap Minggu", desc: "Rutin sinkronisasi" },
                      { id: "monthly", label: "Bulanan", desc: "Saat gajian tiba" },
                      { id: "as_needed", label: "Hanya Saat Butuh", desc: "Ada tagihan besar" },
                      { id: "not_yet", label: "Belum Pernah Rutin", desc: "Baru mau mulai" },
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setTalkFrequency(item.id as any)}
                        className={`p-3.5 rounded-[14px] text-center cursor-pointer transition-all border ${
                          talkFrequency === item.id
                            ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                        }`}
                      >
                        <span className="block font-serif text-xs font-normal text-[#2a2b2f]">
                          {item.label}
                        </span>
                        <span className="block text-[10px] text-[#8c827a] mt-0.5">
                          {item.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Question 3: Talk Duration */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    3. Berapa lama waktu obrolan yang paling nyaman bagi Anda?
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "under_15", label: "< 15 Menit", desc: "Cepat, to-the-point" },
                      { id: "15_30", label: "15 - 30 Menit", desc: "Ideal & terarah" },
                      { id: "30_60", label: "30 - 60 Menit", desc: "Santai di akhir pekan" },
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setTalkDuration(item.id as any)}
                        className={`p-3.5 rounded-[14px] text-center cursor-pointer transition-all border ${
                          talkDuration === item.id
                            ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                        }`}
                      >
                        <span className="block font-serif text-xs font-normal text-[#2a2b2f]">
                          {item.label}
                        </span>
                        <span className="block text-[10px] text-[#8c827a] mt-0.5">
                          {item.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PILLAR 2: Style & Purpose */}
            {questionnairePillar === 2 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B4562A]/10 text-[#B4562A] text-xs font-semibold">
                    <span>Pillar 2 • How you see the future</span>
                  </div>
                  <h2 className="font-serif text-[28px] sm:text-[34px] font-normal text-[#2a2b2f] tracking-tight">
                    Style &amp; Purpose
                  </h2>
                  <p className="text-sm text-[#665e56] leading-relaxed">
                    Bagaimana kecenderungan Anda saat membelanjakan uang dan gaya interaksi finansial yang membuat Anda paling nyaman.
                  </p>
                </div>

                {/* Spending habit scale */}
                <div className="p-5 rounded-[20px] bg-white border border-[#ded7ce] space-y-4 shadow-xs">
                  <div>
                    <label className="block font-serif text-base text-[#2a2b2f]">
                      1. Saat ingin membeli barang impian (wishlist), apa reaksi Anda?
                    </label>
                    <p className="text-xs text-[#8c827a] mt-1">
                      Pilih dari skala 1 (sangat menahan diri / berpikir berkali-kali) hingga 5 (spontan &amp; langsung eksekusi).
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSpendingHabit(num)}
                        className={`w-12 h-12 rounded-full font-serif text-base transition-all cursor-pointer flex items-center justify-center ${
                          spendingHabit === num
                            ? "bg-[#B4562A] text-white font-bold shadow-md scale-110"
                            : "bg-[#f5eee1] text-[#2a2b2f] hover:bg-[#ebdcc9]"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between text-[11px] text-[#8c827a] px-1 font-sans">
                    <span>1: Sangat Menahan Diri</span>
                    <span>3: Seimbang</span>
                    <span>5: Spontan &amp; Cepat</span>
                  </div>
                </div>

                {/* Communication style */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    2. Gaya komunikasi yang paling nyaman bagi Anda berdua:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        id: "langsung",
                        title: "Langsung to-the-point",
                        desc: "Bahas langsung sekarang saat keputusan atau transaksi terjadi.",
                      },
                      {
                        id: "waktu_khusus",
                        title: "Waktu Khusus (Money Date)",
                        desc: "Simpan topik penting untuk dibahas santai di akhir pekan berdua.",
                      },
                      {
                        id: "lewat_tulisan",
                        title: "Ringkasan Tertulis Dulu",
                        desc: "Beri ringkasan dan opsi tertulis yang rapi sebelum berdiskusi.",
                      },
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setCommStyle(item.id as any)}
                        className={`p-4 rounded-[16px] cursor-pointer transition-all border ${
                          commStyle === item.id
                            ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                        }`}
                      >
                        <h4 className="font-serif text-sm font-normal text-[#2a2b2f] mb-1">
                          {item.title}
                        </h4>
                        <p className="text-xs text-[#665e56] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Perma Goal / Shared Life Priority */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    3. Fokus tujuan hidup bersama tahun ini:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        id: "pencapaian",
                        title: "Mencapai Target Besar",
                        desc: "Membeli rumah impian, dana darurat kokoh, dan investasi jangka panjang.",
                      },
                      {
                        id: "emosi_positif",
                        title: "Menikmati Hidup Bersama",
                        desc: "Merayakan momen kecil, liburan impian, dan kuliner tanpa rasa bersalah.",
                      },
                      {
                        id: "keasyikan",
                        title: "Minat & Pengembangan Diri",
                        desc: "Mendukung hobi, kursus baru, dan eksplorasi kegiatan seru berdua.",
                      },
                      {
                        id: "makna",
                        title: "Dukungan Keluarga Besar",
                        desc: "Membantu orang tua, keluarga, dan persiapan masa depan anak.",
                      },
                    ].map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setPermaGoal(item.id as any)}
                        className={`p-4 rounded-[16px] cursor-pointer transition-all border ${
                          permaGoal === item.id
                            ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                        }`}
                      >
                        <h4 className="font-serif text-sm font-normal text-[#2a2b2f] mb-1">
                          {item.title}
                        </h4>
                        <p className="text-xs text-[#665e56] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* PILLAR 3: Rules & Privacy */}
            {questionnairePillar === 3 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B4562A]/10 text-[#B4562A] text-xs font-semibold">
                    <span>Pillar 3 • Boundaries that make you comfortable</span>
                  </div>
                  <h2 className="font-serif text-[28px] sm:text-[34px] font-normal text-[#2a2b2f] tracking-tight">
                    Rules &amp; Privacy
                  </h2>
                  <p className="text-sm text-[#665e56] leading-relaxed">
                    Menetapkan kesepakatan rasio patungan, ambang batas persetujuan, dan perlindungan privasi yang adil.
                  </p>
                </div>

                {/* Wallet Structure */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    1. Struktur Dompet &amp; Privasi
                  </label>
                  <div className="space-y-2.5">
                    {[
                      {
                        id: "both",
                        title: "Shared + Personal Wallets (Rekomendasi)",
                        desc: "100% transparan untuk pengeluaran bersama, dan privasi terlindungi untuk dompet pribadi (hanya menampilkan total agregat).",
                      },
                      {
                        id: "shared",
                        title: "Shared Wallet Saja",
                        desc: "Semua pengeluaran dikelola dalam satu pool rekening bersama transparan.",
                      },
                      {
                        id: "personal",
                        title: "Personal Wallets dengan Pencatatan Split",
                        desc: "Semua akun tetap terpisah, dan pengeluaran bersama diselesaikan dengan split saat dibutuhkan.",
                      },
                    ].map((opt) => (
                      <div
                        key={opt.id}
                        onClick={() => setWalletChoice(opt.id as any)}
                        className={`p-4 rounded-[16px] cursor-pointer transition-all border ${
                          walletChoice === opt.id
                            ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-serif text-sm font-normal text-[#2a2b2f]">
                            {opt.title}
                          </h4>
                          {walletChoice === opt.id && (
                            <span className="w-4 h-4 rounded-full bg-[#B4562A] text-white flex items-center justify-center text-[10px]">
                              ✓
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#665e56] leading-relaxed">
                          {opt.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Split Ratio */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    2. Rasio Patungan Pengeluaran Bersama
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "50 : 50", dina: 50, raka: 50, desc: "Mitra Setara" },
                      { label: "60 : 40", dina: 60, raka: 40, desc: `${partnerBName} 60% : ${partnerAName} 40%` },
                      { label: "70 : 30", dina: 70, raka: 30, desc: "Proporsional" },
                    ].map((s) => (
                      <div
                        key={s.label}
                        onClick={() => setSplitRatio({ dina: s.dina, raka: s.raka })}
                        className={`p-3.5 rounded-[16px] text-center cursor-pointer transition-all border ${
                          splitRatio.dina === s.dina
                            ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                            : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                        }`}
                      >
                        <span className="font-serif text-sm font-normal text-[#2a2b2f] block">
                          {s.label}
                        </span>
                        <span className="text-[10px] text-[#8c827a] block mt-0.5">
                          {s.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Threshold */}
                <div className="space-y-3">
                  <label className="block font-serif text-base text-[#2a2b2f]">
                    3. Batas Persetujuan Pengeluaran Bersama (Dual-Key Gateway)
                  </label>
                  <div className="space-y-2">
                    {[250, 500, 1000].map((amt) => {
                      const displayConverted = formatMoneyConverted(amt, "USD", reportingCurrency, locale);
                      return (
                        <div
                          key={amt}
                          onClick={() => setThreshold(amt)}
                          className={`p-3.5 rounded-[16px] flex items-center justify-between cursor-pointer transition-all border ${
                            threshold === amt
                              ? "bg-white border-[#B4562A] shadow-sm ring-1 ring-[#B4562A]"
                              : "bg-[#fcf8f0] border-[#ded7ce] hover:bg-white"
                          }`}
                        >
                          <div>
                            <span className="font-serif text-sm font-normal text-[#2a2b2f] block">
                              {displayConverted}
                            </span>
                            <span className="text-[11px] text-[#8c827a]">
                              {amt === 500 ? "Ambang batas rekomendasi Seiya" : "Batas pengeluaran custom"}
                            </span>
                          </div>
                          {threshold === amt && (
                            <span className="w-4 h-4 rounded-full bg-[#B4562A] text-white flex items-center justify-center text-[10px]">
                              ✓
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cooling off */}
                <div className="p-4 rounded-[16px] bg-white border border-[#ded7ce] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[#B4562A]">
                        <SolarIcon name="clock-circle" size={18} />
                      </span>
                      <span className="font-serif text-sm text-[#2a2b2f]">
                        Late-Night 8h Cooling-Off Safeguard
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={coolingOff}
                      onChange={(e) => setCoolingOff(e.target.checked)}
                      className="w-4 h-4 accent-[#B4562A] cursor-pointer"
                    />
                  </div>
                  <p className="text-xs text-[#665e56] leading-relaxed pl-6">
                    Menahan pembelian impulsif bernilai tinggi antara jam 23:00 - 08:00 selama 8 jam tanpa menghakimi, memberi ruang jeda yang sehat sebelum konfirmasi ulang.
                  </p>
                </div>
              </div>
            )}

            {/* PILLAR 4: Review & Dual Signatures */}
            {questionnairePillar === 4 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2d5232]/10 text-[#2d5232] text-xs font-semibold">
                    <span>Activation • Plain-Language Contract Review</span>
                  </div>
                  <h2 className="font-serif text-[28px] sm:text-[34px] font-normal text-[#2a2b2f] tracking-tight">
                    Janji Seiya &amp; Tanda Tangan Bersama
                  </h2>
                  <p className="text-sm text-[#665e56] leading-relaxed">
                    Kontrak ini disusun dari cerita dan preferensi Anda. Kedua pasangan harus menandatangani agar kesepakatan aktif.
                  </p>
                </div>

                {/* Agreement Summary Card */}
                <div className="p-6 rounded-[24px] bg-white border border-[#ded7ce] shadow-sm space-y-3.5 text-xs text-[#2a2b2f]">
                  <div className="flex justify-between items-center pb-2 border-b border-[#f0ebe3]">
                    <span className="text-[#8c827a]">Makna Utama Uang:</span>
                    <span className="font-serif font-medium capitalize">
                      {moneyMeaning.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-[#f0ebe3]">
                    <span className="text-[#8c827a]">Gaya Komunikasi:</span>
                    <span className="font-serif font-medium capitalize">
                      {commStyle.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-[#f0ebe3]">
                    <span className="text-[#8c827a]">Struktur Rekening:</span>
                    <span className="font-serif font-medium capitalize">
                      {walletChoice === "both" ? "Shared + Personal Wallets" : walletChoice}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-[#f0ebe3]">
                    <span className="text-[#8c827a]">Rasio Patungan:</span>
                    <span className="font-serif font-medium">
                      {partnerBName} {splitRatio.dina}% : {partnerAName} {splitRatio.raka}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-[#f0ebe3]">
                    <span className="text-[#8c827a]">Batas Dual-Key:</span>
                    <span className="font-serif font-medium text-[#B4562A]">
                      {formatMoneyConverted(threshold, "USD", reportingCurrency, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#8c827a]">Cooling-Off 8 Jam:</span>
                    <span className="font-serif font-medium text-[#2d5232]">
                      {coolingOff ? "Aktif (23:00 - 08:00)" : "Non-aktif"}
                    </span>
                  </div>
                </div>

                {/* Dual Signature Buttons */}
                <div className="space-y-3 pt-2">
                  <span className="font-serif text-sm text-[#2a2b2f] block">
                    Tanda Tangan Kedua Pasangan:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPartnerASigned(true)}
                      className={`p-3.5 rounded-full text-xs font-serif transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                        partnerASigned
                          ? "bg-[#2d5232]/10 border-[#2d5232]/30 text-[#2d5232] font-semibold"
                          : "bg-white border-[#ded7ce] text-[#2a2b2f] hover:bg-[#fcf8f0]"
                      }`}
                    >
                      <SolarIcon
                        name={partnerASigned ? "check-circle" : "shield-check"}
                        size={18}
                      />
                      <span>
                        {partnerASigned ? `${partnerAName} Signed ✓` : `Sign as ${partnerAName}`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPartnerBSigned(true)}
                      className={`p-3.5 rounded-full text-xs font-serif transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                        partnerBSigned
                          ? "bg-[#2d5232]/10 border-[#2d5232]/30 text-[#2d5232] font-semibold"
                          : "bg-white border-[#ded7ce] text-[#2a2b2f] hover:bg-[#fcf8f0]"
                      }`}
                    >
                      <SolarIcon
                        name={partnerBSigned ? "check-circle" : "shield-check"}
                        size={18}
                      />
                      <span>
                        {partnerBSigned ? `${partnerBName} Signed ✓` : `Sign as ${partnerBName}`}
                      </span>
                    </button>
                  </div>

                  {!canActivate && (
                    <p className="text-[11px] text-[#B4562A] text-center pt-1">
                      Menunggu persetujuan kedua pihak. Kedua pasangan harus menandatangani untuk mengaktifkan kesepakatan ini.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Step Actions */}
            <div className="mt-10 pt-6 border-t border-[#eedecb] flex items-center justify-between">
              {questionnairePillar > 1 ? (
                <button
                  type="button"
                  onClick={() => setQuestionnairePillar((p) => (p - 1) as any)}
                  className="px-5 py-2.5 rounded-full border border-[#ded7ce] text-xs font-serif text-[#2a2b2f] hover:bg-white transition-all cursor-pointer"
                >
                  Previous Pillar
                </button>
              ) : (
                <div />
              )}

              {questionnairePillar < 4 ? (
                <button
                  type="button"
                  onClick={() => setQuestionnairePillar((p) => (p + 1) as any)}
                  className="px-6 py-2.5 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white text-xs font-serif transition-all shadow-xs cursor-pointer"
                >
                  Continue to Next Pillar
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canActivate}
                  onClick={handleCompleteQuestionnaire}
                  className={`px-7 py-3 rounded-full font-serif text-sm transition-all shadow-xs ${
                    canActivate
                      ? "bg-[#B4562A] hover:bg-[#9c4820] text-white cursor-pointer active:scale-95"
                      : "bg-[#ded7ce] text-white/70 cursor-not-allowed"
                  }`}
                >
                  Activate Contract &amp; Enter Home
                </button>
              )}
            </div>
          </main>

          <footer className="px-6 py-6 text-center text-xs text-[#8c827a] border-t border-[#E6E6E6]">
            Step {questionnairePillar} of 4 • Seiya Couple Contract Setup
          </footer>
        </div>
      )}

      {/* =========================================================================
          JOIN SPACE MODAL (Invite code input)
          ========================================================================= */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-[#2a2b2f]/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FEF9E9] rounded-[24px] max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[#eedecb] space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#B4562A]/15 text-[#B4562A] flex items-center justify-center">
                  <SolarIcon name="users-group-rounded" size={20} />
                </div>
                <div>
                  <h3 className="font-serif text-lg text-[#2a2b2f]">
                    Join a Shared Space
                  </h3>
                  <p className="text-xs text-[#78716c]">
                    Connect with your partner
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowJoinModal(false)}
                className="text-[#78716c] hover:text-[#2a2b2f] p-1.5 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={20} />
              </button>
            </div>

            <form onSubmit={handleJoinSpace} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#423f3b] mb-1.5">
                  Partner Invitation Code
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value.toUpperCase());
                    setJoinError("");
                  }}
                  placeholder="e.g. SEIYA-7F3X"
                  className="w-full px-4 py-3 rounded-xl border border-[#ded7ce] bg-white text-center font-mono font-bold text-lg text-[#2a2b2f] tracking-widest placeholder-[#a69e96] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A]"
                />
                {joinError && (
                  <p className="text-xs text-red-600 mt-1">{joinError}</p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-white/70 border border-[#eedecb] text-xs text-[#5a534c] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#8c827a]">Partner Space:</span>
                  <span className="font-semibold text-[#2a2b2f]">
                    {partnerAName}&apos;s Vault
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8c827a]">Your Role:</span>
                  <span className="font-semibold text-[#2a2b2f]">
                    {partnerBName} (Co-Owner)
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowJoinModal(false)}
                  className="flex-1 rounded-full text-xs"
                >
                  Cancel
                </Button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-5 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-sm transition-all shadow-xs cursor-pointer"
                >
                  Join Space
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
