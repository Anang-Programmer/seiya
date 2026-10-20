"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { SeiyaLogo, SeiyaIcon } from "@/components/icons/seiya-logo";
import { SolarIcon } from "@/components/icons/solar";
import { Button } from "@/components/ui/button";
import { useApp, UserRole } from "@/lib/store";
// Amounts here are decided on, so they stay visible in privacy mode.
import { convertAmount, formatMoneyAlways as formatMoney, formatMoneyConvertedAlways as formatMoneyConverted } from "@/lib/utils";
import {
  apiAcceptInvitation,
  apiCreateHousehold,
  apiGetPromise,
  apiInvitePartner,
  apiSaveOnboarding,
  apiSignIn,
  apiSignUp,
  apiSubmitPromiseResponse,
  type PromiseClause,
  type PromiseStatus,
} from "@/lib/api";
import { clearPendingInvite, extractInviteToken, readPendingInvite } from "@/lib/invite";
import { rulesFromContract } from "@/lib/transformers";
import {
  COUNTRY_OPTIONS,
  countryForCurrency,
  detectCountry,
  discussThresholdPresets,
  findCountry,
  formatWholeAmount,
  type CountryOption,
} from "@/lib/country-currency";
import {
  BackLink,
  ClauseCard,
  CoupleHeader,
  FigmaCard,
  LockNotice,
  OnboardingBanner,
  PersonRow,
  PrimaryButton,
  StatusBadge,
  WriteOwnClauseButton,
} from "@/components/onboarding/promise-ui";

// Screen-jumping review tools are only available when explicitly enabled.
const DEMO_SIMULATION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATION === "true";

// WeChat brand mark (green chat bubbles). Login with WeChat is shown as UI only.
function WeChatLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#07C160"
        d="M9.1 3.5C4.9 3.5 1.5 6.3 1.5 9.8c0 2 1.1 3.8 2.9 5l-.7 2.3 2.6-1.4c.9.3 1.8.4 2.8.4h.6a5.6 5.6 0 0 1-.2-1.5c0-3.4 3.3-6.1 7.3-6.1h.6c-.7-2.9-3.9-5-7.6-5zM6.6 8.6a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9zm5 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9zm10.9 6c0-2.9-2.9-5.2-6.4-5.2s-6.4 2.3-6.4 5.2 2.9 5.2 6.4 5.2c.7 0 1.4-.1 2.1-.3l2 1.1-.5-1.9c1.7-1 2.8-2.4 2.8-4.1zm-8.6-.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zm4.4 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6z"
      />
    </svg>
  );
}

// Rounds converted preset amounts to two significant digits (e.g. 7,834,120 -> 7,800,000).
function niceRound(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(value)) - 1));
  return Math.round(value / magnitude) * magnitude;
}

// Maps the 21 profiling answers onto the backend onboarding schema.
function scaleTo5(value: number) {
  return Math.min(5, Math.max(1, Math.round(1 + ((value - 1) * 4) / 10)));
}

export type AuthMode =
  | "login"
  | "register"
  | "choose-path"
  | "join-space"
  | "story-intro"
  | "questionnaire"
  | "connect-partner"
  | "contract-setup"
  | "welcoming";

interface AuthViewProps {
  initialMode?: AuthMode;
  /** Questionnaire screen to open on (e.g. 24 = couple setup for Seiya's Promise). */
  initialScreen?: number;
  onSuccess?: (persona?: UserRole) => void;
  onClose?: () => void;
}

