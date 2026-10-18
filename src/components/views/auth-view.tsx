"use client";

import React, { useState } from "react";
import Image from "next/image";
import { SeiyaLogo, SeiyaIcon } from "@/components/icons/seiya-logo";
import { SolarIcon } from "@/components/icons/solar";
import { Button } from "@/components/ui/button";
import { useApp, UserRole } from "@/lib/store";
import { formatMoneyConverted } from "@/lib/utils";

export type AuthMode =
  | "login"
  | "register"
  | "choose-path"
  | "story-intro"
  | "questionnaire"
  | "connect-partner"
  | "contract-setup"
  | "welcoming";

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
    activateInitialContract,
  } = useApp();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states (Login & Register)
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Dynamic names
  const activePartnerAName = fullName.trim() ? fullName.trim() : partnerAName;
  const activePartnerBName = partnerBName;

  // Join Space Invite Code Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState("SEIYA-7F3X");
  const [joinError, setJoinError] = useState("");

  // Choose Your Path selection state ("create" | "join" | null)
  const [selectedPath, setSelectedPath] = useState<"create" | "join" | null>(null);

  // =========================================================================
  // PARTNER PAIRING & CONNECT CODE STATES
  // =========================================================================
  const [partnerConnected, setPartnerConnected] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // =========================================================================
  // COUPLE CONTRACT SETUP STATES (With AI Suggestions & Manual Editing)
  // =========================================================================
  const [contractSplitA, setContractSplitA] = useState<number>(60);
  const [contractSplitB, setContractSplitB] = useState<number>(40);
  const [contractThreshold, setContractThreshold] = useState<number>(500);
  const [contractCurrency, setContractCurrency] = useState<string>("USD");
  const [contractWalletMode, setContractWalletMode] = useState<"hybrid" | "pooled" | "goals-only">("hybrid");
  const [contractCoolingOff, setContractCoolingOff] = useState<boolean>(true);
  const [contractEmergencyLock, setContractEmergencyLock] = useState<boolean>(true);
  const [contractApproveEveryShared, setContractApproveEveryShared] = useState<boolean>(false);
  const [contractPartnerASigned, setContractPartnerASigned] = useState<boolean>(false);
  const [contractPartnerBSigned, setContractPartnerBSigned] = useState<boolean>(false);
  const [aiApplied, setAiApplied] = useState<boolean>(false);

  // =========================================================================
  // PROFILING QUESTIONNAIRE STATES (Figma 472:8257 - 22 Screens in 7 Steps)
  // =========================================================================
  const [currentScreen, setCurrentScreen] = useState<number>(1);

  // Screen 1: Relationship Status
  const [relationshipStatus, setRelationshipStatus] = useState<string>("Serious Dating");
  // Screen 2: Relationship Duration
  const [relationshipDuration, setRelationshipDuration] = useState<string>("1-3 years");
  // Screen 3: Relationship Plans
  const [relationshipPlans, setRelationshipPlans] = useState<string>("");
  // Screen 4: Help Family
  const [helpFamily, setHelpFamily] = useState<string>("Routine every month");
  // Screen 5: Income Type
  const [incomeType, setIncomeType] = useState<string>("Fixed");

  // Screen 6: Spend difficulty (1..11)
  const [spendDifficulty, setSpendDifficulty] = useState<number>(6);
  // Screen 7: Hold back need (1..11)
  const [holdBackNeed, setHoldBackNeed] = useState<number>(5);
  // Screen 8: Impulse buy (1..11)
  const [impulseBuy, setImpulseBuy] = useState<number>(4);
  // Screen 9: Spending regret (1..11)
  const [spendingRegret, setSpendingRegret] = useState<number>(4);

  // Screen 10: Childhood money
  const [childhoodMoney, setChildhoodMoney] = useState<string>("Talked openly");
  // Screen 11: Money meaning
  const [moneyMeaning, setMoneyMeaning] = useState<string>("Feel Safe");
  // Screen 12: Windfall tendency
  const [windfallTendency, setWindfallTendency] = useState<string>("Save it");

  // Screen 13: Biggest goal
  const [biggestGoal, setBiggestGoal] = useState<string>("Have sufficient emergency funds");
  // Screen 14: Goal emotion
  const [goalEmotion, setGoalEmotion] = useState<string>("Have a calmer day");
  // Screen 15: Goal alignment confidence (1..5)
  const [goalAlignmentConfidence, setGoalAlignmentConfidence] = useState<number>(4);

  // Screen 16: Money management now
  const [moneyManagementNow, setMoneyManagementNow] = useState<string>("Some combined");
  // Screen 17: Purchases threshold to discuss
  const [discussionThreshold, setDiscussionThreshold] = useState<string>("4380,70");
  // Screen 18: Discussion channel
  const [discussionChannel, setDiscussionChannel] = useState<string>("Talk about it straight away");

  // Screen 19: Shared data categories (multiselect)
  const [sharedDataCategories, setSharedDataCategories] = useState<string[]>([
    "Total Balance",
    "Transaction Details",
    "Production Category",
  ]);

  // Screen 20: Financial freedom
  const [financialFreedom, setFinancialFreedom] = useState<string>("Yes");
  // Screen 21: Partner money style guess (1..11)
  const [partnerMoneyStyleGuess, setPartnerMoneyStyleGuess] = useState<number>(6);

  // Dual partner signatures for completion
  const [partnerASigned, setPartnerASigned] = useState<boolean>(true);
  const [partnerBSigned, setPartnerBSigned] = useState<boolean>(true);
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

  // Handle Join Space with Code -> proceed directly to Contract Setup
  const handleJoinSpace = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) {
      setJoinError("Please enter a valid invite code");
      return;
    }
    setPartnerConnected(true);
    setShowJoinModal(false);
    applyAISuggestions();
    setMode("contract-setup");
  };

  // Quick fill demo user
  const handleQuickFill = (name: string) => {
    setFullName(name);
    setPassword("seiya2026");
    setConfirmPassword("seiya2026");
  };

  // Dynamic AI Suggestions derived from 22 questionnaire profiling answers
  const getAISuggestion = () => {
    let splitA = 50;
    let splitB = 50;
    let splitRationale =
      "Equal 50:50 contribution based on balanced financial profiles and shared goals.";

    if (
      incomeType.toLowerCase().includes("variable") ||
      helpFamily.toLowerCase().includes("routine")
    ) {
      splitA = 60;
      splitB = 40;
      splitRationale = `Proportional 60:40 split recommended because of ${
        incomeType.toLowerCase().includes("variable")
          ? "variable income fluctuations"
          : "regular monthly family obligations"
      }, giving both partners an equitable safety cushion.`;
    } else if (spendDifficulty >= 8) {
      splitA = 55;
      splitB = 45;
      splitRationale =
        "A 55:45 split provides comfortable flexibility while aligning your mutual spending habits.";
    }

    let threshold = 500;
    let thresholdRationale =
      "Standard $500 threshold balances day-to-day autonomy with mutual oversight on major purchases.";

    if (impulseBuy >= 7 || spendingRegret >= 6 || spendDifficulty >= 7) {
      threshold = 250;
      thresholdRationale =
        "Lower $250 threshold recommended to prevent impulsive purchases and encourage mindful joint check-ins.";
    } else if (spendDifficulty <= 3 && impulseBuy <= 3) {
      threshold = 1000;
      thresholdRationale =
        "Higher $1,000 threshold recommended since both of you demonstrate disciplined spending habits.";
    }

    const coolingOff = impulseBuy >= 5 || spendingRegret >= 5;
    const coolingOffRationale = coolingOff
      ? "Late-night cooling-off enabled: Non-essential online transactions after 10 PM over $100 pause for 6 hours."
      : "Standard immediate settlement without late-night pause.";

    let walletMode: "hybrid" | "pooled" | "goals-only" = "hybrid";
    let walletRationale =
      "Hybrid Smart Vault: Shared bills and couple goals are jointly funded, while personal accounts remain private.";

    if (moneyManagementNow.toLowerCase().includes("combined")) {
      walletMode = "pooled";
      walletRationale =
        "Fully Pooled: All income and expenses flow through your shared couple smart vault.";
    }

    return {
      splitA,
      splitB,
      splitRationale,
      threshold,
      thresholdRationale,
      coolingOff,
      coolingOffRationale,
      walletMode,
      walletRationale,
    };
  };

  const applyAISuggestions = () => {
    const ai = getAISuggestion();
    setContractSplitA(ai.splitA);
    setContractSplitB(ai.splitB);
    setContractThreshold(ai.threshold);
    setContractCoolingOff(ai.coolingOff);
    setContractWalletMode(ai.walletMode);
    setAiApplied(true);
  };

  const handleProceedToContract = () => {
    if (!aiApplied) {
      applyAISuggestions();
    }
    setMode("contract-setup");
  };

  const handleRatifyContract = () => {
    activateInitialContract({
      splitPartnerA: contractSplitA,
      splitPartnerB: contractSplitB,
      approvalThreshold: contractThreshold,
      thresholdCurrency: contractCurrency,
      coolingOffEnabled: contractCoolingOff,
      approveEverySharedPurchase: contractApproveEveryShared,
    });
    setMode("welcoming");
  };

  const handleEnterHome = () => {
    setCurrentUser("partner_a");
    if (onSuccess) {
      onSuccess("partner_a");
    }
  };

  // Finish Questionnaire and proceed to Partner Pairing
  const handleCompleteQuestionnaire = () => {
    setMode("connect-partner");
  };

  // Profiling 7 Milestones configuration
  const PROFILING_STEPS = [
    { id: 1, label: "Context", startScreen: 1 },
    { id: 2, label: "Money Style", startScreen: 6 },
    { id: 3, label: "Your Money Story", startScreen: 10 },
    { id: 4, label: "Goals", startScreen: 13 },
    { id: 5, label: "Rules", startScreen: 16 },
    { id: 6, label: "Privacy", startScreen: 19 },
    { id: 7, label: "Security Check", startScreen: 20 },
  ];

  // Active milestone in sidebar based on currentScreen (1..22)
  const activeMilestoneId =
    currentScreen <= 5
      ? 1
      : currentScreen <= 9
      ? 2
      : currentScreen <= 12
      ? 3
      : currentScreen <= 15
      ? 4
      : currentScreen <= 18
      ? 5
      : currentScreen === 19
      ? 6
      : 7;

  const activeMilestone = PROFILING_STEPS.find((s) => s.id === activeMilestoneId);
  const [mobileStepMenuOpen, setMobileStepMenuOpen] = useState(false);

  // 22 Profiling Screens strictly matching Figma Component Set 472:8257
  const currentScreenConfig = {
    1: {
      category: "About your relationship",
      question: "What is your current relationship status?",
      subtitle: "This helps Seiya tailor suggestions and forms of agreement to you",
      type: "choice" as const,
      options: ["Serious Dating", "Engaged", "Married"],
      selectedString: relationshipStatus,
      onSelectString: (v: string) => setRelationshipStatus(v),
    },
    2: {
      category: "About your relationship",
      question: "How long have you been together?",
      subtitle: "Select the closest range",
      type: "choice" as const,
      options: ["Less than 1 year", "1-3 years", "4-7 years", "More than 7 years"],
      selectedString: relationshipDuration,
      onSelectString: (v: string) => setRelationshipDuration(v),
    },
    3: {
      category: "About your relationship",
      question: "Are there any big relationship plans in the near future?",
      subtitle: "For example, getting married, moving house, or starting life in a new city",
      type: "text" as const,
      placeholder: "Example: getting married at the end of next year",
      selectedString: relationshipPlans,
      onSelectString: (v: string) => setRelationshipPlans(v),
    },
    4: {
      category: "About your relationship",
      question: "Do you regularly help your extended family?",
      subtitle: "There's no need to mention the amount. We just want to understand the commitment you're keeping",
      type: "choice" as const,
      options: ["Routine every month", "Sometimes"],
      selectedString: helpFamily,
      onSelectString: (v: string) => setHelpFamily(v),
    },
    5: {
      category: "About your relationship",
      question: "What kind of income do you make?",
      subtitle: "Seiya will not ask for salary or debt at this stage",
      type: "choice" as const,
      options: ["Fixed", "Own business", "Not Fixed", "No income yet"],
      selectedString: incomeType,
      onSelectString: (v: string) => setIncomeType(v),
    },
    6: {
      category: "The way you see money",
      question: "How hard does it feel for you to spend money?",
      subtitle: "Choose 1 if it feels very light, or 11 if it feels very heavy",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Very light)",
      scaleMaxLabel: "11 (Very heavy)",
      selectedNumber: spendDifficulty,
      onSelectNumber: (v: number) => setSpendDifficulty(v),
    },
    7: {
      category: "The way you see money",
      question: "How often do you hold back from buying something you really need?",
      subtitle: "1 means almost never, 11 means very often",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Almost never)",
      scaleMaxLabel: "11 (Very often)",
      selectedNumber: holdBackNeed,
      onSelectNumber: (v: number) => setHoldBackNeed(v),
    },
    8: {
      category: "The way you see money",
      question: "When you find something interesting, how easily do you buy it right away?",
      subtitle: "1 means very cautious, 11 means very easy to buy",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Very cautious)",
      scaleMaxLabel: "11 (Very easy to buy)",
      selectedNumber: impulseBuy,
      onSelectNumber: (v: number) => setImpulseBuy(v),
    },
    9: {
      category: "The way you see money",
      question: "How often do you regret spending after you've done it?",
      subtitle: "Answer based on your habits, not what feels ideal",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Almost never)",
      scaleMaxLabel: "11 (Very often)",
      selectedNumber: spendingRegret,
      onSelectNumber: (v: number) => setSpendingRegret(v),
    },
    10: {
      category: "Experiences that shape you",
      question: "When you were a child, the money in your house was usually…",
      subtitle: "Early experiences often influence how we react to money today",
      type: "choice" as const,
      options: [
        "Become a source of contention",
        "Talked openly",
        "Rarely discussed",
        "Never a problem",
      ],
      selectedString: childhoodMoney,
      onSelectString: (v: string) => setChildhoodMoney(v),
    },
    11: {
      category: "Experiences that shape you",
      question: "For you, money means the most because it gives…",
      subtitle: "Choose the meaning that is closest to your feelings",
      type: "choice" as const,
      options: [
        "Feel Safe",
        "Confession",
        "Freedom",
        "Ability to help others",
      ],
      selectedString: moneyMeaning,
      onSelectString: (v: string) => setMoneyMeaning(v),
    },
    12: {
      category: "Experiences that shape you",
      question: "If you receive an unexpected sum of Rp. 1 million, you will tend to…",
      subtitle: "Neither choice is better than the other",
      type: "choice" as const,
      options: [
        "Save it",
        "Helping Families",
        "Buy what you've been eyeing",
        "Invest it",
      ],
      selectedString: windfallTendency,
      onSelectString: (v: string) => setWindfallTendency(v),
    },
    13: {
      category: "What you want to achieve",
      question: "What is your single biggest financial goal in the next 1–3 years?",
      subtitle: "Write in your own words. There's no need to mention numbers if you're not comfortable with it",
      type: "text" as const,
      placeholder: "Example: have sufficient emergency funds",
      selectedString: biggestGoal,
      onSelectString: (v: string) => setBiggestGoal(v),
    },
    14: {
      category: "What you want to achieve",
      question: "If that goal is achieved, what will you feel most?",
      subtitle: "This helps Seiya understand the reasons behind your goals",
      type: "choice" as const,
      options: [
        "Have a calmer day",
        "Proud to have grown successfully",
        "Life feels more meaningful",
        "Freer to choose",
        "The relationship feels closer",
      ],
      selectedString: goalEmotion,
      onSelectString: (v: string) => setGoalEmotion(v),
    },
    15: {
      category: "What you want to achieve",
      question: "How confident are you that your partner shares your goals?",
      subtitle: "1 means not sure at all, 5 means very sure",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: "1 (Not sure at all)",
      scaleMaxLabel: "5 (Very sure)",
      selectedNumber: goalAlignmentConfidence,
      onSelectNumber: (v: number) => setGoalAlignmentConfidence(v),
    },
    16: {
      category: "How you manage your money",
      question: "How do you manage your money now?",
      subtitle: "Choose the one that best describes the current condition",
      type: "choice" as const,
      options: [
        "Completely merged",
        "Some combined",
        "Separated",
        "There are no settings yet",
      ],
      selectedString: moneyManagementNow,
      onSelectString: (v: string) => setMoneyManagementNow(v),
    },
    17: {
      category: "How you manage your money",
      question: "Purchases above how much should be discussed first?",
      subtitle: "This will be the starting point for your “discussion first” rule",
      type: "choice" as const,
      options: [
        "2190,35",
        "4380,70",
        "8761,39",
        "21903,48",
        "Not know",
      ],
      selectedString: discussionThreshold,
      onSelectString: (v: string) => setDiscussionThreshold(v),
    },
    18: {
      category: "How you manage your money",
      question: "What way are you more comfortable discussing money?",
      subtitle: "Seiya will adjust the way it delivers insights and results",
      type: "choice" as const,
      options: [
        "Talk about it straight away",
        "Through writing first",
        "At a special time",
      ],
      selectedString: discussionChannel,
      onSelectString: (v: string) => setDiscussionChannel(v),
    },
    19: {
      category: "You are in control",
      question: "What do you want to share with your partner?",
      subtitle: "Select everything you're comfortable sharing. These settings can be changed at any time",
      type: "multiselect" as const,
      options: [
        "Total Balance",
        "Transaction Details",
        "Production Category",
        "Dept",
        "There isn't any yet",
      ],
      selectedArray: sharedDataCategories,
      onToggleArray: (item: string) => {
        setSharedDataCategories((prev) =>
          prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
        );
      },
    },
    20: {
      category: "Safe space for you",
      question: "Do you feel free to make your own decisions about your money?",
      subtitle: "These answers are always private and never shared. We use them only to keep your experience safe",
      type: "choice" as const,
      options: ["Yes", "Sometimes not"],
      selectedString: financialFreedom,
      onSelectString: (v: string) => setFinancialFreedom(v),
    },
    21: {
      category: "Safe space for you",
      question: "Lastly, want to guess your partner's money style?",
      subtitle: "Optional. Choose 1 if you think he's very easy to spend money on, or 11 if he's very hard to spend. Guesses are only allowed with mutual consent",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Very easy to spend)",
      scaleMaxLabel: "11 (Very hard to spend)",
      selectedNumber: partnerMoneyStyleGuess,
      onSelectNumber: (v: number) => setPartnerMoneyStyleGuess(v),
      continueButtonText: "See Summary",
    },
    22: {
      category: "Initial profile complete",
      question: "Thank you for starting with honesty.",
      subtitle: "Your profile is now complete. The full results, including your guess about your partner's money style, will be revealed after they complete the form",
      type: "summary" as const,
    },
  }[currentScreen] || {
    category: "About your relationship",
    question: "What is your current relationship status?",
    subtitle: "This helps Seiya tailor suggestions and forms of agreement to you",
    type: "choice" as const,
    options: ["Serious Dating", "Engaged", "Married"],
    selectedString: relationshipStatus,
    onSelectString: (v: string) => setRelationshipStatus(v),
  };

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
        <button
          onClick={() => setMode("connect-partner")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "connect-partner"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Connect
        </button>
        <button
          onClick={() => {
            if (!aiApplied) applyAISuggestions();
            setMode("contract-setup");
          }}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "contract-setup"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Contract
        </button>
        <button
          onClick={() => setMode("welcoming")}
          className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
            mode === "welcoming"
              ? "bg-[#B4562A] text-white font-semibold shadow-xs"
              : "text-white/70 hover:text-white"
          }`}
        >
          Welcome
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
          <div className="hidden lg:flex lg:w-1/2 bg-[#FEF9E9] relative items-center justify-center p-12 overflow-hidden">
            <div className="relative max-w-lg w-full flex flex-col items-center justify-center select-none">
              <div className="relative w-full aspect-[4/5] max-h-[640px]">
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
                onClick={() => {
                  if (selectedPath === "create") {
                    setMode("story-intro");
                  } else {
                    setSelectedPath("create");
                  }
                }}
                className={`group relative rounded-[28px] p-7 sm:p-9 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1.5 overflow-hidden ${
                  selectedPath === "create"
                    ? "bg-[#B4562A] hover:bg-[#a64e24] text-white ring-2 ring-[#B4562A]/40 shadow-xl -translate-y-1"
                    : "bg-[#FDF8E7] hover:bg-[#fbf4de] text-[#2a2b2f] border border-[#eeddc8]/70"
                }`}
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
                  <h3
                    className={`font-serif text-[24px] sm:text-[26px] font-normal transition-colors duration-300 ${
                      selectedPath === "create" ? "text-white" : "text-[#2a2b2f]"
                    }`}
                  >
                    Create a Shared Space
                  </h3>
                  <p
                    className={`text-xs sm:text-sm font-sans leading-relaxed transition-colors duration-300 ${
                      selectedPath === "create"
                        ? "text-white/85"
                        : "text-[#686057]"
                    }`}
                  >
                    The first user creates a shared financial space and obtains
                    an invitation code
                  </p>
                </div>
              </div>

              {/* Card 2: Join a Shared Space */}
              <div
                onClick={() => {
                  if (selectedPath === "join") {
                    setShowJoinModal(true);
                  } else {
                    setSelectedPath("join");
                  }
                }}
                className={`group relative rounded-[28px] p-7 sm:p-9 flex flex-col justify-between cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:-translate-y-1.5 overflow-hidden ${
                  selectedPath === "join"
                    ? "bg-[#B4562A] hover:bg-[#a64e24] text-white ring-2 ring-[#B4562A]/40 shadow-xl -translate-y-1"
                    : "bg-[#FDF8E7] hover:bg-[#fbf4de] text-[#2a2b2f] border border-[#eeddc8]/70"
                }`}
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
                  <h3
                    className={`font-serif text-[24px] sm:text-[26px] font-normal transition-colors duration-300 ${
                      selectedPath === "join" ? "text-white" : "text-[#2a2b2f]"
                    }`}
                  >
                    Join a Shared Space
                  </h3>
                  <p
                    className={`text-xs sm:text-sm font-sans leading-relaxed transition-colors duration-300 ${
                      selectedPath === "join" ? "text-white/85" : "text-[#686057]"
                    }`}
                  >
                    Enter your partner&apos;s invite code to join their shared
                    financial space
                  </p>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <div className="flex items-center justify-end max-w-4xl mx-auto w-full pt-6">
              <button
                type="button"
                disabled={!selectedPath}
                onClick={() => {
                  if (selectedPath === "create") {
                    setMode("story-intro");
                  } else if (selectedPath === "join") {
                    setShowJoinModal(true);
                  }
                }}
                className={`py-3 px-8 rounded-full font-serif text-sm transition-all duration-300 flex items-center gap-2 cursor-pointer ${
                  selectedPath
                    ? "bg-[#B4562A] hover:bg-[#9c4820] text-white shadow-md hover:shadow-lg active:scale-95"
                    : "bg-[#e5dcd0] text-[#8c827a] cursor-not-allowed opacity-50"
                }`}
              >
                <span>Continue</span>
                <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                  <svg
                    className="w-2.5 h-2.5 text-white"
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
        <div className="min-h-screen bg-[#FEFBF5] flex flex-col">
          {/* Top Header strictly matching Figma 469:8665 */}
          <header className="px-6 sm:px-12 py-4 border-b border-[#E6E6E6] bg-[#FEFBF5] sticky top-0 z-30 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div
                onClick={() => setMode("story-intro")}
                className="cursor-pointer"
              >
                <SeiyaLogo height={34} />
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

          {/* Mobile Floating Dropdown Button (fixed below topbar without extra background bar) */}
          <div className="md:hidden fixed top-[78px] left-0 right-0 z-25 px-4 pointer-events-none">
            <div className="relative max-w-md mx-auto pointer-events-auto">
              <button
                type="button"
                onClick={() => setMobileStepMenuOpen(!mobileStepMenuOpen)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-white rounded-2xl border border-[#e5dcd0] shadow-md hover:shadow-lg active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-[#B45529] text-white flex items-center justify-center font-serif text-xs font-semibold shrink-0">
                    {activeMilestone?.id || activeMilestoneId}
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#808988] block">
                      Profiling • Milestone {activeMilestone?.id || activeMilestoneId} of 7
                    </span>
                    <span className="font-serif text-sm font-medium text-[#2a2b2f]">
                      {activeMilestone?.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[#808988] bg-[#FEFBF5] px-2 py-0.5 rounded-full border border-[#e5dcd0]">
                    {currentScreen} / 22
                  </span>
                  <svg
                    className={`w-4 h-4 text-[#808988] transition-transform duration-200 ${
                      mobileStepMenuOpen ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </button>

              {/* Dropdown Menu Items */}
              {mobileStepMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30 bg-black/10 backdrop-blur-[1px]"
                    onClick={() => setMobileStepMenuOpen(false)}
                  />
                  <div className="absolute top-full left-0 right-0 mt-2 z-40 bg-white rounded-2xl border border-[#e5dcd0] shadow-xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    {PROFILING_STEPS.map((s) => {
                      const isActive = activeMilestoneId === s.id;
                      const isDone = activeMilestoneId > s.id;
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            setCurrentScreen(s.startScreen);
                            setMobileStepMenuOpen(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                            isActive
                              ? "bg-[#B45529] text-white font-medium shadow-xs"
                              : "text-[#515151] hover:bg-[#FEFBF5]"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center font-serif text-xs font-semibold shrink-0 ${
                                isActive
                                  ? "bg-white text-[#B45529]"
                                  : isDone
                                  ? "border border-[#2d5232] text-[#2d5232] bg-[#2d5232]/10"
                                  : "border border-[#808988]/40 text-[#808988]"
                              }`}
                            >
                              {isDone ? "✓" : s.id}
                            </div>
                            <span className="font-serif text-sm">
                              {s.label}
                            </span>
                          </div>
                          {isActive ? (
                            <span className="text-[11px] font-mono text-white/80">Active</span>
                          ) : isDone ? (
                            <span className="text-[11px] font-serif text-[#2d5232]">Done</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Main Content: Profiling Two-Column Layout (Figma: 493:8073 & Component Set 472:8257) */}
          <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pt-24 pb-8 sm:py-10 w-full">
            <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row items-center md:items-start justify-center gap-8 lg:gap-14 my-auto">
              {/* Desktop Left Sidebar: Profiling List (7 milestones strictly matching Figma 472:8190 / 493:8073) */}
              <aside className="hidden md:block md:w-64 lg:w-72 shrink-0 space-y-4">
                <div className="flex items-center justify-between pb-1">
                  <h2 className="font-serif text-lg text-[#515151] font-medium tracking-tight">
                    Profiling
                  </h2>
                  <span className="font-mono text-xs text-[#808988]">
                    {currentScreen} / 22
                  </span>
                </div>

                <div className="space-y-2">
                  {PROFILING_STEPS.map((s) => {
                    const isActive = activeMilestoneId === s.id;
                    const isDone = activeMilestoneId > s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => setCurrentScreen(s.startScreen)}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                          isActive
                            ? "bg-[#B45529] text-white shadow-xs"
                            : "text-[#515151] hover:text-[#2a2b2f] hover:bg-black/[0.03]"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-serif text-xs font-semibold shrink-0 transition-all ${
                            isActive
                              ? "bg-white text-[#B45529]"
                              : isDone
                              ? "border border-[#2d5232] text-[#2d5232] bg-[#2d5232]/10"
                              : "border border-[#808988]/40 text-[#808988]"
                          }`}
                        >
                          {isDone ? "✓" : s.id}
                        </div>
                        <span
                          className={`font-serif text-sm sm:text-base ${
                            isActive
                              ? "text-white font-medium"
                              : "text-[#515151] font-normal"
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
            <section className="w-full max-w-xl space-y-4">
              {/* Category, Title, and Subtitle */}
              <div className="space-y-1">
                <span className="font-serif text-xs sm:text-sm text-[#808988] block">
                  {currentScreenConfig.category}
                </span>
                <h1 className="font-serif text-xl sm:text-2xl font-normal text-[#2a2b2f] tracking-tight leading-snug">
                  {currentScreenConfig.question}
                </h1>
                <p className="font-sans text-xs sm:text-sm text-[#515151] pt-0.5 leading-relaxed">
                  {currentScreenConfig.subtitle}
                </p>
              </div>

              {/* Interactive Input Cards based on Type */}

              {/* 1. Choice Options (Figma Radio Grid) */}
              {currentScreenConfig.type === "choice" && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5dcd0] space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentScreenConfig.options?.map((opt) => {
                      const isSelected = currentScreenConfig.selectedString === opt;
                      return (
                        <div
                          key={opt}
                          onClick={() => currentScreenConfig.onSelectString?.(opt)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 text-left ${
                            isSelected
                              ? "border-[#B45529] bg-[#fbf0eb] shadow-2xs ring-1 ring-[#B45529]"
                              : "border-[#e5dcd0] hover:border-[#B45529]/50 bg-white hover:bg-[#fefcf6]"
                          }`}
                        >
                          {/* Radio Circle */}
                          <div
                            className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                              isSelected
                                ? "border-[#B45529] bg-[#B45529]"
                                : "border-[#d1c9bf]"
                            }`}
                          >
                            {isSelected && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white" />
                            )}
                          </div>
                          <span className="font-serif text-sm sm:text-base text-[#2a2b2f]">
                            {opt}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Scale 1..11 or 1..5 Options */}
              {currentScreenConfig.type === "scale" && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5dcd0] space-y-4">
                  {/* Row of scale numbers */}
                  <div className="flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto py-1">
                    {Array.from(
                      {
                        length:
                          (currentScreenConfig.scaleMax || 11) -
                          (currentScreenConfig.scaleMin || 1) +
                          1,
                      },
                      (_, i) => (currentScreenConfig.scaleMin || 1) + i
                    ).map((num) => {
                      const isSelected =
                        currentScreenConfig.selectedNumber === num;
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() =>
                            currentScreenConfig.onSelectNumber?.(num)
                          }
                          className={`min-w-[30px] sm:min-w-[38px] h-9 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center font-serif text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "border-[#B45529] bg-[#B45529] text-white shadow-xs scale-105"
                              : "border-[#e5dcd0] text-[#515151] hover:border-[#B45529] bg-white hover:bg-[#fefcf6]"
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>

                  {/* Scale Labels */}
                  <div className="flex items-center justify-between font-serif text-xs text-[#808988] pt-1 px-1">
                    <span>{currentScreenConfig.scaleMinLabel}</span>
                    <span>{currentScreenConfig.scaleMaxLabel}</span>
                  </div>
                </div>
              )}

              {/* 3. Text Area Input */}
              {currentScreenConfig.type === "text" && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5dcd0] space-y-3">
                  <textarea
                    rows={3}
                    value={currentScreenConfig.selectedString || ""}
                    onChange={(e) =>
                      currentScreenConfig.onSelectString?.(e.target.value)
                    }
                    placeholder={currentScreenConfig.placeholder}
                    className="w-full p-3.5 rounded-xl border border-[#e5dcd0] font-serif text-sm sm:text-base text-[#2a2b2f] placeholder-[#808988] focus:border-[#B45529] focus:outline-none focus:ring-1 focus:ring-[#B45529] bg-white resize-none"
                  />
                  <p className="text-xs font-sans text-[#808988] italic">
                    Type your thoughts in your own words, then click Continue.
                  </p>
                </div>
              )}

              {/* 4. Multi-Select Checkboxes */}
              {currentScreenConfig.type === "multiselect" && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5dcd0] space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentScreenConfig.options?.map((opt) => {
                      const isSelected =
                        currentScreenConfig.selectedArray?.includes(opt);
                      return (
                        <div
                          key={opt}
                          onClick={() =>
                            currentScreenConfig.onToggleArray?.(opt)
                          }
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 text-left ${
                            isSelected
                              ? "border-[#B45529] bg-[#fbf0eb] shadow-2xs ring-1 ring-[#B45529]"
                              : "border-[#e5dcd0] hover:border-[#B45529]/50 bg-white hover:bg-[#fefcf6]"
                          }`}
                        >
                          <div
                            className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                              isSelected
                                ? "border-[#B45529] bg-[#B45529] text-white"
                                : "border-[#d1c9bf]"
                            }`}
                          >
                            {isSelected && (
                              <span className="text-[10px] font-bold leading-none">
                                ✓
                              </span>
                            )}
                          </div>
                          <span className="font-serif text-sm sm:text-base text-[#2a2b2f]">
                            {opt}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Screen 22: Initial Profile Complete & Summary */}
              {currentScreenConfig.type === "summary" && (
                <div className="space-y-4">
                  {/* Summary Overview Card */}
                  <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#e5dcd0] space-y-4">
                    <h3 className="font-serif text-lg font-normal text-[#2a2b2f] border-b border-[#f0ebe3] pb-2.5">
                      Initial summary
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left font-serif">
                      <div className="space-y-1">
                        <span className="text-xs text-[#808988] block">
                          Your starting point
                        </span>
                        <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#B45529]/10 text-[#B45529] text-xs font-medium">
                          Ready to arrange
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs text-[#808988] block">
                          The main purpose
                        </span>
                        <p className="text-sm text-[#2a2b2f] font-normal">
                          {biggestGoal || "Have sufficient emergency funds"}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs text-[#808988] block">
                          How to manage money
                        </span>
                        <p className="text-sm text-[#2a2b2f] font-normal">
                          {moneyManagementNow}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <span className="text-xs text-[#808988] block">
                          Topic money data
                        </span>
                        <p className="text-sm text-[#2a2b2f] font-normal">
                          {sharedDataCategories.length > 0
                            ? sharedDataCategories.join(", ")
                            : "Total Balance, Transaction Details"}
                        </p>
                      </div>
                    </div>

                    {/* Dual Partner Vault Signatures */}
                    <div className="pt-3 border-t border-[#f0ebe3] space-y-2.5">
                      <span className="font-serif text-xs text-[#808988] block">
                        Dual Partner Vault Signatures:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setPartnerASigned(true)}
                          className={`p-2.5 rounded-full text-xs font-serif transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                            partnerASigned
                              ? "bg-[#2d5232]/10 border-[#2d5232]/30 text-[#2d5232] font-semibold"
                              : "bg-[#fcf8f0] border-[#ded7ce] text-[#2a2b2f] hover:bg-white"
                          }`}
                        >
                          <SolarIcon
                            name={partnerASigned ? "check-circle" : "shield-check"}
                            size={16}
                          />
                          <span>
                            {partnerASigned
                              ? `${partnerAName} Signed ✓`
                              : `Sign as ${partnerAName}`}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPartnerBSigned(true)}
                          className={`p-2.5 rounded-full text-xs font-serif transition-all cursor-pointer flex items-center justify-center gap-2 border ${
                            partnerBSigned
                              ? "bg-[#2d5232]/10 border-[#2d5232]/30 text-[#2d5232] font-semibold"
                              : "bg-[#fcf8f0] border-[#ded7ce] text-[#2a2b2f] hover:bg-white"
                          }`}
                        >
                          <SolarIcon
                            name={partnerBSigned ? "check-circle" : "shield-check"}
                            size={16}
                          />
                          <span>
                            {partnerBSigned
                              ? `${partnerBName} Signed ✓`
                              : `Sign as ${partnerBName}`}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Next Step Card */}
                  <div className="rounded-xl p-4 border border-[#e5dcd0] bg-[#fefcf6] flex items-start gap-3 text-left">
                    <div className="w-7 h-7 rounded-full bg-[#B45529] text-white font-serif text-xs font-bold flex items-center justify-center shrink-0 shadow-xs">
                      1
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="font-serif text-sm font-medium text-[#2a2b2f]">
                        Invite your partner to join
                      </h4>
                      <p className="font-sans text-xs text-[#515151]">
                        You will review privacy rules, transaction limits, and
                        mutual agreements together.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Navigation: Back, Skip, Continue / Make Invitations */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (currentScreen > 1) {
                      setCurrentScreen((p) => p - 1);
                    } else {
                      setMode("story-intro");
                    }
                  }}
                  className="flex items-center gap-1.5 text-[#515151] hover:text-[#2a2b2f] font-serif text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  <svg
                    className="w-3.5 h-3.5 text-[#515151]"
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

                <div className="flex items-center gap-4">
                  {currentScreen < 22 && (
                    <button
                      type="button"
                      onClick={() => setCurrentScreen((p) => p + 1)}
                      className="text-[#808988] hover:text-[#2a2b2f] font-serif text-xs sm:text-sm transition-colors cursor-pointer"
                    >
                      Skip
                    </button>
                  )}

                  {currentScreen === 22 ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setCurrentScreen(1)}
                        className="text-[#808988] hover:text-[#2a2b2f] font-serif text-xs underline cursor-pointer"
                      >
                        Change answer
                      </button>
                      <button
                        type="button"
                        onClick={handleCompleteQuestionnaire}
                        className="px-5 py-2.5 rounded-full bg-[#B45529] hover:bg-[#9e382b] text-white font-sans font-medium text-xs sm:text-sm flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
                      >
                        <span>Make couple invitations</span>
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                          <svg
                            className="w-2.5 h-2.5 text-white"
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCurrentScreen((p) => p + 1)}
                      className="px-5 py-2.5 rounded-full bg-[#B45529] hover:bg-[#9e382b] text-white font-sans font-medium text-xs sm:text-sm flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.99]"
                    >
                      <span>
                        {(currentScreenConfig as any).continueButtonText ||
                          "Continue"}
                      </span>
                      <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                        <svg
                          className="w-2.5 h-2.5 text-white"
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
                  )}
                </div>
              </div>
            </section>
            </div>
          </main>
        </div>
      )}

      {/* =========================================================================
          SCREEN 6: CONNECT PARTNER / PAIRING CODE
          ========================================================================= */}
      {mode === "connect-partner" && (
        <div className="flex-1 flex flex-col justify-between min-h-screen bg-[#FEFBF5]">
          {/* Top Header */}
          <header className="px-6 sm:px-12 py-5 border-b border-[#eeddc8]/70 flex items-center justify-between bg-white/70 backdrop-blur-md sticky top-0 z-30">
            <div
              onClick={() => onClose && onClose()}
              className="cursor-pointer flex items-center gap-2"
            >
              <SeiyaLogo height={34} />
            </div>

            {/* Step Breadcrumbs */}
            <div className="hidden md:flex items-center gap-3 text-xs font-serif">
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[11px]">✓</span>
                Profiling
              </span>
              <span className="text-[#c7bcb0]">→</span>
              <span className="flex items-center gap-1.5 text-[#B4562A] font-bold">
                <span className="w-5 h-5 rounded-full bg-[#B4562A] text-white flex items-center justify-center text-[11px]">2</span>
                Connect Partner
              </span>
              <span className="text-[#c7bcb0]">→</span>
              <span className="text-[#8c827a] flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#e5ddd3] text-[#78716c] flex items-center justify-center text-[11px]">3</span>
                Couple Contract
              </span>
              <span className="text-[#c7bcb0]">→</span>
              <span className="text-[#8c827a] flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-[#e5ddd3] text-[#78716c] flex items-center justify-center text-[11px]">4</span>
                Welcome
              </span>
            </div>

            {onClose ? (
              <button
                onClick={onClose}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span>Exit</span>
              </button>
            ) : (
              <div className="w-16" />
            )}
          </header>

          {/* Main Content */}
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center">
            <div className="text-center space-y-3 mb-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#B4562A]/10 text-[#B4562A] text-xs font-serif font-semibold border border-[#B4562A]/20">
                <SolarIcon name="users-group-rounded" size={15} />
                <span>Step 2 of 4 • Couple Vault Synchronization</span>
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl text-[#2a2b2f] font-normal tracking-tight">
                Connect with Your Partner
              </h1>
              <p className="text-xs sm:text-sm text-[#78716c] max-w-lg mx-auto leading-relaxed">
                Share your unique invite code with your partner. Once they connect, Seiya&apos;s AI synthesizes both your profiling insights into a mutual contract proposal.
              </p>
            </div>

            {/* Central Invite & Pairing Card */}
            <div className="bg-[#FEF9E9] border border-[#eeddc8] rounded-[28px] p-6 sm:p-9 shadow-sm space-y-8">
              {/* Partner Code Box */}
              <div>
                <label className="block text-xs font-bold text-[#5c5349] uppercase tracking-wider mb-2 text-center">
                  Your Couple Invite Code
                </label>
                <div className="bg-white rounded-2xl border-2 border-dashed border-[#B4562A]/40 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-[#B4562A]/10 text-[#B4562A] flex items-center justify-center shrink-0">
                      <SolarIcon name="lock-keyhole" size={22} />
                    </div>
                    <div className="text-left">
                      <span className="font-mono text-2xl sm:text-3xl font-bold tracking-widest text-[#B4562A]">
                        SEIYA-7F3X
                      </span>
                      <p className="text-[11px] text-[#8c827a]">
                        Valid for 7 days • Webank secure pairing channel
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText("SEIYA-7F3X");
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2500);
                      }}
                      className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-[#B4562A] hover:bg-[#9c4820] text-white text-xs font-serif font-medium flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <SolarIcon name={copiedCode ? "check-circle" : "paperclip"} size={14} />
                      <span>{copiedCode ? "Code Copied!" : "Copy Code"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText("https://seiya.finance/join/SEIYA-7F3X");
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2500);
                      }}
                      className="px-3 py-2.5 rounded-xl bg-white hover:bg-[#fbf4de] text-[#5c5349] border border-[#ded7ce] text-xs font-serif font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      title="Copy invite URL"
                    >
                      <SolarIcon name="arrow-right" size={14} />
                      <span className="hidden sm:inline">Invite Link</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Pairing Visualizer */}
              <div className="p-5 rounded-2xl bg-white/80 border border-[#eeddc8] space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-[#5c5349] border-b border-[#f0e4d6] pb-2.5">
                  <span>Pairing Status</span>
                  <span className={partnerConnected ? "text-emerald-700 font-bold" : "text-amber-700"}>
                    {partnerConnected ? "✓ Mutual Link Verified" : "⏳ Awaiting Partner Connection"}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-7 items-center gap-3 py-2">
                  {/* Partner A */}
                  <div className="sm:col-span-3 flex items-center gap-3 p-3 rounded-xl bg-[#FEFBF5] border border-[#f0e4d6]">
                    <div className="w-10 h-10 rounded-full bg-[#B4562A]/15 text-[#B4562A] flex items-center justify-center font-serif font-bold text-base">
                      {activePartnerAName.charAt(0) || "R"}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-serif font-semibold text-sm text-[#2a2b2f] truncate">
                          {activePartnerAName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#B4562A]/10 text-[#B4562A] font-sans">
                          You
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-emerald-700 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        <span>Profiling Completed</span>
                      </div>
                    </div>
                  </div>

                  {/* Connection Node */}
                  <div className="sm:col-span-1 flex flex-col items-center justify-center py-1 sm:py-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      partnerConnected ? "bg-emerald-100 text-emerald-700 scale-110" : "bg-[#f5ecde] text-[#8c827a]"
                    }`}>
                      <SolarIcon name={partnerConnected ? "heart" : "refresh"} size={16} />
                    </div>
                  </div>

                  {/* Partner B */}
                  <div className={`sm:col-span-3 flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    partnerConnected
                      ? "bg-emerald-50/70 border-emerald-200"
                      : "bg-[#fdfaf5] border-dashed border-[#ded7ce]"
                  }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-serif font-bold text-base ${
                      partnerConnected
                        ? "bg-emerald-200 text-emerald-800"
                        : "bg-[#e5ddd3] text-[#78716c]"
                    }`}>
                      {activePartnerBName.charAt(0) || "D"}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-serif font-semibold text-sm text-[#2a2b2f] truncate">
                          {activePartnerBName}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-stone-200 text-stone-700 font-sans">
                          Partner
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] mt-0.5">
                        {partnerConnected ? (
                          <span className="text-emerald-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            Connected & Synced
                          </span>
                        ) : (
                          <span className="text-amber-700 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Pending invite entry...
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Simulation helper button for testing/demo */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#faf3e6]/80 p-3 rounded-xl border border-[#eeddc8]">
                  <div className="text-[11px] text-[#78716c] text-center sm:text-left">
                    <span className="font-semibold text-[#2a2b2f]">Demo & Presentation Mode:</span> Click to simulate your partner joining in real time.
                  </div>
                  <button
                    type="button"
                    onClick={() => setPartnerConnected(!partnerConnected)}
                    className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#fbf4de] text-[#B4562A] border border-[#B4562A]/30 text-xs font-serif font-medium transition-colors cursor-pointer shrink-0 shadow-2xs"
                  >
                    {partnerConnected ? "Simulate Disconnect" : `⚡ Simulate ${activePartnerBName} Connecting`}
                  </button>
                </div>
              </div>

              {/* Bottom Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentScreen(22);
                    setMode("questionnaire");
                  }}
                  className="text-xs sm:text-sm font-serif text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <SolarIcon name="arrow-left" size={14} />
                  <span>Review Profiling</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!partnerConnected) {
                      setPartnerConnected(true);
                    }
                    handleProceedToContract();
                  }}
                  className="px-6 py-3 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-xs sm:text-sm flex items-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer active:scale-95"
                >
                  <span>Proceed to Couple Contract Setup</span>
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              </div>
            </div>
          </main>

          <footer className="px-6 py-4 text-center text-[11px] text-[#8c827a] border-t border-[#eeddc8]/50">
            Seiya Secure Financial Mediator • Webank Consortium Blockchain Protocol
          </footer>
        </div>
      )}

      {/* =========================================================================
          SCREEN 7: COUPLE CONTRACT SETUP (AI SUGGESTIONS & MUTUAL AGREEMENT)
          ========================================================================= */}
      {mode === "contract-setup" && (() => {
        const ai = getAISuggestion();
        const bothSigned = contractPartnerASigned && contractPartnerBSigned;

        return (
          <div className="flex-1 flex flex-col justify-between min-h-screen bg-[#FEFBF5]">
            {/* Top Header */}
            <header className="px-6 sm:px-12 py-5 border-b border-[#eeddc8]/70 flex items-center justify-between bg-white/70 backdrop-blur-md sticky top-0 z-30">
              <div
                onClick={() => onClose && onClose()}
                className="cursor-pointer flex items-center gap-2"
              >
                <SeiyaLogo height={34} />
              </div>

              {/* Step Breadcrumbs */}
              <div className="hidden md:flex items-center gap-3 text-xs font-serif">
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[11px]">✓</span>
                  Profiling
                </span>
                <span className="text-[#c7bcb0]">→</span>
                <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[11px]">✓</span>
                  Connected
                </span>
                <span className="text-[#c7bcb0]">→</span>
                <span className="flex items-center gap-1.5 text-[#B4562A] font-bold">
                  <span className="w-5 h-5 rounded-full bg-[#B4562A] text-white flex items-center justify-center text-[11px]">3</span>
                  Couple Contract
                </span>
                <span className="text-[#c7bcb0]">→</span>
                <span className="text-[#8c827a] flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#e5ddd3] text-[#78716c] flex items-center justify-center text-[11px]">4</span>
                  Welcome
                </span>
              </div>

              {onClose ? (
                <button
                  onClick={onClose}
                  className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer"
                >
                  <SolarIcon name="close-circle" size={16} />
                  <span>Exit</span>
                </button>
              ) : (
                <div className="w-16" />
              )}
            </header>

            {/* Main Contract Editor Container */}
            <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
              {/* Header Title */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#B4562A]/10 text-[#B4562A] text-xs font-serif font-semibold border border-[#B4562A]/20">
                  <SolarIcon name="shield-check" size={15} />
                  <span>Step 3 of 4 • Smart Contract Formulation</span>
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl text-[#2a2b2f] font-normal tracking-tight">
                  Couple Financial Agreement
                </h1>
                <p className="text-xs sm:text-sm text-[#78716c] max-w-xl mx-auto leading-relaxed">
                  Based on your combined profiling answers, Seiya AI formulated the recommendations below. You can customize every parameter manually. Both of you must sign before the contract activates.
                </p>
              </div>

              {/* AI Recommendations Banner */}
              <div className="bg-[#FFF9EA] border-2 border-[#e8cba5] rounded-3xl p-6 sm:p-7 shadow-xs relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#ebd7be]">
                  <div className="flex items-center gap-3">
                    <SeiyaIcon size={38} className="shrink-0" trackCursor={true} />
                    <div>
                      <h3 className="font-serif text-base sm:text-lg text-[#2a2b2f] font-medium">
                        Seiya AI Profiling Recommendations
                      </h3>
                      <p className="text-xs text-[#8c827a]">
                        Derived from your 22 profiling data points & couple dynamics
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={applyAISuggestions}
                    className="self-start sm:self-auto px-4 py-2 rounded-xl bg-white hover:bg-[#fbf4de] text-[#B4562A] border border-[#B4562A]/40 text-xs font-serif font-medium flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <SolarIcon name="refresh" size={14} />
                    <span>Reset to AI Suggestions</span>
                  </button>
                </div>

                {/* AI Rationale Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                    <div className="flex items-center justify-between text-[#2a2b2f] font-semibold">
                      <span>Suggested Split:</span>
                      <span className="px-2 py-0.5 rounded-md bg-[#B4562A]/10 text-[#B4562A] font-bold">
                        {ai.splitA}% {activePartnerAName} : {ai.splitB}% {activePartnerBName}
                      </span>
                    </div>
                    <p className="text-[#6d6459] leading-relaxed pt-1">
                      {ai.splitRationale}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                    <div className="flex items-center justify-between text-[#2a2b2f] font-semibold">
                      <span>Dual Approval Threshold:</span>
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 font-bold">
                        ${ai.threshold} USD
                      </span>
                    </div>
                    <p className="text-[#6d6459] leading-relaxed pt-1">
                      {ai.thresholdRationale}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                    <div className="flex items-center justify-between text-[#2a2b2f] font-semibold">
                      <span>Vault Model:</span>
                      <span className="text-[#B4562A] font-bold">Hybrid Smart Vault</span>
                    </div>
                    <p className="text-[#6d6459] leading-relaxed pt-1">
                      {ai.walletRationale}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                    <div className="flex items-center justify-between text-[#2a2b2f] font-semibold">
                      <span>Late-Night Cooling Hold:</span>
                      <span className={ai.coolingOff ? "text-emerald-700 font-bold" : "text-[#78716c]"}>
                        {ai.coolingOff ? "Recommended ON" : "Optional"}
                      </span>
                    </div>
                    <p className="text-[#6d6459] leading-relaxed pt-1">
                      {ai.coolingOffRationale}
                    </p>
                  </div>
                </div>
              </div>

              {/* MANUAL EDITABLE CONTROLS SECTION */}
              <div className="space-y-6">
                <div className="flex items-center gap-2">
                  <SolarIcon name="edit" size={18} className="text-[#B4562A]" />
                  <h2 className="font-serif text-xl sm:text-2xl text-[#2a2b2f]">
                    Customize Your Terms
                  </h2>
                </div>

                {/* 1. Contribution Split (Berapa:Berapa) */}
                <div className="bg-[#FEF9E9] border border-[#eeddc8] rounded-2xl p-6 sm:p-7 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-serif text-base text-[#2a2b2f] font-semibold">
                        1. Contribution & Split Ratio
                      </h3>
                      <p className="text-xs text-[#78716c]">
                        How should shared household bills, groceries, and joint savings goals be split?
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 self-start sm:self-auto">
                      {[
                        { label: "50:50 Equal", a: 50, b: 50 },
                        { label: "60:40 Proportional", a: 60, b: 40 },
                        { label: "70:30 Supported", a: 70, b: 30 },
                      ].map((preset) => {
                        const active = contractSplitA === preset.a && contractSplitB === preset.b;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setContractSplitA(preset.a);
                              setContractSplitB(preset.b);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-colors cursor-pointer ${
                              active
                                ? "bg-[#B4562A] text-white font-medium shadow-2xs"
                                : "bg-white hover:bg-[#fbf4de] text-[#5c5349] border border-[#ded7ce]"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dual Colored Visual Bar */}
                  <div className="space-y-2">
                    <div className="h-7 rounded-full overflow-hidden flex shadow-inner border border-[#d9ccbd]">
                      <div
                        style={{ width: `${contractSplitA}%` }}
                        className="bg-[#B4562A] flex items-center justify-start px-3 text-white font-mono font-bold text-xs transition-all duration-300 truncate"
                        title={`${activePartnerAName}: ${contractSplitA}%`}
                      >
                        {activePartnerAName} ({contractSplitA}%)
                      </div>
                      <div
                        style={{ width: `${contractSplitB}%` }}
                        className="bg-[#D97706] flex items-center justify-end px-3 text-white font-mono font-bold text-xs transition-all duration-300 truncate"
                        title={`${activePartnerBName}: ${contractSplitB}%`}
                      >
                        {activePartnerBName} ({contractSplitB}%)
                      </div>
                    </div>

                    {/* Interactive Slider */}
                    <div className="pt-2">
                      <div className="flex justify-between text-xs font-semibold text-[#5c5349] mb-1">
                        <span>{activePartnerAName}: {contractSplitA}%</span>
                        <span>{activePartnerBName}: {contractSplitB}%</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="90"
                        step="5"
                        value={contractSplitA}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setContractSplitA(val);
                          setContractSplitB(100 - val);
                        }}
                        className="w-full accent-[#B4562A] cursor-pointer"
                      />
                    </div>

                    {/* Dynamic Calculation Helper */}
                    <div className="p-3 rounded-xl bg-white/70 border border-[#eeddc8] text-xs text-[#686057] flex items-center gap-2">
                      <SolarIcon name="receipt" size={16} className="text-[#B4562A] shrink-0" />
                      <span>
                        <strong className="text-[#2a2b2f]">Live Calculation:</strong> For a $1,000 monthly shared utility/rent expense: {activePartnerAName} contributes <strong>${((1000 * contractSplitA) / 100).toFixed(0)}</strong> and {activePartnerBName} contributes <strong>${((1000 * contractSplitB) / 100).toFixed(0)}</strong>.
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Dual-Approval Threshold */}
                <div className="bg-[#FEF9E9] border border-[#eeddc8] rounded-2xl p-6 sm:p-7 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-serif text-base text-[#2a2b2f] font-semibold">
                        2. Dual-Approval Spending Threshold
                      </h3>
                      <p className="text-xs text-[#78716c]">
                        Any purchase or transfer from the shared vault above this limit requires mutual digital consent.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[100, 250, 500, 1000, 2500].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setContractThreshold(amt)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-colors cursor-pointer ${
                            contractThreshold === amt
                              ? "bg-[#B4562A] text-white font-medium shadow-2xs"
                              : "bg-white hover:bg-[#fbf4de] text-[#5c5349] border border-[#ded7ce]"
                          }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8c827a]">
                        USD $
                      </span>
                      <input
                        type="number"
                        min="50"
                        step="50"
                        value={contractThreshold}
                        onChange={(e) => setContractThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full pl-16 pr-4 py-2.5 rounded-xl border border-[#ded7ce] bg-white font-mono font-bold text-sm text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A]"
                      />
                    </div>
                    <span className="text-xs text-[#78716c]">
                      Transactions below this amount can be spent autonomously from shared funds.
                    </span>
                  </div>
                </div>

                {/* 3. Shared Vault Architecture */}
                <div className="bg-[#FEF9E9] border border-[#eeddc8] rounded-2xl p-6 sm:p-7 space-y-4">
                  <div>
                    <h3 className="font-serif text-base text-[#2a2b2f] font-semibold">
                      3. Shared Vault Architecture
                    </h3>
                    <p className="text-xs text-[#78716c]">
                      Determine the boundary between your private allowances and shared household funds.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      {
                        id: "hybrid" as const,
                        title: "Hybrid Smart Vault",
                        tag: "AI Recommended",
                        desc: "Joint pool for shared bills and couple goals. Discretionary spending remains completely private in personal accounts.",
                      },
                      {
                        id: "pooled" as const,
                        title: "Fully Pooled Vault",
                        tag: "Traditional Joint",
                        desc: "100% of income flows into unified shared accounts with total mutual visibility over all transactions.",
                      },
                      {
                        id: "goals-only" as const,
                        title: "Goal-Only Pool",
                        tag: "Milestones Only",
                        desc: "Only joint savings milestones (home downpayment, wedding, vacation) are pooled. Living expenses remain separate.",
                      },
                    ].map((model) => {
                      const active = contractWalletMode === model.id;
                      return (
                        <div
                          key={model.id}
                          onClick={() => setContractWalletMode(model.id)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all ${
                            active
                              ? "bg-white border-[#B4562A] ring-2 ring-[#B4562A]/20 shadow-xs"
                              : "bg-white/60 hover:bg-white border-[#ded7ce]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-serif font-semibold text-xs sm:text-sm text-[#2a2b2f]">
                              {model.title}
                            </span>
                            {model.tag === "AI Recommended" ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#B4562A]/10 text-[#B4562A] font-medium">
                                {model.tag}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-[#6d6459] leading-relaxed">
                            {model.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Smart Safeguards Setup */}
                <div className="bg-[#FEF9E9] border border-[#eeddc8] rounded-2xl p-6 sm:p-7 space-y-4">
                  <div>
                    <h3 className="font-serif text-base text-[#2a2b2f] font-semibold">
                      4. Smart Safeguards & Rule Triggers
                    </h3>
                    <p className="text-xs text-[#78716c]">
                      Algorithmic guardrails to keep spending healthy and stress-free.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {/* Safeguard 1: Late-night cooling off */}
                    <div className="p-3.5 rounded-xl bg-white border border-[#eeddc8] flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-medium text-xs sm:text-sm text-[#2a2b2f]">
                            Late-Night Impulse Cooling-Off Rule
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-sans">
                            10 PM - 6 AM
                          </span>
                        </div>
                        <p className="text-[11px] text-[#78716c]">
                          Non-essential online purchases above $100 hold for 6 hours unless explicitly approved by your partner.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={contractCoolingOff}
                        onChange={(e) => setContractCoolingOff(e.target.checked)}
                        className="w-5 h-5 accent-[#B4562A] cursor-pointer"
                      />
                    </div>

                    {/* Safeguard 2: Emergency reserve lock */}
                    <div className="p-3.5 rounded-xl bg-white border border-[#eeddc8] flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <span className="font-serif font-medium text-xs sm:text-sm text-[#2a2b2f]">
                          Emergency Reserve Vault Double-Lock
                        </span>
                        <p className="text-[11px] text-[#78716c]">
                          Requires both partners&apos; cryptographic PINs or biometrics before any emergency reserve fund withdrawal.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={contractEmergencyLock}
                        onChange={(e) => setContractEmergencyLock(e.target.checked)}
                        className="w-5 h-5 accent-[#B4562A] cursor-pointer"
                      />
                    </div>

                    {/* Safeguard 3: Approve every shared purchase */}
                    <div className="p-3.5 rounded-xl bg-white border border-[#eeddc8] flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <span className="font-serif font-medium text-xs sm:text-sm text-[#2a2b2f]">
                          Require Approval for Every Shared Purchase
                        </span>
                        <p className="text-[11px] text-[#78716c]">
                          Bypasses the threshold and requires two signatures for every single shared expense.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={contractApproveEveryShared}
                        onChange={(e) => setContractApproveEveryShared(e.target.checked)}
                        className="w-5 h-5 accent-[#B4562A] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* MUTUAL CONSENT & DUAL SIGNATURES (Jika keduanya sudah setuju) */}
              <div className="bg-[#FFF9EA] border-2 border-[#e8cba5] rounded-3xl p-6 sm:p-8 space-y-6">
                <div className="text-center space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#B4562A]/10 text-[#B4562A] text-xs font-serif font-bold">
                    <SolarIcon name="lock-keyhole" size={14} />
                    <span>Mutual Consent Protocol</span>
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl text-[#2a2b2f]">
                    Dual Agreement & Digital Signatures
                  </h3>
                  <p className="text-xs text-[#78716c] max-w-lg mx-auto">
                    Under Webank smart contract governance, changes or initial activations require the explicit cryptographic consent of <strong>both partners</strong>.
                  </p>
                </div>

                {/* Two Partner Signatures Side-by-Side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Signature 1: Partner A (You) */}
                  <div className={`p-5 rounded-2xl border transition-all ${
                    contractPartnerASigned
                      ? "bg-emerald-50/80 border-emerald-300"
                      : "bg-white border-[#eeddc8]"
                  }`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-[#B4562A]/15 text-[#B4562A] flex items-center justify-center font-serif font-bold">
                        {activePartnerAName.charAt(0) || "R"}
                      </div>
                      <div>
                        <div className="font-serif font-semibold text-sm text-[#2a2b2f]">
                          {activePartnerAName}
                        </div>
                        <div className="text-[11px] text-[#8c827a]">
                          Space Creator (You)
                        </div>
                      </div>
                    </div>

                    {contractPartnerASigned ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-2 rounded-xl">
                          <SolarIcon name="check-circle" size={16} />
                          <span>Signed by {activePartnerAName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setContractPartnerASigned(false)}
                          className="w-full text-center text-[11px] text-[#8c827a] hover:text-red-700 underline cursor-pointer"
                        >
                          Revoke signature to edit
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setContractPartnerASigned(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        <SolarIcon name="shield-check" size={15} />
                        <span>Sign as {activePartnerAName}</span>
                      </button>
                    )}
                  </div>

                  {/* Signature 2: Partner B (Partner) */}
                  <div className={`p-5 rounded-2xl border transition-all ${
                    contractPartnerBSigned
                      ? "bg-emerald-50/80 border-emerald-300"
                      : "bg-white border-[#eeddc8]"
                  }`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-serif font-bold">
                        {activePartnerBName.charAt(0) || "D"}
                      </div>
                      <div>
                        <div className="font-serif font-semibold text-sm text-[#2a2b2f]">
                          {activePartnerBName}
                        </div>
                        <div className="text-[11px] text-[#8c827a]">
                          Partner (Co-Owner)
                        </div>
                      </div>
                    </div>

                    {contractPartnerBSigned ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-2 rounded-xl">
                          <SolarIcon name="check-circle" size={16} />
                          <span>Signed by {activePartnerBName}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setContractPartnerBSigned(false)}
                          className="w-full text-center text-[11px] text-[#8c827a] hover:text-red-700 underline cursor-pointer"
                        >
                          Revoke signature to edit
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setContractPartnerBSigned(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-serif text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
                      >
                        <SolarIcon name="shield-check" size={15} />
                        <span>Sign as {activePartnerBName} (Simulate)</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Ratification Status Banner */}
                <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs ${
                  bothSigned
                    ? "bg-emerald-100/70 text-emerald-900 border border-emerald-300"
                    : "bg-amber-50 text-amber-900 border border-amber-200"
                }`}>
                  <div className="flex items-center gap-2">
                    <SolarIcon
                      name={bothSigned ? "check-circle" : "danger-triangle"}
                      size={18}
                      className={bothSigned ? "text-emerald-700" : "text-amber-700"}
                    />
                    <span>
                      {bothSigned
                        ? "✨ Both partners have verified and signed this contract! Consensus reached."
                        : `⚠️ Waiting for mutual signatures (${(contractPartnerASigned ? 1 : 0) + (contractPartnerBSigned ? 1 : 0)} of 2 signed). Both must sign to ratify.`}
                    </span>
                  </div>

                  {!bothSigned && (
                    <button
                      type="button"
                      onClick={() => {
                        setContractPartnerASigned(true);
                        setContractPartnerBSigned(true);
                      }}
                      className="text-[11px] font-serif underline text-[#B4562A] hover:text-[#9c4820] shrink-0 cursor-pointer"
                    >
                      Sign Both (Fast Demo)
                    </button>
                  )}
                </div>
              </div>

              {/* Bottom Navigation & Ratify CTA */}
              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setMode("connect-partner")}
                  className="text-xs sm:text-sm font-serif text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <SolarIcon name="arrow-left" size={14} />
                  <span>Back to Partner Connect</span>
                </button>

                <button
                  type="button"
                  disabled={!bothSigned}
                  onClick={handleRatifyContract}
                  className={`px-8 py-3.5 rounded-full font-serif text-sm flex items-center gap-2 transition-all ${
                    bothSigned
                      ? "bg-[#B4562A] hover:bg-[#9c4820] text-white shadow-lg hover:shadow-xl cursor-pointer active:scale-95"
                      : "bg-[#e5ddd3] text-[#8c827a] cursor-not-allowed opacity-60"
                  }`}
                >
                  <span>Ratify & Activate Couple Contract</span>
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </button>
              </div>
            </main>

            <footer className="px-6 py-4 text-center text-[11px] text-[#8c827a] border-t border-[#eeddc8]/50">
              Webank Smart Contract Standard • Dual Key Cryptographic Ratification
            </footer>
          </div>
        );
      })()}

      {/* =========================================================================
          SCREEN 8: CELEBRATORY WELCOMING SCREEN (RATIFIED CONTRACT & ENTRY)
          ========================================================================= */}
      {mode === "welcoming" && (
        <div className="flex-1 flex flex-col justify-between min-h-screen bg-[#FEFBF5]">
          {/* Top Header */}
          <header className="px-6 sm:px-12 py-5 border-b border-[#eeddc8]/70 flex items-center justify-between bg-white/70 backdrop-blur-md sticky top-0 z-30">
            <div
              onClick={() => onClose && onClose()}
              className="cursor-pointer flex items-center gap-2"
            >
              <SeiyaLogo height={34} />
            </div>

            {/* Step Breadcrumbs */}
            <div className="hidden md:flex items-center gap-3 text-xs font-serif">
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[11px]">✓</span>
                Profiling
              </span>
              <span className="text-[#c7bcb0]">→</span>
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[11px]">✓</span>
                Connected
              </span>
              <span className="text-[#c7bcb0]">→</span>
              <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-[11px]">✓</span>
                Contract Ratified
              </span>
              <span className="text-[#c7bcb0]">→</span>
              <span className="flex items-center gap-1.5 text-[#B4562A] font-bold">
                <span className="w-5 h-5 rounded-full bg-[#B4562A] text-white flex items-center justify-center text-[11px]">4</span>
                Welcome
              </span>
            </div>

            {onClose ? (
              <button
                onClick={onClose}
                className="text-xs text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span>Exit</span>
              </button>
            ) : (
              <div className="w-16" />
            )}
          </header>

          {/* Celebratory Hero & Certificate */}
          <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col justify-center space-y-8 text-center">
            {/* Header Celebration */}
            <div className="space-y-3">
              <h1 className="font-serif text-3xl sm:text-5xl text-[#2a2b2f] font-normal tracking-tight">
                Welcome to Seiya, {activePartnerAName} & {activePartnerBName}!
              </h1>
              <p className="text-xs sm:text-sm text-[#78716c] max-w-lg mx-auto leading-relaxed">
                Your shared financial space is officially open. You have established a transparent, equitable foundation that protects personal autonomy and elevates couple goals.
              </p>
            </div>

            {/* Official Ratified Contract Certificate Card */}
            <div className="bg-[#FEF9E9] border-2 border-[#d4af37]/60 rounded-3xl p-6 sm:p-8 shadow-xl text-left space-y-6 relative overflow-hidden">
              {/* Subtle Watermark Stamp */}
              <div className="absolute right-4 bottom-4 opacity-5 pointer-events-none">
                <SolarIcon name="shield-check" size={160} />
              </div>

              {/* Certificate Header */}
              <div className="flex items-center justify-between border-b border-[#ebd7be] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 text-[#a37f14] flex items-center justify-center">
                    <SolarIcon name="shield-check" size={24} />
                  </div>
                  <div>
                    <h3 className="font-serif text-base font-bold text-[#2a2b2f] tracking-wide">
                      COUPLE FINANCIAL ACCORD CERTIFICATE
                    </h3>
                    <p className="text-[11px] font-mono text-[#8c827a]">
                      CONTRACT #SEIYA-2026-MUTUAL-ACCORD • WEBANK BLOCKCHAIN
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                  STATUS: ACTIVE
                </span>
              </div>

              {/* Certificate Key Terms Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                  <span className="text-[#8c827a] font-serif">Contribution & Split Ratio:</span>
                  <div className="font-mono font-bold text-sm text-[#2a2b2f]">
                    {contractSplitA}% {activePartnerAName} : {contractSplitB}% {activePartnerBName}
                  </div>
                  <p className="text-[11px] text-[#6d6459]">
                    Shared expenses & goals allocated according to this mutual ratio.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                  <span className="text-[#8c827a] font-serif">Dual-Approval Threshold:</span>
                  <div className="font-mono font-bold text-sm text-[#2a2b2f]">
                    ${contractThreshold} {contractCurrency}
                  </div>
                  <p className="text-[11px] text-[#6d6459]">
                    Purchases exceeding this require both digital signatures.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                  <span className="text-[#8c827a] font-serif">Vault Architecture:</span>
                  <div className="font-serif font-bold text-sm text-[#2a2b2f]">
                    {contractWalletMode === "hybrid"
                      ? "Hybrid Smart Vault"
                      : contractWalletMode === "pooled"
                      ? "Fully Pooled Vault"
                      : "Goal-Only Shared Pool"}
                  </div>
                  <p className="text-[11px] text-[#6d6459]">
                    Personal accounts remain private; joint goals unified.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                  <span className="text-[#8c827a] font-serif">Active Safeguards:</span>
                  <div className="space-y-1 text-[11px] text-[#2a2b2f] pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-700">✓</span>
                      <span>{contractCoolingOff ? "Late-Night Cooling Hold (Active)" : "Cooling Hold (Off)"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-700">✓</span>
                      <span>{contractEmergencyLock ? "Emergency Reserve Double-Lock (Active)" : "Standard Emergency"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verified Signatures Seal */}
              <div className="pt-2 border-t border-[#ebd7be] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-800">
                  <SolarIcon name="check-circle" size={16} />
                  <span>
                    Ratified by <strong>{activePartnerAName}</strong> & <strong>{activePartnerBName}</strong>
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#8c827a]">
                  Cryptographic Hash: 0x7F3...9E2A (Consensus Verified)
                </div>
              </div>
            </div>

            {/* Mascot Greeting */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-5 rounded-2xl bg-white/70 border border-[#eeddc8] text-left">
              <div className="w-16 h-16 relative shrink-0">
                <Image
                  src="/images/auth/auth-mascot.png"
                  alt="Seiya Financial Mediator"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="space-y-1 text-center sm:text-left">
                <div className="font-serif font-bold text-sm text-[#2a2b2f]">
                  Meet Seiya, your AI mediator:
                </div>
                <p className="text-xs text-[#686057] leading-relaxed">
                  &ldquo;I&apos;m here to keep your joint finances frictionless! I will track your budget, flag milestone achievements, and mediate any spending questions with complete neutrality.&rdquo;
                </p>
              </div>
            </div>

            {/* Final CTA Button to Enter Home */}
            <div className="pt-4 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={handleEnterHome}
                className="px-10 py-4 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-base shadow-xl hover:shadow-2xl transition-all cursor-pointer active:scale-95 flex items-center gap-3"
              >
                <span>Enter Home Dashboard</span>
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
              <span className="text-[11px] text-[#8c827a]">
                You will be signed in as {activePartnerAName} with instant switch to {activePartnerBName}.
              </span>
            </div>
          </main>

          <footer className="px-6 py-4 text-center text-[11px] text-[#8c827a] border-t border-[#eeddc8]/50">
            Seiya Finance • Collaborative Wealth Management for Couples
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
