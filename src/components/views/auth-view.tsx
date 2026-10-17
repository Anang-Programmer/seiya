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
  // PROFILING QUESTIONNAIRE STATES (Figma 493-8073: 7 Steps)
  // =========================================================================
  const [profilingStep, setProfilingStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(1);

  // Step 1: Context
  const [relationshipStatus, setRelationshipStatus] = useState<string>("Serious Dating");

  // Step 2: Money Style
  const [moneyStyle, setMoneyStyle] = useState<string>("Balanced & Pragmatic");

  // Step 3: Your Money Story
  const [moneyStory, setMoneyStory] = useState<string>("Security & Peace of Mind");

  // Step 4: Goals
  const [goalChoice, setGoalChoice] = useState<string>("Buying a Home or Property");

  // Step 5: Rules (Approval Threshold)
  const [ruleThreshold, setRuleThreshold] = useState<string>("$500 (Rp 8.000.000)");

  // Step 6: Privacy (Account Transparency Mode)
  const [privacyMode, setPrivacyMode] = useState<string>("Shared + Personal Wallets (Recommended)");

  // Step 7: Security Check (Cooling-off & Signatures)
  const [coolingOffSafeguard, setCoolingOffSafeguard] = useState<string>("Yes, enable 8-Hour Cooling-Off (Recommended)");
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

  // Profiling Step Configuration
  const PROFILING_STEPS = [
    { id: 1, label: "Context" },
    { id: 2, label: "Money Style" },
    { id: 3, label: "Your Money Story" },
    { id: 4, label: "Goals" },
    { id: 5, label: "Rules" },
    { id: 6, label: "Privacy" },
    { id: 7, label: "Security Check" },
  ];

  const currentStepData = {
    1: {
      category: "About your relationship",
      question: "What is your current relationship status?",
      subtitle: "This helps Seiya tailor suggestions and forms of agreement to you",
      options: ["Serious Dating", "Engaged", "Married"],
      selected: relationshipStatus,
      onSelect: (val: string) => setRelationshipStatus(val),
    },
    2: {
      category: "About your money habits",
      question: "How do you typically approach everyday spending?",
      subtitle: "Understanding how you make financial decisions helps avoid misunderstandings",
      options: [
        "Careful & Planned",
        "Balanced & Pragmatic",
        "Spontaneous & Flexible",
      ],
      selected: moneyStyle,
      onSelect: (val: string) => setMoneyStyle(val),
    },
    3: {
      category: "About your core values",
      question: "What does financial stability mean most to you?",
      subtitle: "Your emotional anchor guides how Seiya frames recommendations and priorities",
      options: [
        "Security & Peace of Mind",
        "Freedom & Independence",
        "Reward for Hard Work",
        "Caring for Loved Ones",
      ],
      selected: moneyStory,
      onSelect: (val: string) => setMoneyStory(val),
    },
    4: {
      category: "About your future plans",
      question: "What is your shared top priority this year?",
      subtitle: "Seiya allocates and protects funds toward this specific milestone together",
      options: [
        "Buying a Home or Property",
        "Building an Emergency Fund",
        "Travel & Meaningful Experiences",
        "Family & Child Planning",
      ],
      selected: goalChoice,
      onSelect: (val: string) => setGoalChoice(val),
    },
    5: {
      category: "About your mutual rules",
      question: "What shared expense amount requires mutual approval?",
      subtitle: "Any shared withdrawal above this limit requires both partners' explicit sign-off",
      options: [
        "$250 (Rp 4.000.000)",
        "$500 (Rp 8.000.000)",
        "$1,000 (Rp 16.000.000)",
      ],
      selected: ruleThreshold,
      onSelect: (val: string) => setRuleThreshold(val),
    },
    6: {
      category: "About account visibility",
      question: "How would you like to structure your visibility together?",
      subtitle: "Shared funds are fully transparent, while personal funds keep your privacy intact",
      options: [
        "Shared + Personal Wallets (Recommended)",
        "100% Joint Shared Wallet Only",
        "Separate Wallets with Split Logging",
      ],
      selected: privacyMode,
      onSelect: (val: string) => setPrivacyMode(val),
    },
    7: {
      category: "Safeguards & Activation",
      question: "Enable Cooling-Off Safeguards for late-night purchases?",
      subtitle: "Purchases above threshold between 23:00 - 08:00 are placed on a gentle 8-hour hold",
      options: [
        "Yes, enable 8-Hour Cooling-Off (Recommended)",
        "No, instant Dual-Key confirmation only",
      ],
      selected: coolingOffSafeguard,
      onSelect: (val: string) => setCoolingOffSafeguard(val),
    },
  }[profilingStep];

  return (
    <div className="min-h-screen bg-[#FEFBF5] text-[#2a2b2f] flex flex-col justify-between selection:bg-[#B45529]/20 selection:text-[#B45529] relative overflow-x-hidden">
      {/* Bottom Floating Navigation Pill for Quick Screen Verification */}
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
          Profiling (493-8073)
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
          SCREEN 5: PROFILING QUESTIONNAIRE (Figma: 469-8665 Canvas + 493-8073 Component)
          ========================================================================= */}
      {mode === "questionnaire" && (
        <div className="min-h-screen bg-[#FEFBF5] flex flex-col justify-between">
          {/* Top Header strictly matching Figma 469:8665 */}
          <header className="px-6 sm:px-12 py-6 border-b border-[#E6E6E6] bg-[#FEFBF5] sticky top-0 z-30 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div
                onClick={() => setMode("story-intro")}
                className="cursor-pointer"
              >
                <SeiyaLogo height={42} />
              </div>
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="text-xs text-[#737373] hover:text-[#000000] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={18} />
                <span className="hidden sm:inline">Exit</span>
              </button>
            )}
          </header>

          {/* Main Content: Profiling Two-Column Layout (Figma: 493:8073) */}
          <main className="max-w-6xl mx-auto px-6 py-8 sm:py-12 flex-1 w-full flex flex-col md:flex-row gap-10 lg:gap-16 items-start">
            {/* Left Sidebar: Profiling List */}
            <aside className="w-full md:w-[360px] shrink-0 space-y-6">
              <h2 className="font-serif text-[24px] text-[#737373] tracking-tight">
                Profiling
              </h2>

              <div className="space-y-3">
                {PROFILING_STEPS.map((s) => {
                  const isActive = profilingStep === s.id;
                  const isDone = profilingStep > s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setProfilingStep(s.id as any)}
                      className={`flex items-center gap-[22px] px-5 py-3 rounded-[20px] cursor-pointer transition-all ${
                        isActive
                          ? "bg-[#B4562A] text-white shadow-xs"
                          : "text-[#737373] hover:text-[#000000] hover:bg-black/[0.02]"
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-serif text-lg font-medium transition-all ${
                          isActive
                            ? "bg-white text-[#B4562A]"
                            : isDone
                            ? "border-2 border-[#2d5232] text-[#2d5232] bg-[#2d5232]/5"
                            : "border-2 border-[#737373]/50 text-[#737373]"
                        }`}
                      >
                        {isDone ? "✓" : s.id}
                      </div>
                      <span
                        className={`font-serif text-xl ${
                          isActive
                            ? "text-white font-medium"
                            : "text-[#737373] font-normal"
                        }`}
                      >
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Right Interactive Area */}
            <section className="flex-1 w-full max-w-2xl space-y-6">
              {/* Category, Title, and Subtitle */}
              <div className="space-y-1">
                <span className="font-serif text-lg sm:text-xl text-[#737373] block">
                  {currentStepData.category}
                </span>
                <h1 className="font-serif text-[32px] sm:text-[38px] font-normal text-[#000000] tracking-tight leading-tight">
                  {currentStepData.question}
                </h1>
                <p className="font-serif text-base sm:text-lg text-[#737373] pt-1">
                  {currentStepData.subtitle}
                </p>
              </div>

              {/* White Floating Card (Figma 493:8073) */}
              <div className="bg-white rounded-[30px] p-6 sm:p-8 shadow-xl border border-black/5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {currentStepData.options.map((opt) => {
                    const isSelected = currentStepData.selected === opt;
                    return (
                      <div
                        key={opt}
                        onClick={() => currentStepData.onSelect(opt)}
                        className={`p-4 rounded-[15px] border transition-all cursor-pointer flex items-center gap-3.5 ${
                          isSelected
                            ? "border-[#B4562A] bg-[#FEFBF5]/50 shadow-xs ring-1 ring-[#B4562A]"
                            : "border-[#BFBFBF] hover:border-[#737373] bg-white"
                        }`}
                      >
                        {/* Radio Circle */}
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? "border-[#B4562A] bg-[#B4562A]"
                              : "border-[#BFBFBF]"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-white" />
                          )}
                        </div>
                        <span className="font-serif text-lg sm:text-xl text-[#000000]">
                          {opt}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Additional Step 7 Signatures if on Security Check */}
                {profilingStep === 7 && (
                  <div className="pt-6 border-t border-[#f0ebe3] space-y-3">
                    <span className="font-serif text-base text-[#2a2b2f] block">
                      Dual Partner Signatures:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPartnerASigned(true)}
                        className={`p-3.5 rounded-full text-xs font-serif transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                          partnerASigned
                            ? "bg-[#2d5232]/10 border-[#2d5232]/30 text-[#2d5232] font-semibold"
                            : "bg-[#fcf8f0] border-[#ded7ce] text-[#2a2b2f] hover:bg-white"
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
                            : "bg-[#fcf8f0] border-[#ded7ce] text-[#2a2b2f] hover:bg-white"
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
                      <p className="text-[11px] text-[#B4562A] text-center pt-1 font-sans">
                        Both partners must sign to complete setup and activate the Couple Contract.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Navigation: Back, Skip, Continue */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (profilingStep > 1) {
                      setProfilingStep((p) => (p - 1) as any);
                    } else {
                      setMode("story-intro");
                    }
                  }}
                  className="flex items-center gap-2 text-[#737373] hover:text-[#000000] font-serif text-lg transition-colors cursor-pointer"
                >
                  <svg
                    className="w-4 h-4 text-[#737373]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  <span>Back</span>
                </button>

                <div className="flex items-center gap-6">
                  {profilingStep < 7 && (
                    <button
                      type="button"
                      onClick={() => setProfilingStep((p) => (p + 1) as any)}
                      className="text-[#737373] hover:text-[#000000] font-serif text-lg transition-colors cursor-pointer"
                    >
                      Skip
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={profilingStep === 7 && !canActivate}
                    onClick={() => {
                      if (profilingStep < 7) {
                        setProfilingStep((p) => (p + 1) as any);
                      } else {
                        handleCompleteQuestionnaire();
                      }
                    }}
                    className={`px-7 py-3 rounded-[15px] font-sans font-semibold text-base flex items-center gap-2.5 transition-all shadow-xs ${
                      profilingStep === 7 && !canActivate
                        ? "bg-[#BFBFBF] text-white/80 cursor-not-allowed"
                        : "bg-[#B4562A] hover:bg-[#9c4820] text-white cursor-pointer active:scale-[0.99]"
                    }`}
                  >
                    <span>
                      {profilingStep === 7 ? "Activate Contract & Enter" : "Continue"}
                    </span>
                    <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </span>
                  </button>
                </div>
              </div>
            </section>
          </main>

          {/* Minimal Bottom Margin */}
          <div className="h-10" />
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