export function AuthView({
  initialMode = "login",
  initialScreen,
  onSuccess,
  onClose,
}: AuthViewProps) {
  const {
    partnerAName,
    partnerBName,
    setPartnerNames,
    reportingCurrency,
    locale,
    activateInitialContract,
    authUser,
    household,
    partnerProfile,
    myRole,
    contract,
    contractMeta,
    refreshSession,
    refreshData,
    setReportingCurrency,
  } = useApp();
  const [mode, setMode] = useState<AuthMode>(initialMode);

  // Form states (Login & Register)
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // "Continue with WeChat" is UI only for now: it opens a "coming soon" sheet.
  const [showWechatSheet, setShowWechatSheet] = useState(false);

  // Dynamic names: once signed in they come from the household (owner = partner A).
  const activePartnerAName = authUser ? partnerAName : fullName.trim() || partnerAName;
  const activePartnerBName = partnerBName;
  const myDisplayName = myRole === "partner_a" ? activePartnerAName : activePartnerBName;
  const otherDisplayName = myRole === "partner_a" ? activePartnerBName : activePartnerAName;

  // Post-Profiling & Couple Setup Screens 22-26 States (PDF Flow)
  const [invitedPartnerName, setInvitedPartnerName] = useState<string>(() => partnerProfile?.fullName ?? "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [isSavingTerms, setIsSavingTerms] = useState(false);
  // Recent expenses the user types in during onboarding (screen 24).
  const [recentTransactions, setRecentTransactions] = useState<
    { id: string; merchant: string; amount: number; category: string; date: string }[]
  >([]);
  const [newTxMerchant, setNewTxMerchant] = useState("");
  const [newTxAmount, setNewTxAmount] = useState("");
  const [newTxCategory, setNewTxCategory] = useState("Groceries");
  const [showAddTxForm, setShowAddTxForm] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [showCertificateDetail, setShowCertificateDetail] = useState(false);

  // Join Space Invite Code Modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState(() => readPendingInvite() ?? "");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // Choose Your Path selection state ("create" | "join" | null)
  const [selectedPath, setSelectedPath] = useState<"create" | "join" | null>(null);
  // Card under the pointer gets the terracotta highlight (Create by default).
  const [hoveredPath, setHoveredPath] = useState<"create" | "join" | null>(null);

  // =========================================================================
  // SEIYA'S PROMISE (Figma Component 1: summary -> history -> couple setup ->
  // promise draft -> mutual agreement). Recommendations wait for both partners.
  // =========================================================================
  const [createdHouseholdId, setCreatedHouseholdId] = useState<string | null>(null);
  const activeHouseholdId = household?.id ?? createdHouseholdId;
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [promiseStatus, setPromiseStatus] = useState<PromiseStatus | null>(null);
  const [promiseUserId, setPromiseUserId] = useState<string | null>(null);
  const [promiseError, setPromiseError] = useState("");
  const [draftClauses, setDraftClauses] = useState<PromiseClause[]>([]);
  const [selectedClauseIds, setSelectedClauseIds] = useState<string[]>([]);
  const [isSavingPromise, setIsSavingPromise] = useState(false);
  const promisePollInFlight = useRef(false);
  const seededPromiseId = useRef<string | null>(null);

  // =========================================================================
  // PARTNER PAIRING & CONNECT CODE STATES
  // =========================================================================
  // Pairing status comes from the backend; the store polls until the partner joins.
  const partnerConnected = Boolean(partnerProfile);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // =========================================================================
  // COUPLE CONTRACT SETUP STATES (With AI Suggestions & Manual Editing)
  // =========================================================================
  const [contractSplitA, setContractSplitA] = useState<number>(60);
  const [contractSplitB, setContractSplitB] = useState<number>(40);
  // Contract amounts are in the household's base currency; AI presets are defined in USD.
  const contractCurrency = household?.baseCurrency ?? reportingCurrency;
  const toLocalAmount = (usd: number) => niceRound(convertAmount(usd, "USD", contractCurrency));
  const [contractThreshold, setContractThreshold] = useState<number>(() => toLocalAmount(500));
  const [contractWalletMode, setContractWalletMode] = useState<"hybrid" | "pooled" | "goals-only">("hybrid");
  const [contractCoolingOff, setContractCoolingOff] = useState<boolean>(true);
  const [contractEmergencyLock, setContractEmergencyLock] = useState<boolean>(true);
  const [contractApproveEveryShared, setContractApproveEveryShared] = useState<boolean>(false);
  // Signatures are read from the finance-rule approvals; the proposer signs implicitly.
  const partnerRole: UserRole = myRole === "partner_a" ? "partner_b" : "partner_a";
  const mySigned =
    contractMeta.hasActiveRule || (Boolean(contractMeta.pendingRuleId) && !contractMeta.pendingNeedsMyApproval);
  const partnerSigned =
    contractMeta.hasActiveRule ||
    (Boolean(contractMeta.pendingRuleId) && contract.proposedChange?.proposedBy === partnerRole);
  const contractPartnerASigned = myRole === "partner_a" ? mySigned : partnerSigned;
  const contractPartnerBSigned = myRole === "partner_b" ? mySigned : partnerSigned;
  const [isSigning, setIsSigning] = useState(false);
  const [contractError, setContractError] = useState("");
  const [aiApplied, setAiApplied] = useState<boolean>(false);

  // =========================================================================
  // PROFILING QUESTIONNAIRE STATES (Figma 472:8257 - 22 Screens in 7 Steps)
  // =========================================================================
  const [currentScreen, setCurrentScreen] = useState<number>(initialScreen ?? 1);
  // Furthest profiling screen reached; later steps stay locked until then.
  // Opened from the dashboard (initialScreen >= 22): the saved profile is not
  // loaded into this form, so profiling steps stay locked instead of showing
  // blank answers that would overwrite it when saved again.
  const openedFromDashboard = (initialScreen ?? 0) >= 22;
  const [furthestScreen, setFurthestScreen] = useState<number>(openedFromDashboard ? 0 : initialScreen ?? 1);

  // Screen 1: Relationship Status
  const [relationshipStatus, setRelationshipStatus] = useState<string>("");
  // Screen 2: Relationship Duration
  const [relationshipDuration, setRelationshipDuration] = useState<string>("");
  // Screen 3: Relationship Plans
  const [relationshipPlans, setRelationshipPlans] = useState<string>("");
  // Screen 4: Help Family
  const [helpFamily, setHelpFamily] = useState<string>("");
  // Screen 5: Income Type
  const [incomeType, setIncomeType] = useState<string>("");

  // Screen 6: Spend difficulty (1..11)
  const [spendDifficultyAnswer, setSpendDifficulty] = useState<number | null>(null);
  const spendDifficulty = spendDifficultyAnswer ?? 6;
  // Screen 7: Hold back need (1..11)
  const [holdBackNeedAnswer, setHoldBackNeed] = useState<number | null>(null);
  const holdBackNeed = holdBackNeedAnswer ?? 5;
  // Screen 8: Impulse buy (1..11)
  const [impulseBuyAnswer, setImpulseBuy] = useState<number | null>(null);
  const impulseBuy = impulseBuyAnswer ?? 4;
  // Screen 9: Spending regret (1..11)
  const [spendingRegretAnswer, setSpendingRegret] = useState<number | null>(null);
  const spendingRegret = spendingRegretAnswer ?? 4;

  // Screen 10: Childhood money
  const [childhoodMoney, setChildhoodMoney] = useState<string>("");
  // Screen 11: Money meaning
  const [moneyMeaning, setMoneyMeaning] = useState<string>("");
  // Screen 12: Windfall tendency
  const [windfallTendency, setWindfallTendency] = useState<string>("");

  // Screen 13: Biggest goal
  const [biggestGoal, setBiggestGoal] = useState<string>("");
  // Screen 14: Goal emotion
  const [goalEmotion, setGoalEmotion] = useState<string>("");
  // Screen 15: Goal alignment confidence (1..5)
  const [goalAlignmentConfidenceAnswer, setGoalAlignmentConfidence] = useState<number | null>(null);
  const goalAlignmentConfidence = goalAlignmentConfidenceAnswer ?? 4;

  // Screen 16: Money management now
  const [moneyManagementNow, setMoneyManagementNow] = useState<string>("");
  // Screen 17: Purchases threshold to discuss
  // Amounts follow the user's country (detected from the browser, changeable);
  // a partner who joins uses the shared space's currency.
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(() =>
    household
      ? findCountry(household.country) ?? countryForCurrency(household.baseCurrency)
      : detectCountry()
  );
  const questionCurrency = household?.baseCurrency ?? selectedCountry.currency;
  // One round reference amount per currency (e.g. Rp 1.000.000). "Less than"
  // starts the rule lower (discuss smaller purchases too); "More than" starts
  // it at the reference amount.
  const [lowerPreset, referencePreset] = discussThresholdPresets(questionCurrency);
  const referenceLabel = formatWholeAmount(referencePreset, questionCurrency, selectedCountry.locale);
  const thresholdPresets = [lowerPreset, referencePreset];
  const thresholdLabels = [`Less than ${referenceLabel}`, `More than ${referenceLabel}`];
  // Index into thresholdPresets; null = "Not sure yet", undefined = not answered.
  const [discussionThresholdIndex, setDiscussionThresholdIndex] = useState<number | null | undefined>(undefined);
  const chooseCountry = (code: string) => {
    const next = findCountry(code);
    if (!next) return;
    setSelectedCountry(next);
    setReportingCurrency(next.currency);
  };
  // Screen 18: Discussion channel
  const [discussionChannel, setDiscussionChannel] = useState<string>("");

  // Screen 19: Shared data categories (multiselect)
  const [sharedDataCategories, setSharedDataCategories] = useState<string[]>([]);

  // Screen 20: Financial freedom
  const [financialFreedom, setFinancialFreedom] = useState<string>("");
  // Screen 21: Partner money style guess (1..11)
  const [partnerMoneyStyleGuessAnswer, setPartnerMoneyStyleGuess] = useState<number | null>(null);
  const partnerMoneyStyleGuess = partnerMoneyStyleGuessAnswer ?? 6;

  // Dual partner signatures for completion
  const [partnerASigned, setPartnerASigned] = useState<boolean>(true);
  const [partnerBSigned, setPartnerBSigned] = useState<boolean>(true);
  const canActivate = partnerASigned && partnerBSigned;

  const errorText = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

  // ---------------------------------------------------------------------------
  // Seiya's Promise: status polling, draft editing and agreement
  // ---------------------------------------------------------------------------
  const myUserId = promiseUserId ?? authUser?.id ?? null;
  const promiseMembers = promiseStatus?.members ?? [];
  const meProgress = promiseMembers.find((m) => m.user_id === myUserId) ?? null;
  const partnerProgress = promiseMembers.find((m) => m.user_id !== myUserId) ?? null;
  const meDone = Boolean(meProgress?.onboarding_done && meProgress?.history_done);
  const partnerDone = Boolean(partnerProgress?.onboarding_done && partnerProgress?.history_done);
  const promisePartnerName =
    partnerProgress?.full_name || partnerProfile?.fullName || invitedPartnerName.trim() || "Your partner";
  const myResponse = promiseStatus?.responses.find((r) => r.user_id === myUserId) ?? null;
  const partnerResponse = promiseStatus?.responses.find((r) => r.user_id !== myUserId) ?? null;
  const promiseActive = promiseStatus?.promise?.status === "active";
  const isHouseholdCreator = household ? myRole === "partner_a" : selectedPath !== "join";
  const promiseCurrency = questionCurrency;

  const loadPromise = useCallback(async (hid: string) => {
    if (promisePollInFlight.current) return;
    promisePollInFlight.current = true;
    try {
      const res = await apiGetPromise(hid);
      setPromiseUserId(res.myUserId);
      setPromiseStatus(res.status);
      setPromiseError("");
      // Seed the editable draft once per promise: my saved version, else Seiya's.
      const promise = res.status.promise;
      if (promise && seededPromiseId.current !== promise.id) {
        seededPromiseId.current = promise.id;
        const mine = res.status.responses.find((r) => r.user_id === res.myUserId);
        const base = promise.clauses.map((c) => mine?.selected.find((m) => m.id === c.id) ?? c);
        const extra = (mine?.selected ?? []).filter((m) => !promise.clauses.some((c) => c.id === m.id));
        setDraftClauses([...base, ...extra]);
        setSelectedClauseIds(mine ? mine.selected.map((c) => c.id) : []);
      }
    } catch (error) {
      setPromiseError(error instanceof Error && error.message ? error.message : "Unable to load your couple status.");
    } finally {
      promisePollInFlight.current = false;
    }
  }, []);

  // Poll while either partner is still filling in, drafting or agreeing.
  const onPromiseScreens = mode === "questionnaire" && currentScreen >= 24;
  useEffect(() => {
    if (!onPromiseScreens || !activeHouseholdId) return;
    const first = window.setTimeout(() => void loadPromise(activeHouseholdId), 0);
    const timer = promiseActive ? null : window.setInterval(() => void loadPromise(activeHouseholdId), 5000);
    return () => {
      window.clearTimeout(first);
      if (timer) window.clearInterval(timer);
    };
  }, [onPromiseScreens, activeHouseholdId, promiseActive, loadPromise]);

  const clauseSignature = (c: PromiseClause) =>
    JSON.stringify([
      c.title.trim(),
      c.description.trim(),
      c.seiyaWill.trim(),
      c.params?.ownerPercent ?? null,
      c.params?.threshold ?? null,
      c.params?.hours ?? null,
    ]);
  const partnerClauseById = new Map((partnerResponse?.selected ?? []).map((c) => [c.id, c]));

  const toggleClause = (id: string) =>
    setSelectedClauseIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const updateClause = (next: PromiseClause) =>
    setDraftClauses((prev) => prev.map((c) => (c.id === next.id ? next : c)));
  const addOwnClause = () => {
    const id = `custom-${Date.now().toString(36)}`;
    setDraftClauses((prev) => [
      ...prev,
      { id, kind: "custom", category: "Your own clause", title: "", description: "", seiyaWill: "" },
    ]);
    setSelectedClauseIds((prev) => [...prev, id]);
  };
  const removeOwnClause = (id: string) => {
    setDraftClauses((prev) => prev.filter((c) => c.id !== id));
    setSelectedClauseIds((prev) => prev.filter((x) => x !== id));
  };
  // Negotiation shortcut: take over the partner's saved version as-is.
  const adoptPartnerVersion = () => {
    if (!partnerResponse) return;
    setDraftClauses((prev) => {
      const merged = prev.map((c) => partnerClauseById.get(c.id) ?? c);
      const extra = partnerResponse.selected.filter((p) => !prev.some((c) => c.id === p.id));
      return [...merged, ...extra];
    });
    setSelectedClauseIds(partnerResponse.selected.map((c) => c.id));
  };

  const recentExpensesPayload = () =>
    recentTransactions
      .filter((t) => t.merchant.trim() && t.amount > 0)
      .slice(0, 20)
      .map((t) => ({
        merchant: t.merchant.trim().slice(0, 120),
        amount: Math.round(t.amount * 100) / 100,
        category: (t.category || "Others").slice(0, 60),
        date: t.date ? t.date.slice(0, 40) : null,
      }));

  // Transaction history "Save History" / "Skip": completes my side of onboarding.
  const handleSaveHistory = async () => {
    if (isSavingHistory) return;
    setHistoryError("");
    setIsSavingHistory(true);
    try {
      const payload = buildOnboardingPayload();
      await apiSaveOnboarding(payload.profile, {
        ...payload.answers,
        recentExpenses: recentExpensesPayload(),
        historyCompleted: true,
      });
      if (isHouseholdCreator) {
        const hid = await ensureHousehold();
        setCreatedHouseholdId(hid);
      }
      setCurrentScreen(24);
    } catch (error) {
      setHistoryError(errorText(error, "Unable to save your history. Please try again."));
    } finally {
      setIsSavingHistory(false);
    }
  };

  const handleSavePromise = async () => {
    if (!activeHouseholdId || isSavingPromise) return;
    setPromiseError("");
    const selected = draftClauses
      .filter((c) => selectedClauseIds.includes(c.id))
      .map((c) => ({
        ...c,
        title: c.title.trim(),
        description: c.description.trim(),
        seiyaWill: c.seiyaWill.trim(),
        category: c.category.trim() || "Your own clause",
      }));
    if (selected.length === 0) {
      setPromiseError("Select at least one clause.");
      return;
    }
    if (selected.some((c) => !c.title)) {
      setPromiseError("Every selected clause needs an agreement sentence.");
      return;
    }
    const missingNumber = selected.find(
      (c) =>
        (c.kind === "cost_sharing" && c.params?.ownerPercent === undefined) ||
        ((c.kind === "discuss_first" || c.kind === "cooling_off") && c.params?.threshold === undefined)
    );
    if (missingNumber) {
      setPromiseError(`Fill in the amount for "${missingNumber.category}".`);
      return;
    }
    setIsSavingPromise(true);
    try {
      const res = await apiSubmitPromiseResponse(activeHouseholdId, selected);
      setPromiseUserId(res.myUserId);
      setPromiseStatus(res.status);
      if (res.outcome === "active") await refreshData();
      setCurrentScreen(26);
    } catch (error) {
      setPromiseError(errorText(error, "Unable to save your clauses. Please try again."));
    } finally {
      setIsSavingPromise(false);
    }
  };

  const handleEnterDashboard = async () => {
    await refreshData();
    if (onSuccess) onSuccess(myRole);
  };

  // Handle Login submission (Supabase Auth via /api/auth/signin)
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setAuthError("");
    setAuthNotice("");

    if (fullName.trim().length < 2 || !password) {
      setAuthError("Please enter your full name and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiSignIn(fullName.trim(), password);
      const me = await refreshSession();
      if (!me) {
        setAuthError("Signed in, but your profile could not be loaded. Please try again.");
        return;
      }
      if (me.household) {
        if (onSuccess) onSuccess(me.household.myRole === "partner" ? "partner_b" : "partner_a");
      } else {
        setMode("choose-path");
      }
    } catch (error) {
      setAuthError(errorText(error, "Unable to sign in. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Register submission (Supabase Auth via /api/auth/signup) -> Choose Your Path
  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;
    setAuthError("");
    setAuthNotice("");

    if (fullName.trim().length < 2) {
      setAuthError("Please enter your full name (at least 2 characters).");
      return;
    }
    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiSignUp(fullName.trim(), password);
      await refreshSession();
      setMode("choose-path");
    } catch (error) {
      setAuthError(errorText(error, "Unable to create the account. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Join Space with an invitation link/token -> dashboard (onboarding and terms are already saved)
  const handleJoinSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isJoining) return;
    const token = extractInviteToken(inviteCode);
    if (!token) {
      setJoinError("Please paste the full invitation link your partner shared with you.");
      return;
    }

    setIsJoining(true);
    setJoinError("");
    try {
      await apiAcceptInvitation(token);
      clearPendingInvite();
      await refreshSession();
      setShowJoinModal(false);
      // The joiner fills in their own profile next; recommendations wait for both.
      setSelectedPath("join");
      setMode("story-intro");
      setCurrentScreen(1);
    } catch (error) {
      setJoinError(errorText(error, "Unable to join this shared space."));
    } finally {
      setIsJoining(false);
    }
  };

  // Visitors arriving through an invitation link start on the join path with the link prefilled.
  useEffect(() => {
    if (mode !== "choose-path") return;
    const pending = readPendingInvite();
    if (pending) {
      setInviteCode(pending);
      setSelectedPath("join");
      setMode("join-space");
    }
  }, [mode]);

  // Dynamic AI Suggestions derived from 22 questionnaire profiling answers
  const getAISuggestion = () => {
    let splitA = 50;
    let splitB = 50;
    let splitRationale =
      "Equal 50:50 contribution based on balanced financial profiles and shared goals.";

    if (
      incomeType === "Irregular" ||
      helpFamily === "Every month"
    ) {
      splitA = 60;
      splitB = 40;
      splitRationale = `Proportional 60:40 split recommended because of ${incomeType === "Irregular"
          ? "variable income fluctuations"
          : "regular monthly family obligations"
        }, giving both partners an equitable safety cushion.`;
    } else if (spendDifficulty >= 8) {
      splitA = 55;
      splitB = 45;
      splitRationale =
        "A 55:45 split provides comfortable flexibility while aligning your mutual spending habits.";
    }

    let threshold = 500; // USD reference; converted to the household currency on apply
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

    if (moneyManagementNow === "Fully combined") {
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
    setContractThreshold(toLocalAmount(ai.threshold));
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

  // Sign my side of the agreement: proposes the terms, or approves the partner's proposal.
  const handleSignContract = async () => {
    if (isSigning) return;
    setContractError("");
    setIsSigning(true);
    const result = await activateInitialContract({
      splitPartnerA: contractSplitA,
      splitPartnerB: contractSplitB,
      approvalThreshold: contractThreshold,
      thresholdCurrency: contractCurrency,
      coolingOffEnabled: contractCoolingOff,
      approveEverySharedPurchase: contractApproveEveryShared,
      walletMode: contractWalletMode === "pooled" ? "shared_only" : "shared_and_personal",
    });
    setIsSigning(false);
    if (result === "awaiting_partner_join") {
      setContractError(`${otherDisplayName} needs to join your shared space before the contract can be signed.`);
    }
  };

  const handleRatifyContract = () => {
    setMode("welcoming");
  };

  const handleEnterHome = () => {
    if (onSuccess) {
      onSuccess(myRole);
    }
  };

  // When the partner already proposed terms, show those terms for signing.
  useEffect(() => {
    if (mode !== "contract-setup" || !contract.proposedChange || mySigned) return;
    setContractSplitA(contract.proposedChange.splitPartnerA);
    setContractSplitB(contract.proposedChange.splitPartnerB);
    setContractThreshold(contract.proposedChange.approvalThreshold);
    setContractApproveEveryShared(contract.proposedChange.approveEverySharedPurchase);
    setAiApplied(true);
  }, [mode, contract.proposedChange, mySigned]);

  // ---------------------------------------------------------------------------
  // Onboarding persistence, household creation & partner invitation
  // ---------------------------------------------------------------------------
  const buildOnboardingPayload = () => {
    const meaning: Record<string, string> = {
      Security: "rasa_aman",
      Recognition: "pengakuan",
      Freedom: "kebebasan",
      "A way to help others": "membantu_orang_lain",
    };
    const comm: Record<string, string> = {
      "Talk right away": "langsung",
      "Write it down first": "lewat_tulisan",
      "At a set time": "waktu_khusus",
    };
    const perma: Record<string, string> = {
      // Labels mirror PERMA_GOAL_DIRECTIVES in src/backend/personalization.ts
      "Enjoy life without guilt": "emosi_positif",
      "Reach a big milestone": "pencapaian",
      "Support my family": "makna",
      "More time for what I love": "keasyikan",
      "Celebrate together": "hubungan",
    };
    const accounts: Record<string, string> = {
      "Fully combined": "shared",
      "Partly combined": "both",
      Separate: "separate",
      "Not decided yet": "not_discussed",
    };

    const challenges = new Set<string>();
    if (/emergency|darurat/i.test(biggestGoal)) challenges.add("no_emergency_fund");
    if (helpFamily === "Every month") challenges.add("family_support");
    if (/child|baby|anak/i.test(relationshipPlans)) challenges.add("planning_for_child");
    if (challenges.size === 0) challenges.add("saving_for_shared_goal");

    return {
      profile: {
        city: null,
        country: household?.country ?? selectedCountry.name,
        preferredLanguage: (locale.startsWith("id") ? "id" : "en") as "en" | "id",
      },
      answers: {
        childrenCategory: "prefer_not_to_say",
        partner: {
          name: invitedPartnerName.trim() || null,
          email: null,
        },
        partnerAwareness:
          goalAlignmentConfidence >= 4 ? "yes_supportive" : goalAlignmentConfidence === 3 ? "yes_neutral" : "yes_concerned",
        moneyTalkFrequency: "prefer_not_to_say",
        moneyTalkDuration: "prefer_not_to_say",
        hasDiscussedFamilyFinances: helpFamily === "Every month" ? "yes" : "not_sure",
        incomeSource: "prefer_not_to_say",
        accountStructure: accounts[moneyManagementNow] ?? "not_discussed",
        financialChallenges: Array.from(challenges),
        otherChallengeDescription: null,
        personalization: {
          spendingHabit: spendDifficulty,
          paymentPain: scaleTo5(spendingRegret),
          planOvershoot: scaleTo5(impulseBuy),
          wishPurchaseReaction: scaleTo5(holdBackNeed),
          moneyMeaning: meaning[moneyMeaning] ?? null,
          commStyle: comm[discussionChannel] ?? null,
          permaGoal: perma[goalEmotion] ?? null,
        },
        // Raw profiling answers, kept for future personalization (ignored by the validator today).
        profiling: {
          relationshipStatus,
          relationshipDuration,
          relationshipPlans,
          incomeType,
          childhoodMoney,
          windfallTendency,
          biggestGoal,
          discussionThreshold:
            discussionThresholdIndex === null || discussionThresholdIndex === undefined
              ? "not_sure"
              : thresholdPresets[discussionThresholdIndex],
          discussionThresholdCurrency: questionCurrency,
          sharedDataCategories,
          financialFreedom,
          partnerMoneyStyleGuess,
        },
      },
    };
  };


  const ensureHousehold = async (): Promise<string> => {
    if (household?.id) return household.id;
    const partnerLabel = invitedPartnerName.trim() || "Partner";
    const name = `${myDisplayName} & ${partnerLabel}`.slice(0, 100);
    try {
      await apiCreateHousehold(name, selectedCountry.name, selectedCountry.currency);
    } catch (error) {
      // HOUSEHOLD_ALREADY_EXISTS: fall through and use the existing membership.
      if (!(error instanceof Error && /already belong/i.test(error.message))) throw error;
    }
    const me = await refreshSession();
    if (!me?.household?.id) throw new Error("Your shared space could not be created. Please try again.");
    return me.household.id;
  };

  const sendInvitation = async (householdIdToUse: string) => {
    const res = await apiInvitePartner(householdIdToUse, invitedPartnerName.trim() || null);
    setInviteUrl(res.inviteUrl);
    if (invitedPartnerName.trim()) setPartnerNames(partnerAName, invitedPartnerName.trim());
    return res.inviteUrl;
  };

  const handleGenerateInvite = async () => {
    if (isInviting) return;
    setInviteError("");
    setIsInviting(true);
    try {
      const hid = await ensureHousehold();
      setCreatedHouseholdId(hid);
      await sendInvitation(hid);
    } catch (error) {
      setInviteError(errorText(error, "Unable to create the invitation."));
    } finally {
      setIsInviting(false);
    }
  };

  // Recommendation page "Next": save the onboarding answers, transaction history
  // and adjusted terms, then the creator gets the invitation link and the
  // partner who is joining enters theirs.
  const handleRecommendationNext = async () => {
    if (isSavingTerms) return;
    setContractError("");
    setIsSavingTerms(true);
    try {
      const payload = buildOnboardingPayload();
      const recentExpenses = recentTransactions
        .filter((t) => t.merchant.trim() && t.amount > 0)
        .slice(0, 20)
        .map((t) => ({
          merchant: t.merchant.trim().slice(0, 120),
          amount: Math.round(t.amount * 100) / 100,
          category: (t.category || "Others").slice(0, 60),
          date: t.date ? t.date.slice(0, 40) : null,
        }));
      await apiSaveOnboarding(payload.profile, {
        ...payload.answers,
        contractPreferences: {
          rules: rulesFromContract({
            splitPartnerA: contractSplitA,
            splitPartnerB: contractSplitB,
            approvalThreshold: contractThreshold,
            approveEverySharedPurchase: contractApproveEveryShared,
            coolingOffEnabled: contractCoolingOff,
            walletMode: contractWalletMode === "pooled" ? "shared_only" : "shared_and_personal",
          }),
        },
        recentExpenses,
      });

      if (selectedPath === "join" && !household) {
        setShowJoinModal(true);
        return;
      }

      const hid = await ensureHousehold();
      setCreatedHouseholdId(hid);
      setMode("questionnaire");
      setCurrentScreen(24);
    } catch (error) {
      setContractError(errorText(error, "Unable to save your preferences. Please try again."));
    } finally {
      setIsSavingTerms(false);
    }
  };

  const copyInviteLink = (onCopied: () => void) => {
    if (!inviteUrl) return;
    navigator.clipboard?.writeText(inviteUrl);
    onCopied();
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

  // 26 Profiling & Couple Setup Screens strictly matching PDF flow
  const currentScreenConfig = {
    1: {
      category: "About your relationship",
      question: "What's your relationship status?",
      subtitle: "Helps Seiya tailor its suggestions",
      type: "choice" as const,
      options: ["Dating", "Engaged", "Married"],
      selectedString: relationshipStatus,
      onSelectString: (v: string) => setRelationshipStatus(v),
    },
    2: {
      category: "About your relationship",
      question: "How long have you been together?",
      subtitle: "Pick the closest range",
      type: "choice" as const,
      options: ["Under 1 year", "1–3 years", "4–7 years", "Over 7 years"],
      selectedString: relationshipDuration,
      onSelectString: (v: string) => setRelationshipDuration(v),
    },
    3: {
      category: "About your relationship",
      question: "Any big plans coming up?",
      subtitle: "E.g. getting married, moving, or a new city",
      type: "text" as const,
      placeholder: "E.g. getting married next year",
      selectedString: relationshipPlans,
      onSelectString: (v: string) => setRelationshipPlans(v),
    },
    4: {
      category: "About your relationship",
      question: "Do you support your extended family?",
      subtitle: "No amounts needed",
      type: "choice" as const,
      options: ["Every month", "Sometimes"],
      selectedString: helpFamily,
      onSelectString: (v: string) => setHelpFamily(v),
    },
    5: {
      category: "About your relationship",
      question: "What's your income like?",
      subtitle: "No salary or debt details needed",
      type: "choice" as const,
      options: ["Fixed", "Own business", "Irregular", "No income yet"],
      selectedString: incomeType,
      onSelectString: (v: string) => setIncomeType(v),
    },
    6: {
      category: "How you see money",
      question: "How hard is spending money for you?",
      subtitle: "1 = very easy, 11 = very hard",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Very easy)",
      scaleMaxLabel: "11 (Very hard)",
      selectedNumber: spendDifficultyAnswer,
      onSelectNumber: (v: number) => setSpendDifficulty(v),
    },
    7: {
      category: "How you see money",
      question: "How often do you skip buying things you need?",
      subtitle: "1 = almost never, 11 = very often",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Almost never)",
      scaleMaxLabel: "11 (Very often)",
      selectedNumber: holdBackNeedAnswer,
      onSelectNumber: (v: number) => setHoldBackNeed(v),
    },
    8: {
      category: "How you see money",
      question: "How quickly do you buy something you like?",
      subtitle: "1 = very cautious, 11 = right away",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Very cautious)",
      scaleMaxLabel: "11 (Right away)",
      selectedNumber: impulseBuyAnswer,
      onSelectNumber: (v: number) => setImpulseBuy(v),
    },
    9: {
      category: "How you see money",
      question: "How often do you regret a purchase?",
      subtitle: "Answer honestly, not ideally",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Almost never)",
      scaleMaxLabel: "11 (Very often)",
      selectedNumber: spendingRegretAnswer,
      onSelectNumber: (v: number) => setSpendingRegret(v),
    },
    10: {
      category: "Experiences that shaped you",
      question: "Growing up, money at home was…",
      subtitle: "Early habits shape how we react today",
      type: "choice" as const,
      options: ["A source of conflict", "Talked about openly", "Rarely discussed", "Never a problem"],
      selectedString: childhoodMoney,
      onSelectString: (v: string) => setChildhoodMoney(v),
    },
    11: {
      category: "Experiences that shaped you",
      question: "Money matters most because it gives…",
      subtitle: "Pick the closest feeling",
      type: "choice" as const,
      options: ["Security", "Recognition", "Freedom", "A way to help others"],
      selectedString: moneyMeaning,
      onSelectString: (v: string) => setMoneyMeaning(v),
    },
    12: {
      category: "Experiences that shaped you",
      question: "With an unexpected bonus, you'd most likely…",
      subtitle: "No answer is better than another",
      type: "choice" as const,
      options: ["Save it", "Help family", "Buy something I want", "Invest it"],
      selectedString: windfallTendency,
      onSelectString: (v: string) => setWindfallTendency(v),
    },
    13: {
      category: "Your goals",
      question: "Your biggest money goal for the next 1–3 years?",
      subtitle: "In your own words. Numbers are optional",
      type: "text" as const,
      placeholder: "E.g. build an emergency fund",
      selectedString: biggestGoal,
      onSelectString: (v: string) => setBiggestGoal(v),
    },
    14: {
      category: "Your goals",
      question: "What should this goal bring you most?",
      subtitle: "Seiya keeps this in mind when it helps you plan",
      type: "choice" as const,
      options: ["Enjoy life without guilt", "Reach a big milestone", "More time for what I love", "Support my family", "Celebrate together"],
      selectedString: goalEmotion,
      onSelectString: (v: string) => setGoalEmotion(v),
    },
    15: {
      category: "Your goals",
      question: "How sure are you that your partner shares this goal?",
      subtitle: "1 = not sure, 5 = very sure",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: "1 (Not sure)",
      scaleMaxLabel: "5 (Very sure)",
      selectedNumber: goalAlignmentConfidenceAnswer,
      onSelectNumber: (v: number) => setGoalAlignmentConfidence(v),
    },
    16: {
      category: "How you manage money",
      question: "How do you manage money today?",
      subtitle: "Pick what fits best right now",
      type: "choice" as const,
      options: ["Fully combined", "Partly combined", "Separate", "Not decided yet"],
      selectedString: moneyManagementNow,
      onSelectString: (v: string) => setMoneyManagementNow(v),
    },
    17: {
      category: "How you manage money",
      question: "Which purchases should you discuss first?",
      subtitle: "This sets your “discuss first” rule",
      type: "choice" as const,
      options: [...thresholdLabels, "Not sure yet"],
      selectedString:
        discussionThresholdIndex === undefined
          ? ""
          : discussionThresholdIndex === null
            ? "Not sure yet"
            : thresholdLabels[discussionThresholdIndex],
      onSelectString: (v: string) => {
        const index = thresholdLabels.indexOf(v);
        setDiscussionThresholdIndex(index >= 0 ? index : null);
      },
      countryPicker: true,
    },
    18: {
      category: "How you manage money",
      question: "How do you prefer to talk about money?",
      subtitle: "Seiya will match your style",
      type: "choice" as const,
      options: ["Talk right away", "Write it down first", "At a set time"],
      selectedString: discussionChannel,
      onSelectString: (v: string) => setDiscussionChannel(v),
    },
    19: {
      category: "You're in control",
      question: "What do you want to share with your partner?",
      subtitle: "Pick any. You can change this anytime",
      type: "multiselect" as const,
      options: ["Total balance", "Transaction details", "Spending categories", "Debts", "Nothing yet"],
      selectedArray: sharedDataCategories,
      onToggleArray: (item: string) => {
        setSharedDataCategories((prev) => {
          if (item === "Nothing yet") return prev.includes(item) ? [] : [item];
          const rest = prev.filter((i) => i !== "Nothing yet");
          return rest.includes(item) ? rest.filter((i) => i !== item) : [...rest, item];
        });
      },
    },
    20: {
      category: "A safe space",
      question: "Do you feel free to decide about your own money?",
      subtitle: "Always private. Only used to keep you safe",
      type: "choice" as const,
      options: ["Yes", "Not always"],
      selectedString: financialFreedom,
      onSelectString: (v: string) => setFinancialFreedom(v),
    },
    21: {
      category: "A safe space",
      question: "Want to guess your partner's money style?",
      subtitle: "Optional. 1 = spends easily, 11 = spends carefully",
      type: "scale" as const,
      scaleMin: 1,
      scaleMax: 11,
      scaleMinLabel: "1 (Spends easily)",
      scaleMaxLabel: "11 (Spends carefully)",
      selectedNumber: partnerMoneyStyleGuessAnswer,
      onSelectNumber: (v: number) => setPartnerMoneyStyleGuess(v),
      continueButtonText: "Finish",
    },
    22: {
      category: "Profile complete",
      question: "Thanks for being honest",
      subtitle: "Your full results, including your guess about your partner, unlock once they finish too",
      type: "profile-summary" as const,
    },
    23: {
      category: "Transaction history",
      question: "What did you spend on recently?",
      subtitle: "Add a few recent expenses. 3–7 days is enough",
      type: "transaction-history" as const,
    },
    24: {
      category: "Couple setup · 1 of 2",
      question: "Recommendations open once you're both done",
      subtitle: "Seiya then suggests one plan for both of you",
      type: "couple-setup" as const,
    },
    25: {
      category: "Seiya's promise draft · 2 of 2",
      question: "Agree on money rules before they clash",
      subtitle: "Pick 4–5 clauses and edit as needed. Active once you both save the same version",
      type: "promise-draft" as const,
    },
    26: {
      category: "Mutual agreement",
      question: "Active once you both agree",
      subtitle: "If your versions differ, Seiya brings them back to discuss",
      type: "mutual-agreement" as const,
    },
  }[currentScreen] || {
    category: "About your relationship",
    question: "What's your relationship status?",
    subtitle: "Helps Seiya tailor its suggestions",
    type: "choice" as const,
    options: ["Dating", "Engaged", "Married"],
    selectedString: relationshipStatus,
    onSelectString: (v: string) => setRelationshipStatus(v),
  };

  // Profiling is answered in order: Continue stays off until this screen has an answer.
  const currentAnswered = (() => {
    const cfg = currentScreenConfig as {
      type: string;
      selectedString?: string;
      selectedNumber?: number | null;
      selectedArray?: string[];
    };
    if (cfg.type === "choice") return Boolean(cfg.selectedString);
    if (cfg.type === "text") return (cfg.selectedString ?? "").trim().length >= 2;
    if (cfg.type === "scale") return cfg.selectedNumber !== null && cfg.selectedNumber !== undefined;
    if (cfg.type === "multiselect") return (cfg.selectedArray?.length ?? 0) > 0;
    return true;
  })();
  const goToNextProfilingScreen = () => {
    if (!currentAnswered) return;
    const next = currentScreen + 1;
    setFurthestScreen((f) => Math.max(f, next));
    setCurrentScreen(next);
  };
  const canOpenStep = (startScreen: number) => startScreen <= furthestScreen;

  return (
    <div className="min-h-screen bg-[#FEFBF5] text-[#2a2b2f] flex flex-col justify-between selection:bg-[#B45529]/20 selection:text-[#B45529] relative overflow-x-hidden">
      {/* Bottom Floating Navigation Pill for Quick Screen Verification (design review only) */}
      {DEMO_SIMULATION_ENABLED && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[#2a2b2f]/90 text-white backdrop-blur-md px-3 py-1.5 rounded-full shadow-2xl flex items-center gap-1.5 text-xs font-mono border border-white/10 opacity-90 hover:opacity-100 transition-opacity">
          <span className="text-white/40 px-2 hidden md:inline">VIEW:</span>
          <button
            onClick={() => setMode("login")}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${mode === "login"
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
          >
            Login
          </button>
          <button
            onClick={() => setMode("register")}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${mode === "register"
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
          >
            Register
          </button>
          <button
            onClick={() => setMode("choose-path")}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${mode === "choose-path"
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
          >
            Choose Path
          </button>
          <button
            onClick={() => setMode("story-intro")}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${mode === "story-intro"
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
          >
            Story Intro
          </button>
          <button
            onClick={() => {
              setMode("questionnaire");
              setCurrentScreen(1);
            }}
            className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${mode === "questionnaire" && currentScreen <= 21
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
          >
            Profiling (1)
          </button>
          <button
            onClick={() => {
              setMode("questionnaire");
              setCurrentScreen(22);
            }}
            className={`px-2 py-1 rounded-full transition-all cursor-pointer ${mode === "questionnaire" && currentScreen === 22
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
            title="Initial profile complete"
          >
            Summary (22)
          </button>
          <button
            onClick={() => {
              setMode("questionnaire");
              setCurrentScreen(23);
            }}
            className={`px-2 py-1 rounded-full transition-all cursor-pointer ${mode === "questionnaire" && currentScreen === 23
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
            title="Transaction history"
          >
            Tx (23)
          </button>
          <button
            onClick={() => {
              setMode("questionnaire");
              setCurrentScreen(24);
            }}
            className={`px-2 py-1 rounded-full transition-all cursor-pointer ${mode === "questionnaire" && currentScreen === 24
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
            title="Couple setup · 1 of 2"
          >
            Setup (24)
          </button>
          <button
            onClick={() => {
              setMode("questionnaire");
              setCurrentScreen(25);
            }}
            className={`px-2 py-1 rounded-full transition-all cursor-pointer ${mode === "questionnaire" && currentScreen === 25
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
            title="Seiya's promise draft · 2 of 2"
          >
            Promise (25)
          </button>
          <button
            onClick={() => {
              setMode("questionnaire");
              setCurrentScreen(26);
            }}
            className={`px-2 py-1 rounded-full transition-all cursor-pointer ${mode === "questionnaire" && currentScreen === 26
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
            title="Mutual agreement"
          >
            Agree (26)
          </button>
          <button
            onClick={() => {
              if (!aiApplied) applyAISuggestions();
              setMode("contract-setup");
            }}
            className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${mode === "contract-setup"
                ? "bg-[#B4562A] text-white font-semibold shadow-xs"
                : "text-white/70 hover:text-white"
              }`}
          >
            Contract
          </button>
          <button
            onClick={() => setMode("welcoming")}
            className={`px-3 py-1 rounded-full transition-all cursor-pointer ${mode === "welcoming"
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
      )}

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

              <div className="mt-3 mb-6" />

              <form
                onSubmit={mode === "login" ? handleLogin : handleRegister}
                className="space-y-5"
              >
                {/* Full Name Field (also the sign-in username) */}
                <div className="space-y-2">
                  <label className="block text-sm font-serif text-[#423f3b]">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setAuthError("");
                    }}
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
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      minLength={mode === "register" ? 8 : undefined}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthError("");
                      }}
                      placeholder={mode === "login" ? "Enter your password" : "Create your password (min. 8 characters)"}
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

                {/* Feedback */}
                {authError && (
                  <p role="alert" className="text-xs text-red-600 leading-relaxed">
                    {authError}
                  </p>
                )}
                {authNotice && !authError && (
                  <p role="status" className="text-xs text-emerald-700 leading-relaxed">
                    {authNotice}
                  </p>
                )}

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 px-6 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif font-normal text-base sm:text-lg transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-[0.99] disabled:opacity-60 disabled:cursor-wait"
                  >
                    {isSubmitting
                      ? mode === "login"
                        ? "Signing in..."
                        : "Creating account..."
                      : mode === "login"
                        ? "Login"
                        : "Create an account"}
                  </button>
                </div>

                {/* Continue with WeChat (UI only: shows a "coming soon" sheet) */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-3 text-xs text-[#a3abaa]">
                    <span className="h-px flex-1 bg-[#e8dfd5]" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-[#e8dfd5]" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWechatSheet(true)}
                    className="w-full py-3.5 px-6 rounded-full border border-[#d1c9bf] bg-white hover:bg-[#f6fbf8] hover:border-[#07C160]/50 text-[#2a2b2f] font-serif text-base flex items-center justify-center gap-2.5 transition-all shadow-2xs cursor-pointer active:scale-[0.99]"
                  >
                    <WeChatLogo />
                    <span>Continue with WeChat</span>
                  </button>
                </div>

                {/* Switch between Login and Register */}
                <div className="text-center pt-2">
                  {mode === "login" ? (
                    <p className="text-sm text-[#78716c]">
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setAuthError("");
                          setAuthNotice("");
                          setMode("register");
                        }}
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
                        onClick={() => {
                          setAuthError("");
                          setMode("login");
                        }}
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
                  sizes="(min-width: 1024px) 40vw, 1px"
                  priority
                  className="object-contain"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SCREEN 3: CHOOSE YOUR PATH (Figma: 544:12524)
          The terracotta highlight follows the pointer (or keyboard focus).
          ========================================================================= */}
      {mode === "choose-path" && (
        <div className="min-h-screen bg-white flex flex-col overflow-x-hidden">
          <header className="relative shrink-0 px-6 pt-6 sm:pt-8 flex items-center justify-center">
            <SeiyaLogo height={44} />
            {onClose && (
              <button
                onClick={onClose}
                className="absolute right-6 sm:right-12 top-7 sm:top-10 font-serif text-sm text-[#737373] hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span>Exit</span>
              </button>
            )}
          </header>

          <main className="flex-1 min-h-0 w-full max-w-[1040px] mx-auto px-4 sm:px-6 pt-5 sm:pt-7 pb-6 sm:pb-8 flex flex-col items-center lg:justify-center gap-5 sm:gap-7">
            <h1 className="shrink-0 font-serif text-[32px] sm:text-[40px] leading-tight text-[#2a2b2f] tracking-[-0.85px] text-center">
              Choose Your Path
            </h1>

            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-10 w-full"
              onMouseLeave={() => setHoveredPath(null)}
            >
              {(
                [
                  {
                    path: "create" as const,
                    title: "Create a Shared Space",
                    body: "The first user creates a shared financial space and obtains an invitation code",
                    image: "/images/auth/shared-space.png",
                  },
                  {
                    path: "join" as const,
                    title: "Join a Shared Space",
                    body: "Your partner already created a space? Enter their invitation link to join it",
                    image: "/images/auth/join-space.png",
                  },
                ]
              ).map((card) => {
                const highlighted = (hoveredPath ?? "create") === card.path;
                return (
                  <button
                    key={card.path}
                    type="button"
                    onMouseEnter={() => setHoveredPath(card.path)}
                    onFocus={() => setHoveredPath(card.path)}
                    onClick={() => {
                      setSelectedPath(card.path);
                      if (card.path === "join") {
                        setJoinError("");
                        setMode("join-space");
                      } else {
                        setMode("story-intro");
                      }
                    }}
                    className={`text-left rounded-[20px] px-6 lg:px-8 pt-2 pb-6 lg:pb-8 flex flex-col items-center cursor-pointer transition-[background-color,box-shadow,transform] duration-300 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#b4562a]/30 ${
                      highlighted
                        ? "bg-[#b4562a] -translate-y-1 shadow-[0_24px_48px_-12px_rgba(180,86,42,0.45)]"
                        : "bg-[#fdf8e7] shadow-none"
                    }`}
                  >
                    <div className="relative w-full max-w-[400px] aspect-square lg:max-w-none lg:aspect-auto lg:h-[clamp(240px,46vh,440px)]">
                      <Image
                        src={card.image}
                        alt={card.title}
                        fill
                        priority
                        sizes="(min-width: 1024px) 420px, 90vw"
                        className={`object-contain transition-transform duration-300 ${highlighted ? "scale-[1.03]" : ""}`}
                      />
                    </div>
                    <div
                      className={`w-full shrink-0 space-y-1 tracking-[-0.85px] transition-colors duration-300 ${
                        highlighted ? "text-white" : "text-[#0a0a0a]"
                      }`}
                    >
                      <p className="font-serif font-semibold text-[24px] lg:text-[28px] leading-tight">{card.title}</p>
                      <p className={`font-serif text-base lg:text-lg ${highlighted ? "text-white/90" : "text-[#4a4a4a]"}`}>
                        {card.body}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </main>
        </div>
      )}

      {/* =========================================================================
          SCREEN 3b: JOIN SHARED SPACE (Figma: 549:12864)
          ========================================================================= */}
      {mode === "join-space" && (
        <div className="min-h-screen bg-[#fefbf5] flex flex-col">
          <header className="px-6 sm:px-[25px] h-[76px] sm:h-[101px] border-b border-[#e6e6e6] flex items-center justify-between">
            <SeiyaLogo height={48} />
            {onClose && (
              <button
                onClick={onClose}
                className="font-serif text-sm text-[#737373] hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={16} />
                <span>Exit</span>
              </button>
            )}
          </header>

          <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-[50px] py-10 lg:py-12 flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="w-full lg:max-w-[776px] space-y-3 tracking-[-0.85px]">
              <p className="font-serif text-lg sm:text-2xl text-[#737373]">Join shared space</p>
              <h1 className="font-serif font-semibold text-[38px] sm:text-[56px] xl:text-[70px] leading-[1.15] text-black">
                Enter the invitation link from your partner
              </h1>
              <p className="font-serif text-lg sm:text-2xl text-black">
                The link can only be used once and connects two accounts after both provide confirmation
              </p>
            </div>

            <form
              onSubmit={handleJoinSpace}
              className="w-full max-w-[555px] shrink-0 bg-white rounded-[20px] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)] overflow-hidden pb-10 sm:pb-12"
            >
              <OnboardingBanner />
              <div className="px-4 sm:px-6 pt-6 space-y-5">
                <label className="block space-y-2">
                  <span className="block font-serif text-base text-black tracking-[-0.85px]">Invitation link</span>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={inviteCode}
                    onChange={(e) => {
                      // Tokens are case-sensitive; never transform them.
                      setInviteCode(e.target.value.trim());
                      setJoinError("");
                    }}
                    placeholder="Insert link here"
                    className="w-full px-2.5 py-2.5 rounded-[15px] border border-[#bfbfbf] bg-white font-serif text-lg sm:text-xl text-black placeholder:text-[#737373] tracking-[-0.85px] focus:outline-none focus:border-[#b4562a] focus:ring-2 focus:ring-[#b4562a]/15"
                  />
                  {joinError && (
                    <span role="alert" className="block font-serif text-sm text-[#ff0000]">
                      {joinError}
                    </span>
                  )}
                </label>

                <LockNotice>
                  Joining doesn&apos;t immediately unlock your partner&apos;s answers or transactions. You still choose
                  which data you want to share
                </LockNotice>

                <div className="space-y-1">
                  <PrimaryButton type="submit" disabled={isJoining} className="w-full">
                    {isJoining ? "Connecting..." : "Connect Space"}
                  </PrimaryButton>
                  <button
                    type="button"
                    onClick={() => setMode("choose-path")}
                    className="w-full h-12 rounded-[15px] font-jakarta font-semibold text-base text-[#737373] hover:text-black tracking-[0.16px] transition-colors cursor-pointer"
                  >
                    Again select the path
                  </button>
                </div>
              </div>
            </form>
          </main>
        </div>
      )}

      {/* =========================================================================
          SCREEN 4: ONBOARDING STORY INTRO (Figma: 544:12544)
          ========================================================================= */}
      {mode === "story-intro" && (
        <div className="min-h-screen bg-[#fefbf5] flex flex-col">
          <header className="px-6 sm:px-[25px] h-[76px] border-b border-[#e6e6e6] flex items-center justify-between">
            <SeiyaLogo height={48} />
            <div className="flex items-center gap-5">
              {!household && (
                <button
                  onClick={() => setMode("choose-path")}
                  className="font-serif text-sm text-[#737373] hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SolarIcon name="arrow-left" size={16} />
                  <span className="hidden sm:inline">Choose Path</span>
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="font-serif text-sm text-[#737373] hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <SolarIcon name="close-circle" size={16} />
                  <span>Exit</span>
                </button>
              )}
            </div>
          </header>

          <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-[50px] py-10 lg:py-12 flex flex-col lg:flex-row items-center justify-between gap-10">
            <div className="w-full lg:max-w-[785px] space-y-10">
              <div className="space-y-3 text-black tracking-[-0.85px]">
                <h1 className="font-serif font-semibold text-[38px] sm:text-[56px] xl:text-[70px] leading-[1.15]">
                  Start with your story, <br className="hidden sm:inline" />
                  not with numbers
                </h1>
                <p className="font-serif text-lg sm:text-2xl">
                  Before Seiya helps you manage your finances together, Seiya wants to understand how you communicate,
                  make decisions, and prioritize
                </p>
              </div>
              <PrimaryButton
                rounded="rounded-[50px]"
                className="w-[123px]"
                onClick={() => {
                  setMode("questionnaire");
                  setCurrentScreen(1);
                }}
              >
                Start
              </PrimaryButton>
            </div>

            <div className="w-full max-w-[555px] shrink-0 bg-white rounded-[20px] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)] overflow-hidden">
              <OnboardingBanner />
              <div className="px-6 sm:px-[47px] pt-6 pb-10 sm:pb-12">
                {[
                  { n: 1, title: "Context & story of money", sub: "Experiences that shape you" },
                  { n: 2, title: "Style & purpose", sub: "How you see the future" },
                  { n: 3, title: "Rules & privacy", sub: "Boundaries that make you comfortable" },
                ].map((item) => (
                  <div key={item.n} className="flex items-center gap-3 py-[10px] border-b border-[#e6e6e6] first:pt-0">
                    <span className="w-10 h-10 rounded-full bg-[#b4562a] text-white font-serif font-medium text-xl flex items-center justify-center shrink-0">
                      {item.n}
                    </span>
                    <span className="font-serif text-lg sm:text-xl tracking-[-0.85px]">
                      <span className="block text-black">{item.title}</span>
                      <span className="block text-[#737373]">{item.sub}</span>
                    </span>
                  </div>
                ))}
                <p className="pt-5 font-serif text-base text-[#737373] tracking-[-0.85px]">
                  There are no right or wrong answers. You can also go back and change your answers at any time.
                </p>
              </div>
            </div>
          </main>
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
                    {currentScreen} / 21
                  </span>
                  <svg
                    className={`w-4 h-4 text-[#808988] transition-transform duration-200 ${mobileStepMenuOpen ? "rotate-180" : ""
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
                      const isAllDone = currentScreen >= 22;
                      const isActive = !isAllDone && activeMilestoneId === s.id;
                      const isDone = isAllDone || activeMilestoneId > s.id;
                      return (
                        <div
                          key={s.id}
                          aria-disabled={!canOpenStep(s.startScreen)}
                          onClick={() => {
                            if (!canOpenStep(s.startScreen)) return;
                            setCurrentScreen(s.startScreen);
                            setMobileStepMenuOpen(false);
                          }}
                          className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${isActive
                              ? "bg-[#B45529] text-white font-medium shadow-xs"
                              : canOpenStep(s.startScreen)
                                ? "text-[#515151] hover:bg-[#FEFBF5] cursor-pointer"
                                : "text-[#515151] opacity-50 cursor-not-allowed"
                            }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center font-serif text-xs font-semibold shrink-0 ${isActive
                                  ? "bg-white text-[#B45529]"
                                  : isDone
                                    ? "bg-[#B45529] text-white border border-[#B45529]"
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
                            <span className="text-[11px] font-serif text-[#B45529] font-medium">Done ✓</span>
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
                    {currentScreen <= 21 ? `${currentScreen} / 21` : "Completed"}
                  </span>
                </div>

                <div className="space-y-2">
                  {PROFILING_STEPS.map((s) => {
                    const isAllDone = currentScreen >= 22;
                    const isActive = !isAllDone && activeMilestoneId === s.id;
                    const isDone = isAllDone || activeMilestoneId > s.id;
                    return (
                      <div
                        key={s.id}
                        aria-disabled={!canOpenStep(s.startScreen)}
                        onClick={() => {
                          if (canOpenStep(s.startScreen)) setCurrentScreen(s.startScreen);
                        }}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all ${isActive
                            ? "bg-[#B45529] text-white shadow-xs"
                            : canOpenStep(s.startScreen)
                              ? "text-[#515151] hover:text-[#2a2b2f] hover:bg-black/[0.03] cursor-pointer"
                              : "text-[#515151] opacity-50 cursor-not-allowed"
                          }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-serif text-xs font-semibold shrink-0 transition-all ${isActive
                              ? "bg-white text-[#B45529]"
                              : isDone
                                ? "bg-[#B45529] text-white border border-[#B45529]"
                                : "border border-[#808988]/40 text-[#808988]"
                            }`}
                        >
                          {isDone ? "✓" : s.id}
                        </div>
                        <span
                          className={`font-serif text-sm sm:text-base ${isActive
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
                    {currentScreen <= 21 && (
                      <span className="text-[#B45529] font-medium">
                        Question {currentScreen} of 21 ·{" "}
                      </span>
                    )}
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
                    {"countryPicker" in currentScreenConfig && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#f0ebe3]">
                        <span className="font-serif text-xs sm:text-sm text-[#808988]">
                          {household
                            ? `Amounts in ${questionCurrency}, your shared space's currency`
                            : `Amounts in ${questionCurrency} for ${selectedCountry.name}`}
                        </span>
                        {!household && (
                          <label className="flex items-center gap-2 font-serif text-xs sm:text-sm text-[#515151]">
                            <span>Country</span>
                            <select
                              value={selectedCountry.code}
                              onChange={(e) => chooseCountry(e.target.value)}
                              className="px-2.5 py-1.5 rounded-lg border border-[#e5dcd0] bg-white text-[#2a2b2f] focus:outline-none focus:border-[#B45529] cursor-pointer"
                            >
                              {COUNTRY_OPTIONS.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name} ({c.currency})
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentScreenConfig.options?.map((opt) => {
                        const isSelected = currentScreenConfig.selectedString === opt;
                        return (
                          <div
                            key={opt}
                            onClick={() => currentScreenConfig.onSelectString?.(opt)}
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 text-left ${isSelected
                                ? "border-[#B45529] bg-[#fbf0eb] shadow-2xs ring-1 ring-[#B45529]"
                                : "border-[#e5dcd0] hover:border-[#B45529]/50 bg-white hover:bg-[#fefcf6]"
                              }`}
                          >
                            {/* Radio Circle */}
                            <div
                              className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected
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
                            className={`min-w-[30px] sm:min-w-[38px] h-9 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center font-serif text-xs sm:text-sm font-semibold transition-all cursor-pointer ${isSelected
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
                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 text-left ${isSelected
                                ? "border-[#B45529] bg-[#fbf0eb] shadow-2xs ring-1 ring-[#B45529]"
                                : "border-[#e5dcd0] hover:border-[#B45529]/50 bg-white hover:bg-[#fefcf6]"
                              }`}
                          >
                            <div
                              className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${isSelected
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

                {/* 5. Screen 22: Initial profile complete (Figma Component 1 · V23) */}
                {currentScreenConfig.type === "profile-summary" && (
                  <div className="space-y-5">
                    <FigmaCard>
                      <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#e6e6e6]">
                        <div className="tracking-[-0.85px]">
                          <p className="font-serif text-sm sm:text-base text-[#737373]">Initial summary</p>
                          <p className="font-serif text-lg sm:text-xl text-black">Your starting point</p>
                        </div>
                        <StatusBadge tone="green" bordered={false}>Ready to arrange</StatusBadge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 tracking-[-0.85px]">
                        {[
                          { label: "The main purpose", value: biggestGoal.trim() || "Not decided yet" },
                          { label: "How to manage money", value: moneyManagementNow },
                          {
                            label: "Topic money data",
                            value: sharedDataCategories.filter((c) => c !== "Nothing yet").join(", ") || "Nothing shared yet",
                          },
                        ].map((item) => (
                          <div key={item.label} className="min-w-0">
                            <p className="font-serif text-sm sm:text-base text-[#737373]">{item.label}</p>
                            <p className="font-serif text-lg sm:text-xl text-black break-words">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px] pt-4">Next Step</p>
                      <div className="flex items-center gap-5 pt-3">
                        <span className="w-10 h-10 rounded-full bg-[#16a34a] text-white font-serif font-medium text-xl flex items-center justify-center shrink-0">
                          1
                        </span>
                        <div className="tracking-[-0.85px]">
                          <p className="font-serif text-lg sm:text-xl text-black">
                            {isHouseholdCreator ? "Invite your partner to join" : `Finish setup with ${promisePartnerName}`}
                          </p>
                          <p className="font-serif text-sm sm:text-base text-[#737373]">
                            You'll agree on privacy, limits and rules together.
                          </p>
                        </div>
                      </div>
                    </FigmaCard>

                    <div className="flex items-center justify-between pt-1">
                      <BackLink onClick={() => setCurrentScreen(21)} />
                      <PrimaryButton onClick={() => setCurrentScreen(23)}>Couple Setup</PrimaryButton>
                    </div>
                  </div>
                )}

                {/* 6. Screen 23: Transaction history (Figma Component 1 · V25) */}
                {currentScreenConfig.type === "transaction-history" && (
                  <div className="space-y-5">
                    <FigmaCard className="space-y-4 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div className="tracking-[-0.85px]">
                          <p className="font-serif text-lg sm:text-xl text-black">Recent expenses</p>
                          <p className="font-serif text-sm sm:text-base text-[#737373]">
                            {recentTransactions.length === 0
                              ? "Nothing added yet"
                              : `${recentTransactions.length} expense${recentTransactions.length === 1 ? "" : "s"} added`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAddTxForm(!showAddTxForm)}
                          className="font-serif text-sm sm:text-base text-[#b4562a] hover:text-[#9c4820] flex items-center gap-1.5 cursor-pointer"
                        >
                          <SolarIcon name={showAddTxForm ? "close-circle" : "plus"} size={18} />
                          <span>{showAddTxForm ? "Close" : "Add expense"}</span>
                        </button>
                      </div>

                      {showAddTxForm && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const amount = Number(newTxAmount);
                            if (!newTxMerchant.trim() || !Number.isFinite(amount) || amount <= 0) return;
                            setRecentTransactions([
                              ...recentTransactions,
                              {
                                id: `tx-${Date.now()}`,
                                merchant: newTxMerchant.trim(),
                                amount,
                                category: newTxCategory,
                                date: new Date().toISOString().slice(0, 10),
                              },
                            ]);
                            setNewTxMerchant("");
                            setNewTxAmount("");
                            setShowAddTxForm(false);
                          }}
                          className="p-4 rounded-[20px] bg-[#fefbf5] border border-[#e6e6e6] space-y-3"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <input
                              type="text"
                              required
                              maxLength={120}
                              placeholder="What was it? (e.g. Coffee)"
                              value={newTxMerchant}
                              onChange={(e) => setNewTxMerchant(e.target.value)}
                              className="px-3 py-2.5 rounded-[15px] border border-[#bfbfbf] bg-white font-serif text-base text-black placeholder:text-[#737373] focus:outline-none focus:border-[#b4562a]"
                            />
                            <input
                              type="number"
                              required
                              min={0}
                              step="any"
                              placeholder={`Amount (${promiseCurrency})`}
                              value={newTxAmount}
                              onChange={(e) => setNewTxAmount(e.target.value)}
                              className="px-3 py-2.5 rounded-[15px] border border-[#bfbfbf] bg-white text-base text-black placeholder:text-[#737373] focus:outline-none focus:border-[#b4562a]"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <select
                              value={newTxCategory}
                              onChange={(e) => setNewTxCategory(e.target.value)}
                              className="px-3 py-2 rounded-[15px] border border-[#bfbfbf] bg-white font-serif text-base text-black"
                            >
                              {["Groceries", "Dining Out", "Utilities", "Transportation", "Subscriptions", "Health", "Family", "Others"].map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="h-10 px-4 rounded-[15px] bg-[#b4562a] hover:bg-[#9c4820] text-white font-jakarta font-semibold text-sm cursor-pointer"
                            >
                              Add
                            </button>
                          </div>
                        </form>
                      )}

                      {recentTransactions.length > 0 && (
                        <div className="divide-y divide-[#e6e6e6]">
                          {recentTransactions.map((tx) => (
                            <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0 tracking-[-0.85px]">
                                <p className="font-serif text-base sm:text-lg text-black truncate">{tx.merchant}</p>
                                <p className="font-serif text-sm text-[#737373]">{tx.category}</p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="font-serif text-base text-black">
                                  {tx.amount.toLocaleString(locale)} {promiseCurrency}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${tx.merchant}`}
                                  onClick={() => setRecentTransactions(recentTransactions.filter((t) => t.id !== tx.id))}
                                  className="text-[#bfbfbf] hover:text-[#ff0000] transition-colors cursor-pointer"
                                >
                                  <SolarIcon name="close-circle" size={18} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </FigmaCard>

                    {historyError && (
                      <p role="alert" className="font-serif text-sm text-[#ff0000] text-right">
                        {historyError}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <BackLink onClick={() => setCurrentScreen(22)} />
                      <div className="flex items-center gap-4">
                        <button
                          type="button"
                          disabled={isSavingHistory}
                          onClick={() => void handleSaveHistory()}
                          className="font-serif text-lg sm:text-xl text-[#bfbfbf] hover:text-[#737373] tracking-[-0.85px] transition-colors cursor-pointer disabled:cursor-wait"
                        >
                          Skip
                        </button>
                        <PrimaryButton onClick={() => void handleSaveHistory()} disabled={isSavingHistory}>
                          {isSavingHistory ? "Saving..." : "Save History"}
                        </PrimaryButton>
                      </div>
                    </div>
                  </div>
                )}

                {/* 7. Screen 24: Couple setup · 1 of 2 (Figma Component 1 · V22) */}
                {currentScreenConfig.type === "couple-setup" && (
                  <div className="space-y-5">
                    {isHouseholdCreator && !partnerProfile && !partnerProgress && (
                      <FigmaCard className="space-y-5">
                        <label className="block space-y-2">
                          <span className="block font-serif text-base text-black tracking-[-0.85px]">Partner&apos;s name</span>
                          <input
                            type="text"
                            maxLength={100}
                            value={invitedPartnerName}
                            onChange={(e) => setInvitedPartnerName(e.target.value)}
                            placeholder="Partner's name"
                            className="w-full px-2.5 py-2.5 rounded-[15px] border border-[#bfbfbf] bg-white font-serif text-lg sm:text-xl text-black placeholder:text-[#737373] tracking-[-0.85px] focus:outline-none focus:border-[#b4562a]"
                          />
                        </label>
                        <div className="flex items-center gap-2 px-2.5 py-2.5 rounded-[15px] border border-[#bfbfbf]">
                          {inviteUrl ? (
                            <>
                              <span className="flex-1 min-w-0 truncate font-serif text-lg sm:text-xl text-[#737373] tracking-[-0.85px]">
                                {inviteUrl}
                              </span>
                              <button
                                type="button"
                                aria-label="Copy invitation link"
                                onClick={() => copyInviteLink(() => {
                                  setCopiedInviteLink(true);
                                  window.setTimeout(() => setCopiedInviteLink(false), 2000);
                                })}
                                className="shrink-0 flex items-center gap-1.5 cursor-pointer"
                              >
                                {copiedInviteLink && <span className="font-serif text-sm text-[#16a34a]">Copied</span>}
                                <Image src="/images/onboarding/copy.svg" alt="" width={24} height={24} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleGenerateInvite()}
                              disabled={isInviting}
                              className="flex-1 text-left font-serif text-lg sm:text-xl text-[#b4562a] hover:text-[#9c4820] tracking-[-0.85px] cursor-pointer disabled:cursor-wait"
                            >
                              {isInviting ? "Creating your private link..." : "Create the private invitation link"}
                            </button>
                          )}
                        </div>
                        {inviteError && (
                          <p role="alert" className="font-serif text-sm text-[#ff0000]">
                            {inviteError}
                          </p>
                        )}
                        <p className="font-serif text-sm text-[#737373] tracking-[-0.85px]">
                          The link can only be used once. Share it via WhatsApp or your preferred app.
                          {!inviteUrl && " Creating a new link cancels any link you shared before."}
                        </p>
                      </FigmaCard>
                    )}

                    <FigmaCard className="space-y-5">
                      <PersonRow
                        who="me"
                        name="Your profile"
                        detail={meDone ? "Onboarding & transaction completed" : "Onboarding isn't finished yet"}
                        badge={meDone ? <StatusBadge tone="green">Done</StatusBadge> : <StatusBadge tone="yellow">Not finished</StatusBadge>}
                      />
                      <PersonRow
                        who="partner"
                        name={partnerProgress ? promisePartnerName : invitedPartnerName.trim() || "Your partner"}
                        detail={
                          !partnerProgress
                            ? "Hasn't joined your space yet"
                            : partnerDone
                              ? "Onboarding & transaction completed"
                              : "Waiting to be resolved"
                        }
                        badge={partnerDone ? <StatusBadge tone="green">Done</StatusBadge> : <StatusBadge tone="yellow">Waiting</StatusBadge>}
                      />
                      {!meDone && promiseStatus && (
                        <button
                          type="button"
                          onClick={() => setCurrentScreen(1)}
                          className="font-serif text-base text-[#b4562a] hover:text-[#9c4820] cursor-pointer"
                        >
                          Finish my profile →
                        </button>
                      )}
                    </FigmaCard>

                    {promiseError && (
                      <p role="alert" className="font-serif text-sm text-[#ff0000]">
                        {promiseError}
                      </p>
                    )}
                    <div className="flex items-center justify-between gap-3 pt-1">
                      <BackLink
                        label={openedFromDashboard && onClose ? "Dashboard" : "Back"}
                        onClick={() => (openedFromDashboard && onClose ? onClose() : setCurrentScreen(23))}
                      />
                      <div className="flex items-center gap-4">
                        {!(meDone && partnerDone && promiseStatus?.promise) && (
                          <span className="hidden sm:inline font-serif text-sm text-[#737373] tracking-[-0.85px] text-right">
                            {!meDone
                              ? "Finish your profile first"
                              : !partnerProgress
                                ? `Waiting for ${invitedPartnerName.trim() || "your partner"} to join`
                                : !partnerDone
                                  ? `Waiting for ${promisePartnerName} to finish`
                                  : "Seiya is drafting your clauses…"}
                          </span>
                        )}
                        <PrimaryButton
                          onClick={() => setCurrentScreen(25)}
                          disabled={!meDone || !partnerDone || !promiseStatus?.promise}
                        >
                          {meDone && partnerDone && !promiseStatus?.promise ? "Preparing..." : "Done"}
                        </PrimaryButton>
                      </div>
                    </div>
                  </div>
                )}

                {/* 8. Screen 25: Seiya's promise draft · 2 of 2 (Figma Component 1 · V24) */}
                {currentScreenConfig.type === "promise-draft" && (
                  <div className="space-y-5">
                    <CoupleHeader partnerName={promisePartnerName} partnerDone={partnerDone} />

                    {!promiseStatus?.promise ? (
                      <FigmaCard>
                        <p className="font-serif text-lg text-black">Seiya is drafting your recommendations…</p>
                        <p className="font-serif text-sm sm:text-base text-[#737373]">
                          This page refreshes on its own once both of your profiles are read.
                        </p>
                      </FigmaCard>
                    ) : (
                      <>
                        <div className="tracking-[-0.85px] pt-1">
                          <p className="font-serif text-lg sm:text-xl text-black">Select candidate clause</p>
                          <p className="font-serif text-sm sm:text-base text-[#737373]">
                            Seiya recommends based on your profile · {selectedClauseIds.length} selected
                          </p>
                        </div>

                        {partnerResponse && !promiseActive && (
                          <div className="bg-[#fffaee] border border-[#fcc850] rounded-[15px] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">
                              {promisePartnerName} saved a version with {partnerResponse.selected.length} clauses. Marked
                              clauses show where you differ.
                            </p>
                            <button
                              type="button"
                              onClick={adoptPartnerVersion}
                              className="shrink-0 h-9 px-3 rounded-[12px] border border-[#b4562a] text-[#b4562a] hover:bg-[#b4562a] hover:text-white font-jakarta font-semibold text-sm transition-colors cursor-pointer"
                            >
                              Use {promisePartnerName}&apos;s version
                            </button>
                          </div>
                        )}

                        {draftClauses.map((clause) => {
                          const checked = selectedClauseIds.includes(clause.id);
                          const partnerVersion = partnerClauseById.get(clause.id);
                          return (
                            <ClauseCard
                              key={clause.id}
                              clause={clause}
                              checked={checked}
                              onToggle={() => toggleClause(clause.id)}
                              onChange={updateClause}
                              onRemove={clause.kind === "custom" ? () => removeOwnClause(clause.id) : undefined}
                              currency={promiseCurrency}
                              partnerName={promisePartnerName}
                              ownerLabel={isHouseholdCreator ? "You" : promisePartnerName}
                              memberLabel={isHouseholdCreator ? promisePartnerName : "You"}
                              partnerPicked={Boolean(partnerVersion) && !promiseActive}
                              partnerDiffers={
                                !promiseActive &&
                                Boolean(partnerVersion) &&
                                checked &&
                                clauseSignature(partnerVersion!) !== clauseSignature(clause)
                              }
                            />
                          );
                        })}

                        <WriteOwnClauseButton onClick={addOwnClause} />
                      </>
                    )}

                    <LockNotice title="Seiya's Promise is not a legal document">
                      Each clause must be approved by each partner, can be renegotiated or revoked at any time, and will
                      be reviewed every 3 months
                    </LockNotice>

                    {promiseError && (
                      <p role="alert" className="font-serif text-sm text-[#ff0000] text-right">
                        {promiseError}
                      </p>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      <BackLink onClick={() => setCurrentScreen(24)} />
                      {promiseActive ? (
                        <PrimaryButton onClick={() => setCurrentScreen(26)}>See Agreement</PrimaryButton>
                      ) : (
                        <PrimaryButton
                          onClick={() => void handleSavePromise()}
                          disabled={isSavingPromise || !promiseStatus?.promise}
                        >
                          {isSavingPromise ? "Saving..." : "Save Recommendations"}
                        </PrimaryButton>
                      )}
                    </div>
                  </div>
                )}

                {/* 9. Screen 26: Mutual agreement (Figma Component 1 · V26) */}
                {currentScreenConfig.type === "mutual-agreement" && (
                  <div className="space-y-5">
                    <FigmaCard>
                      <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#e6e6e6]">
                        <div className="tracking-[-0.85px]">
                          <p className="font-serif text-sm sm:text-base text-[#737373]">Shared version</p>
                          <p className="font-serif text-lg sm:text-xl text-black">
                            {(myResponse?.selected.length ?? selectedClauseIds.length)} clauses selected
                          </p>
                        </div>
                        {promiseActive ? (
                          <StatusBadge tone="green">Active</StatusBadge>
                        ) : (
                          <StatusBadge tone="red">Not active yet</StatusBadge>
                        )}
                      </div>
                      <div className="space-y-5 pt-5">
                        <PersonRow
                          who="me"
                          name="Your profile"
                          detail={myResponse ? "You have already reviewed this version" : "You haven't saved your version yet"}
                          badge={myResponse ? <StatusBadge tone="green">Agreed</StatusBadge> : <StatusBadge tone="yellow">Waiting</StatusBadge>}
                        />
                        <PersonRow
                          who="partner"
                          name={promisePartnerName}
                          detail={
                            promiseActive
                              ? "Agree to the same version of the clause"
                              : partnerResponse
                                ? "Saved a different version, adjust to negotiate"
                                : "Hasn't reviewed the clauses yet"
                          }
                          badge={
                            promiseActive ? (
                              <StatusBadge tone="green">Agreed</StatusBadge>
                            ) : partnerResponse ? (
                              <StatusBadge tone="red">Different</StatusBadge>
                            ) : (
                              <StatusBadge tone="yellow">Waiting</StatusBadge>
                            )
                          }
                        />
                      </div>
                    </FigmaCard>

                    {!promiseActive && partnerResponse && myResponse && (
                      <LockNotice title="Your versions are different">
                        Open Adjust to see the marked clauses, then save the same version as {promisePartnerName}, or use
                        their version. Seiya&apos;s Promise activates as soon as both versions match.
                      </LockNotice>
                    )}
                    {promiseActive && (
                      <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">
                        Your agreed numbers are now the household rules, and your shared wallets are being prepared.
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      {promiseActive ? (
                        <span />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCurrentScreen(25)}
                          className="font-serif text-lg sm:text-xl text-[#bfbfbf] hover:text-[#737373] tracking-[-0.85px] transition-colors cursor-pointer"
                        >
                          Adjust
                        </button>
                      )}
                      <PrimaryButton onClick={() => void handleEnterDashboard()}>Enter the dashboard</PrimaryButton>
                    </div>
                  </div>
                )}

                {/* Standard Bottom Navigation for Profiling Questions (Screens 1 to 21) */}
                {currentScreen < 22 && (
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
                      {!currentAnswered && (
                        <span className="font-serif text-xs sm:text-sm text-[#808988]">
                          {currentScreenConfig.type === "text" ? "Write your answer to continue" : "Choose an answer to continue"}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={goToNextProfilingScreen}
                        disabled={!currentAnswered}
                        className="px-5 py-2.5 rounded-full bg-[#B45529] hover:bg-[#9e382b] text-white font-sans font-medium text-xs sm:text-sm flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#B45529] disabled:active:scale-100"
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
                    </div>
                  </div>
                )}
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
              <h1 className="font-serif text-3xl sm:text-4xl text-[#2a2b2f] font-normal tracking-tight">
                Connect with Your Partner
              </h1>
              <p className="text-xs sm:text-sm text-[#78716c] max-w-lg mx-auto leading-relaxed">
                Share your private invite link with your partner. Once they connect, Seiya&apos;s AI synthesizes both your profiling insights into a mutual contract proposal.
              </p>
            </div>

            {/* Central Invite & Pairing Card */}
            <div className="bg-[#FEF9E9] border border-[#eeddc8] rounded-[28px] p-6 sm:p-9 shadow-sm space-y-8">
              {/* Partner Code Box */}
              <div className="space-y-4">
                <label className="block text-xs font-bold text-[#5c5349] uppercase tracking-wider text-center">
                  Your Couple Invite Link
                </label>

                {/* Invitation link (single-use token generated by the backend) */}
                <div className="bg-white rounded-2xl border border-[#eeddc8] p-5 sm:p-6 shadow-xs flex flex-col items-center gap-5">
                  {inviteUrl ? (
                    <div className="w-full rounded-xl bg-[#FEFBF5] border-2 border-[#e8cba5] px-4 py-3 font-mono text-xs sm:text-sm text-[#2a2b2f] break-all text-center select-all">
                      {inviteUrl}
                    </div>
                  ) : partnerConnected ? (
                    <p className="text-xs text-emerald-700 text-center">
                      {otherDisplayName} has joined your shared space.
                    </p>
                  ) : (
                    <div className="w-full">
                      <input
                        type="text"
                        value={invitedPartnerName}
                        onChange={(e) => setInvitedPartnerName(e.target.value)}
                        placeholder="Partner's name"
                        className="w-full px-4 py-2.5 rounded-xl border border-[#ded7ce] bg-[#FEFBF5] text-sm text-[#2a2b2f] placeholder-[#a69e96] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A] font-serif"
                      />
                    </div>
                  )}

                  <p className="text-xs text-[#8c827a] text-center">
                    {inviteUrl ? "Valid for 7 days · single use" : "Create a private link and share it with your partner"}
                  </p>
                  {inviteError && (
                    <p role="alert" className="text-xs text-red-600 text-center">
                      {inviteError}
                    </p>
                  )}

                  {!partnerConnected && (
                    <div className="flex items-center gap-2.5 w-full sm:w-auto justify-center">
                      {inviteUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            copyInviteLink(() => {
                              setCopiedCode(true);
                              setTimeout(() => setCopiedCode(false), 2500);
                            })
                          }
                          className="px-5 py-2.5 rounded-xl bg-[#B4562A] hover:bg-[#9c4820] text-white text-xs font-serif font-medium flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                        >
                          <SolarIcon name={copiedCode ? "check-circle" : "paperclip"} size={14} />
                          <span>{copiedCode ? "Link Copied!" : "Copy Invite Link"}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleGenerateInvite}
                          disabled={isInviting}
                          className="px-5 py-2.5 rounded-xl bg-[#B4562A] hover:bg-[#9c4820] text-white text-xs font-serif font-medium flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                        >
                          <SolarIcon name="arrow-right" size={14} />
                          <span>{isInviting ? "Creating link..." : "Create Invite Link"}</span>
                        </button>
                      )}
                    </div>
                  )}
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
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${partnerConnected ? "bg-emerald-100 text-emerald-700 scale-110" : "bg-[#f5ecde] text-[#8c827a]"
                      }`}>
                      <SolarIcon name={partnerConnected ? "heart" : "refresh"} size={16} />
                    </div>
                  </div>

                  {/* Partner B */}
                  <div className={`sm:col-span-3 flex items-center gap-3 p-3 rounded-xl border transition-all ${partnerConnected
                      ? "bg-emerald-50/70 border-emerald-200"
                      : "bg-[#fdfaf5] border-dashed border-[#ded7ce]"
                    }`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-serif font-bold text-base ${partnerConnected
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

                {!partnerConnected && (
                  <p className="text-[11px] text-[#78716c] text-center">
                    This page updates automatically when {activePartnerBName} accepts the invitation.
                  </p>
                )}
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
                  onClick={handleProceedToContract}
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
        // During onboarding (no partner connected yet) this page is the personal
        // AI recommendation step; signatures happen later from the dashboard.
        const recommendationMode = !household || !partnerConnected;

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
                <h1 className="font-serif text-3xl sm:text-4xl text-[#2a2b2f] font-normal tracking-tight">
                  Couple Financial Agreement
                </h1>
                <p className="text-xs sm:text-sm text-[#78716c] max-w-xl mx-auto leading-relaxed">
                  {recommendationMode
                    ? "Based on your profiling answers, Seiya AI formulated the recommendations below. Adjust anything you like — once you and your partner are connected, the first finished terms are sent to the other for approval."
                    : "Based on your combined profiling answers, Seiya AI formulated the recommendations below. You can customize every parameter manually. Both of you must sign before the contract activates."}
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
                        {formatMoney(toLocalAmount(ai.threshold), contractCurrency, locale)}
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
                            className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-colors cursor-pointer ${active
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
                        <strong className="text-[#2a2b2f]">Live Calculation:</strong> For a {formatMoney(toLocalAmount(1000), contractCurrency, locale)} monthly shared utility/rent expense: {activePartnerAName} contributes <strong>{formatMoney((toLocalAmount(1000) * contractSplitA) / 100, contractCurrency, locale)}</strong> and {activePartnerBName} contributes <strong>{formatMoney((toLocalAmount(1000) * contractSplitB) / 100, contractCurrency, locale)}</strong>.
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
                      {[100, 250, 500, 1000, 2500].map((usd) => toLocalAmount(usd)).map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setContractThreshold(amt)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-serif transition-colors cursor-pointer ${contractThreshold === amt
                              ? "bg-[#B4562A] text-white font-medium shadow-2xs"
                              : "bg-white hover:bg-[#fbf4de] text-[#5c5349] border border-[#ded7ce]"
                            }`}
                        >
                          {formatMoney(amt, contractCurrency, locale)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8c827a]">
                        {contractCurrency}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="1"
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
                          className={`p-4 rounded-xl border cursor-pointer transition-all ${active
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
                            10 PM - 8 AM
                          </span>
                        </div>
                        <p className="text-[11px] text-[#78716c]">
                          Late-night or impulse purchases above {formatMoney(contractThreshold * 2, contractCurrency, locale)} are held for 8 hours before they can go through.
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
              {!recommendationMode && (
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
                  <div className={`p-5 rounded-2xl border transition-all ${contractPartnerASigned
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
                          Space Creator{myRole === "partner_a" ? " (You)" : ""}
                        </div>
                      </div>
                    </div>

                    {contractPartnerASigned ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-2 rounded-xl">
                          <SolarIcon name="check-circle" size={16} />
                          <span>Signed by {activePartnerAName}</span>
                        </div>
                      </div>
                    ) : (
                      myRole === "partner_a" ? (
                        <button
                          type="button"
                          onClick={handleSignContract}
                          disabled={isSigning}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                        >
                          <SolarIcon name="shield-check" size={15} />
                          <span>{isSigning ? "Signing..." : `Sign as ${activePartnerAName}`}</span>
                        </button>
                      ) : (
                        <div className="w-full py-2.5 px-4 rounded-xl bg-[#f5ecde] text-[#8c827a] font-serif text-xs font-medium flex items-center justify-center gap-2">
                          <SolarIcon name="clock-circle" size={15} />
                          <span>Waiting for {activePartnerAName} to sign</span>
                        </div>
                      )
                    )}
                  </div>

                  {/* Signature 2: Partner B (Partner) */}
                  <div className={`p-5 rounded-2xl border transition-all ${contractPartnerBSigned
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
                          Partner (Co-Owner){myRole === "partner_b" ? " (You)" : ""}
                        </div>
                      </div>
                    </div>

                    {contractPartnerBSigned ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-100/70 px-3 py-2 rounded-xl">
                          <SolarIcon name="check-circle" size={16} />
                          <span>Signed by {activePartnerBName}</span>
                        </div>
                      </div>
                    ) : (
                      myRole === "partner_b" ? (
                        <button
                          type="button"
                          onClick={handleSignContract}
                          disabled={isSigning}
                          className="w-full py-2.5 px-4 rounded-xl bg-stone-800 hover:bg-stone-900 text-white font-serif text-xs font-medium flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                        >
                          <SolarIcon name="shield-check" size={15} />
                          <span>{isSigning ? "Signing..." : `Sign as ${activePartnerBName}`}</span>
                        </button>
                      ) : (
                        <div className="w-full py-2.5 px-4 rounded-xl bg-[#f5ecde] text-[#8c827a] font-serif text-xs font-medium flex items-center justify-center gap-2">
                          <SolarIcon name="clock-circle" size={15} />
                          <span>
                            {partnerConnected
                              ? `Waiting for ${activePartnerBName} to sign`
                              : `${activePartnerBName} hasn't joined yet`}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Ratification Status Banner */}
                <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs ${bothSigned
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

                  {!bothSigned && mySigned && (
                    <button
                      type="button"
                      onClick={handleEnterHome}
                      className="text-[11px] font-serif underline text-[#B4562A] hover:text-[#9c4820] shrink-0 cursor-pointer"
                    >
                      Continue to dashboard — {otherDisplayName} can sign later
                    </button>
                  )}
                </div>
                {contractError && (
                  <p role="alert" className="text-xs text-red-600 text-center">
                    {contractError}
                  </p>
                )}
              </div>
              )}

              {/* Bottom Navigation: Next during onboarding */}
              {recommendationMode && (
                <div className="space-y-2 pt-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("questionnaire");
                        setCurrentScreen(23);
                      }}
                      className="text-xs sm:text-sm font-serif text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <SolarIcon name="arrow-left" size={14} />
                      <span>Back to Transaction History</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRecommendationNext}
                      disabled={isSavingTerms}
                      className="px-8 py-3.5 rounded-full font-serif text-sm flex items-center gap-2 transition-all bg-[#B4562A] hover:bg-[#9c4820] text-white shadow-lg hover:shadow-xl cursor-pointer active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                    >
                      <span>{isSavingTerms ? "Saving..." : selectedPath === "join" && !household ? "Next: Enter Invitation Link" : "Next: Get Invitation Link"}</span>
                      <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </button>
                  </div>
                  {contractError && (
                    <p role="alert" className="text-xs text-red-600 text-right">
                      {contractError}
                    </p>
                  )}
                </div>
              )}

              {/* Bottom Navigation & Ratify CTA */}
              {!recommendationMode && (
              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={handleEnterHome}
                  className="text-xs sm:text-sm font-serif text-[#78716c] hover:text-[#2a2b2f] flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <SolarIcon name="arrow-left" size={14} />
                  <span>Back to Dashboard</span>
                </button>

                <button
                  type="button"
                  disabled={!bothSigned}
                  onClick={handleRatifyContract}
                  className={`px-8 py-3.5 rounded-full font-serif text-sm flex items-center gap-2 transition-all ${bothSigned
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
              )}
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

            {/* Clean Accord Certificate Quick-Access Button & Collapsible Detail */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCertificateDetail(!showCertificateDetail)}
                className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#fdfbf7] hover:bg-[#f6eee2] border border-[#ebd8c1] text-[#4d4439] text-xs font-medium tracking-wide transition-all shadow-2xs group cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-[#d4af37]/15 text-[#a37f14] flex items-center justify-center">
                  <SolarIcon name="shield-check" size={13} />
                </div>
                <span>
                  {showCertificateDetail ? "Hide Accord Details" : "View Accord Certificate Details"}
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Active
                </span>
                <SolarIcon
                  name={showCertificateDetail ? "arrow-up" : "arrow-down"}
                  size={14}
                  className="text-[#8c827a] transition-transform duration-200 group-hover:translate-y-0.5"
                />
              </button>

              {/* Collapsible Certificate Card */}
              {showCertificateDetail && (
                <div className="w-full bg-[#FEF9E9] rounded-2xl p-5 sm:p-7 text-left space-y-5 relative overflow-hidden border border-[#eeddc8] shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                  {/* Subtle Watermark Stamp */}
                  <div className="absolute right-3 bottom-3 opacity-5 pointer-events-none">
                    <SolarIcon name="shield-check" size={140} />
                  </div>

                  {/* Certificate Header */}
                  <div className="flex items-center justify-between border-b border-[#ebd7be] pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-[#d4af37]/20 text-[#a37f14] flex items-center justify-center">
                        <SolarIcon name="shield-check" size={20} />
                      </div>
                      <div>
                        <h3 className="font-serif text-sm font-bold text-[#2a2b2f] tracking-wide">
                          COUPLE FINANCIAL ACCORD CERTIFICATE
                        </h3>
                        <p className="text-[10px] font-mono text-[#8c827a]">
                          CONTRACT #SEIYA-2026-MUTUAL-ACCORD • WEBANK BLOCKCHAIN
                        </p>
                      </div>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-300">
                      STATUS: ACTIVE
                    </span>
                  </div>

                  {/* Certificate Key Terms Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                      <span className="text-[#8c827a] font-serif">Contribution & Split Ratio:</span>
                      <div className="font-mono font-bold text-sm text-[#2a2b2f]">
                        {contractSplitA}% {activePartnerAName} : {contractSplitB}% {activePartnerBName}
                      </div>
                      <p className="text-[11px] text-[#6d6459]">
                        Shared expenses & goals allocated according to this mutual ratio.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
                      <span className="text-[#8c827a] font-serif">Dual-Approval Threshold:</span>
                      <div className="font-mono font-bold text-sm text-[#2a2b2f]">
                        {formatMoney(contract.approvalThreshold || contractThreshold, contractCurrency, locale)}
                      </div>
                      <p className="text-[11px] text-[#6d6459]">
                        Purchases exceeding this require both digital signatures.
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
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

                    <div className="p-3 rounded-xl bg-white/80 border border-[#edd7be] space-y-1">
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
                  <div className="pt-2 border-t border-[#ebd7be] flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs">
                    <div className="flex items-center gap-2 text-emerald-800">
                      <SolarIcon name="check-circle" size={15} />
                      <span>
                        Ratified by <strong>{activePartnerAName}</strong> & <strong>{activePartnerBName}</strong>
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-[#8c827a]">
                      Cryptographic Hash: 0x7F3...9E2A (Consensus Verified)
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mascot Greeting */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 p-5 rounded-2xl bg-white/70 border border-[#eeddc8] text-left">
              <div className="w-16 h-16 relative shrink-0">
                <Image
                  src="/images/auth/auth-mascot.png"
                  alt="Seiya Financial Mediator"
                  fill
                  sizes="64px"
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
                You&apos;re signed in as {myDisplayName}.
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
      {showWechatSheet && (
        <div
          className="fixed inset-0 z-50 bg-[#2a2b2f]/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wechat-sheet-title"
          onClick={() => setShowWechatSheet(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-full bg-[#e9f9f0] flex items-center justify-center">
                  <WeChatLogo size={22} />
                </span>
                <div>
                  <h3 id="wechat-sheet-title" className="font-serif text-lg text-[#2a2b2f]">
                    Continue with WeChat
                  </h3>
                  <p className="text-xs text-[#808988]">Scan with the WeChat app to sign in</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWechatSheet(false)}
                className="p-1.5 rounded-full text-[#808988] hover:text-[#2a2b2f] hover:bg-black/5 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <SolarIcon name="close-circle" size={20} />
              </button>
            </div>

            {/* QR placeholder: WeChat sign-in is not connected yet */}
            <div className="relative mx-auto w-48 h-48 rounded-[20px] border border-[#e6e6e6] bg-[#fafafa] overflow-hidden">
              <div
                className="absolute inset-3 opacity-[0.12]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#2a2b2f 50%,transparent 50%),linear-gradient(#2a2b2f 50%,transparent 50%)",
                  backgroundSize: "14px 14px",
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                <span className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                  <WeChatLogo size={28} />
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-[#fffaee] border border-[#fcc850] text-[11px] font-semibold text-[#9a7414]">
                  Coming soon
                </span>
              </div>
            </div>

            <p className="text-sm text-[#515151] text-center leading-relaxed">
              WeChat sign-in is on its way. For now, {mode === "register" ? "create your account" : "sign in"} with your
              full name and password.
            </p>

            <button
              type="button"
              onClick={() => setShowWechatSheet(false)}
              className="w-full py-3 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-base transition-colors cursor-pointer"
            >
              {mode === "register" ? "Create account with name" : "Sign in with name"}
            </button>
          </div>
        </div>
      )}

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
                  Partner Invitation Link
                </label>
                <input
                  type="text"
                  required
                  value={inviteCode}
                  onChange={(e) => {
                    // Tokens are case-sensitive; never transform them.
                    setInviteCode(e.target.value.trim());
                    setJoinError("");
                  }}
                  placeholder="Paste the invitation link"
                  className="w-full px-4 py-3 rounded-xl border border-[#ded7ce] bg-white text-center font-mono text-xs text-[#2a2b2f] placeholder-[#a69e96] focus:outline-none focus:ring-2 focus:ring-[#B4562A]/20 focus:border-[#B4562A]"
                />
                {joinError && (
                  <p className="text-xs text-red-600 mt-1">{joinError}</p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-white/70 border border-[#eedecb] text-xs text-[#5a534c] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#8c827a]">Partner Space:</span>
                  <span className="font-semibold text-[#2a2b2f]">
                    Your partner&apos;s shared space
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8c827a]">Your Role:</span>
                  <span className="font-semibold text-[#2a2b2f]">
                    {authUser?.fullName ?? "You"} (Co-Owner)
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
                  disabled={isJoining}
                  className="flex-1 py-3 px-5 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-serif text-sm transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {isJoining ? "Joining..." : "Join Space"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
