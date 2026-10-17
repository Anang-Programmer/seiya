"use client";

import React, { useState } from "react";
import Image from "next/image";
import { SeiyaLogo } from "@/components/icons/seiya-logo";
import { SolarIcon } from "@/components/icons/solar";
import { Button } from "@/components/ui/button";
import { useApp, UserRole } from "@/lib/store";
import { OnboardingView } from "./onboarding-view";

export type AuthMode = "login" | "register" | "choose-path" | "story-intro";

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
  const { partnerAName, partnerBName, setCurrentUser } = useApp();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Join Space Invite Code Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("SEIYA-7F3X");
  const [joinError, setJoinError] = useState("");

  // Contract Questionnaire Wizard
  const [showContractWizard, setShowContractWizard] = useState(false);

  // Handle Login submission
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Default to partner_a or partner_b if matching name
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
    // Successfully joined partner B
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

  return (
    <div className="min-h-screen bg-[#fefcf6] text-[#2a2b2f] flex flex-col justify-between selection:bg-[#B45529]/20 selection:text-[#B45529] relative overflow-x-hidden">
      {/* Top Demo & Navigation Bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#2a2b2f]/90 text-white backdrop-blur-md px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 text-xs font-mono border border-white/10 opacity-90 hover:opacity-100 transition-opacity">
        <span className="text-white/40 px-2 hidden sm:inline">VIEW:</span>
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
        {onClose && (
          <button
            onClick={onClose}
            className="ml-1 pl-2 border-l border-white/20 text-white/50 hover:text-white cursor-pointer"
            title="Exit Auth Demo"
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

              {/* Fast fill helpers for preview convenience */}
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
            {/* Soft ambient radial gradient behind mascot */}
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
          {/* Header with Centered Seiya Logo */}
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

          {/* Main Content */}
          <main className="max-w-5xl mx-auto px-6 py-6 flex-1 flex flex-col justify-center w-full">
            <h1 className="text-center font-serif text-[34px] sm:text-[44px] font-normal text-[#2a2b2f] mb-8 sm:mb-12 tracking-tight">
              Choose Your Path
            </h1>

            {/* Two Large Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto w-full">
              {/* Card 1: Create a Shared Space */}
              <div
                onClick={() => setMode("story-intro")}
                className="group relative bg-[#B4562A] hover:bg-[#a64e24] text-white rounded-[28px] p-7 sm:p-9 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1.5 overflow-hidden"
              >
                {/* Visual Illustration */}
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
                {/* Visual Illustration */}
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

          {/* Minimal Footer */}
          <footer className="px-6 py-6 text-center text-xs text-[#8c827a]">
            Need help? Seiya keeps your financial journey collaborative & safe.
          </footer>
        </div>
      )}

      {/* =========================================================================
          SCREEN 4 & 5: ONBOARDING STORY INTRO (Figma: 470-8747 & 469-8665)
          ========================================================================= */}
      {mode === "story-intro" && (
        <div className="min-h-screen bg-[#FEF9E9] flex flex-col justify-between">
          {/* Header Layout matching 469:8665 */}
          <header className="px-6 sm:px-12 py-5 border-b border-[#eedecb]/70 bg-[#FEF9E9]/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between">
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

          {/* Main 2-Column Hero */}
          <main className="max-w-6xl mx-auto px-6 sm:px-12 py-10 sm:py-16 flex-1 flex items-center w-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center w-full">
              {/* Left Column: Headline & CTA */}
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
                    onClick={() => setShowContractWizard(true)}
                    className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-medium text-sm transition-all shadow-sm hover:shadow-md cursor-pointer group active:scale-[0.99]"
                  >
                    <span className="font-serif text-base">Start</span>
                    <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                      <SolarIcon name="arrow-right" size={14} />
                    </span>
                  </button>
                </div>
              </div>

              {/* Right Column: Floating Step Card */}
              <div className="lg:col-span-6 flex justify-center lg:justify-end">
                <div className="bg-white rounded-[24px] shadow-xl overflow-hidden border border-[#eedecb]/80 max-w-[440px] w-full">
                  {/* Banner Image */}
                  <div className="relative w-full h-[165px] bg-[#f9eee0] overflow-hidden">
                    <Image
                      src="/images/auth/onboarding-banner.png"
                      alt="Seiya Onboarding Journey"
                      fill
                      priority
                      className="object-cover object-top"
                    />
                  </div>

                  {/* Card Steps */}
                  <div className="p-6 space-y-4">
                    {/* Step 1 */}
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

                    {/* Step 2 */}
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

                    {/* Step 3 */}
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

                    {/* Disclaimer */}
                    <p className="text-[11px] text-[#8c827a] leading-relaxed pt-1">
                      There are no right or wrong answers. You can also go back
                      and change your answers at any time.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </main>

          {/* Footer note */}
          <footer className="px-6 py-6 text-center text-xs text-[#8c827a]">
            Step 1 of 5 • Guided Couple Agreement
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

      {/* =========================================================================
          ONBOARDING QUESTIONNAIRE WIZARD MODAL
          ========================================================================= */}
      {showContractWizard && (
        <OnboardingView
          onComplete={() => {
            setShowContractWizard(false);
            if (onSuccess) {
              onSuccess("partner_a");
            }
          }}
          onCancel={() => setShowContractWizard(false)}
        />
      )}
    </div>
  );
}
