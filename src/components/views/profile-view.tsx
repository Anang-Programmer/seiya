"use client";

import React, { useState, useEffect } from "react";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { PinAuthDialog } from "@/components/modals/pin-auth-dialog";

export interface ProfileViewProps {
  onLogout?: () => void;
  initialTab?: "overview" | "contract" | "security" | "privacy" | "preferences";
}

export function ProfileView({ onLogout, initialTab = "overview" }: ProfileViewProps) {
  const {
    currentUser,
    setCurrentUser,
    partnerAName,
    partnerBName,
    setPartnerNames,
    wallets,
    contract,
    proposeContractChange,
    approveContractChange,
    reportingCurrency,
    setReportingCurrency,
    locale,
    setLocale,
    timeZone,
    setTimeZone,
    settlement,
    settleUp,
    approvals,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"overview" | "contract" | "security" | "privacy" | "preferences">(
    initialTab || "overview"
  );
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser === "partner_a" ? partnerAName : partnerBName);
  const [privacyLock, setPrivacyLock] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  // Contract form state
  const [thresholdInput, setThresholdInput] = useState(contract.approvalThreshold.toString());
  const [splitDinaInput, setSplitDinaInput] = useState(contract.splitPartnerB.toString());
  const [splitRakaInput, setSplitRakaInput] = useState(contract.splitPartnerA.toString());
  const [approveEveryShared, setApproveEveryShared] = useState(contract.approveEverySharedPurchase);

  const isProposed = contract.status === "pending_partner_approval";
  const proposedBy = contract.proposedChange?.proposedBy;
  const canIApprove = isProposed && proposedBy !== currentUser;
  const proposedByName = proposedBy === "partner_a" ? partnerAName : partnerBName;

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    setNameInput(currentUser === "partner_a" ? partnerAName : partnerBName);
  }, [currentUser, partnerAName, partnerBName]);

  useEffect(() => {
    setThresholdInput(contract.approvalThreshold.toString());
    setSplitDinaInput(contract.splitPartnerB.toString());
    setSplitRakaInput(contract.splitPartnerA.toString());
    setApproveEveryShared(contract.approveEverySharedPurchase);
  }, [contract]);

  const currentDisplayName = currentUser === "partner_a" ? partnerAName : partnerBName;
  const partnerDisplayName = currentUser === "partner_a" ? partnerBName : partnerAName;
  const currentInitial = currentDisplayName.charAt(0).toUpperCase();
  const currentRoleLabel = currentUser === "partner_a" ? "Partner A · Co-Planner" : "Partner B · Co-Planner";
  const currentWallet = currentUser === "partner_a" ? wallets.personalA : wallets.personalB;
  const currentSplit = currentUser === "partner_a" ? contract.splitPartnerA : contract.splitPartnerB;
  const partnerSplit = currentUser === "partner_a" ? contract.splitPartnerB : contract.splitPartnerA;

  const pendingCountForUser = approvals.filter(
    (a) => a.status === "pending" && a.approver === currentUser
  ).length;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSaveName = () => {
    if (!nameInput.trim()) return;
    if (currentUser === "partner_a") {
      setPartnerNames(nameInput.trim(), partnerBName);
    } else {
      setPartnerNames(partnerAName, nameInput.trim());
    }
    setIsEditingName(false);
    showToast("Profile name updated successfully.");
  };

  const handleSwitchPersona = (role: "partner_a" | "partner_b") => {
    setCurrentUser(role);
    setNameInput(role === "partner_a" ? partnerAName : partnerBName);
    setIsEditingName(false);
  };

  const handleProposeContract = (e: React.FormEvent) => {
    e.preventDefault();
    proposeContractChange(
      Number(thresholdInput),
      contract.thresholdCurrency,
      Number(splitDinaInput),
      Number(splitRakaInput),
      approveEveryShared
    );
    showToast("Contract amendment proposed. Partner signature required.");
  };

  const handleApproveContract = () => {
    setShowPinModal(true);
  };

  const handlePinSuccess = () => {
    approveContractChange();
    showToast("Contract amendment approved & active via Security PIN!");
  };

  const availableCurrencies = Object.values(SUPPORTED_CURRENCIES);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24 md:pb-16 animate-in fade-in-0 duration-200">
      {/* 1. ACTIVE PERSONA SWITCHER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-[#f5eee1] rounded-[16px] border border-[#d1c9bf]/30">
        <div className="flex items-center gap-2">
          <SolarIcon name="users-group-rounded" size={17} className="text-[#B45529]" />
          <span className="text-xs font-bold text-[#2a2b2f]">Active Signing Persona</span>
          <span className="text-[11px] text-[#808988] hidden sm:inline">· Switch to preview dual-key view</span>
        </div>
        <div className="inline-flex items-center gap-1.5 bg-[#fef9ef] p-1 rounded-full border border-[#d1c9bf]/50 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleSwitchPersona("partner_a")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentUser === "partner_a"
                ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                : "text-[#515151] hover:text-[#2a2b2f]"
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-white/90" />
            <span>{partnerAName} (Partner A)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchPersona("partner_b")}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
              currentUser === "partner_b"
                ? "bg-[#3B1D17] text-[#fef9ef] shadow-xs"
                : "text-[#515151] hover:text-[#2a2b2f]"
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-white/90" />
            <span>{partnerBName} (Partner B)</span>
          </button>
        </div>
      </div>

      {/* 2. PROFILE HERO CARD */}
      <div className="p-5 sm:p-6 rounded-[20px] bg-[#f5eee1] border border-[#d1c9bf]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-2xs">
        <div className="flex items-start sm:items-center gap-4">
          <div
            className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center text-2xl font-bold text-[#fef9ef] shrink-0 shadow-md ${
              currentUser === "partner_a" ? "bg-[#B45529]" : "bg-[#3B1D17]"
            }`}
          >
            {currentInitial}
          </div>
          <div className="space-y-1">
            {isEditingName ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="h-8 text-sm font-semibold max-w-[180px] bg-white border-[#d1c9bf]"
                  placeholder="Enter name"
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveName} className="h-8 px-3 text-xs bg-[#B45529] text-[#fef9ef]">
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)} className="h-8 px-2.5 text-xs">
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-serif font-semibold text-[#2a2b2f] tracking-tight">
                  {currentDisplayName}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setNameInput(currentDisplayName);
                    setIsEditingName(true);
                  }}
                  className="text-[#808988] hover:text-[#B45529] transition-colors p-1 rounded-full hover:bg-[#ece3d3]"
                  title="Edit display name"
                  aria-label="Edit name"
                >
                  <SolarIcon name="edit" size={15} />
                </button>
              </div>
            )}
            <p className="text-xs text-[#515151] font-medium">{currentRoleLabel}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#dce8db] text-[#2d5232] text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2d5232]" />
                Paired with {partnerDisplayName}
              </span>
              <span className="text-[11px] text-[#808988] font-mono">Couple Space #8821</span>
            </div>
          </div>
        </div>

        <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-[#d1c9bf]/30">
          <Badge
            variant={currentUser === "partner_a" ? "need_approval" : "neutral"}
            className="text-xs px-3 py-1 font-semibold"
          >
            {currentUser === "partner_a" ? "Terracotta Key (Partner A)" : "Espresso Key (Partner B)"}
          </Badge>
          <span className="text-[11px] text-[#808988]">Dual-Key Gateway Signer</span>
        </div>
      </div>

      {/* 3. NAVIGATION PILL TABS */}
      <div className="flex items-center gap-1 p-1 bg-[#f5eee1] rounded-full border border-[#d1c9bf]/40 text-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer shrink-0 ${
            activeTab === "overview"
              ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
              : "text-[#515151] hover:text-[#2a2b2f]"
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("contract")}
          className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
            activeTab === "contract"
              ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
              : "text-[#515151] hover:text-[#2a2b2f]"
          }`}
        >
          <span>Couple Contract</span>
          {isProposed && <span className="w-1.5 h-1.5 rounded-full bg-[#B45529] animate-ping" />}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer shrink-0 ${
            activeTab === "security"
              ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
              : "text-[#515151] hover:text-[#2a2b2f]"
          }`}
        >
          Dual-Key Security
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("privacy")}
          className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer shrink-0 ${
            activeTab === "privacy"
              ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
              : "text-[#515151] hover:text-[#2a2b2f]"
          }`}
        >
          Privacy & Safeguards
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preferences")}
          className={`px-3.5 py-1.5 rounded-full font-semibold transition-all cursor-pointer shrink-0 ${
            activeTab === "preferences"
              ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
              : "text-[#515151] hover:text-[#2a2b2f]"
          }`}
        >
          System Preferences
        </button>
      </div>

      {/* 4. TAB CONTENTS */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          {/* Key metrics grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30">
              <span className="text-xs font-semibold text-[#515151] block mb-1">Contract Split Ratio</span>
              <div className="text-2xl font-bold font-mono text-[#2a2b2f] flex items-baseline gap-1.5">
                <span>{currentSplit}%</span>
                <span className="text-sm font-normal text-[#808988]">/ {partnerSplit}%</span>
              </div>
              <span className="text-xs text-[#808988] mt-1 block">
                {currentDisplayName}&apos;s agreed share on all shared expenses
              </span>
            </div>

            <div className="p-4 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30">
              <span className="text-xs font-semibold text-[#515151] block mb-1">Personal Wallet Balance</span>
              <div className="text-2xl font-bold font-serif text-[#2a2b2f]">
                {formatMoney(currentWallet.balance, currentWallet.currency, locale)}
              </div>
              {currentWallet.currency !== reportingCurrency && (
                <span className="text-xs font-serif text-[#808988] block mt-0.5">
                  ≈ {formatMoneyConverted(currentWallet.balance, currentWallet.currency, reportingCurrency, locale)} ({reportingCurrency})
                </span>
              )}
              <span className="text-xs text-[#808988] mt-1 block">
                {currentWallet.label} · Protected by privacy settings
              </span>
            </div>
          </div>

          {/* Couple Settlement Status Card */}
          <div className="p-4 sm:p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#fef9ef] text-[#B45529] flex items-center justify-center shrink-0 shadow-2xs">
                <SolarIcon name="refresh" size={18} />
              </div>
              <div>
                <span className="text-sm font-bold text-[#2a2b2f] block">Shared IOU Ledger & Settlement</span>
                <p className="text-xs text-[#515151] mt-0.5">
                  {currentUser === "partner_a"
                    ? `${partnerBName} owes you ${formatMoney(settlement.partnerBOwesA, settlement.currency, locale)}`
                    : `You owe ${partnerAName} ${formatMoney(settlement.partnerBOwesA, settlement.currency, locale)}`}
                  {settlement.currency !== reportingCurrency && (
                    <span className="font-serif"> (≈ {formatMoneyConverted(settlement.partnerBOwesA, settlement.currency, reportingCurrency, locale)})</span>
                  )}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={settleUp}
              className="text-xs shrink-0 font-semibold border-[#B45529]/40 hover:bg-[#fef9ef] text-[#B45529]"
            >
              Settle Up Now
            </Button>
          </div>

          {/* Pending Approvals Notice */}
          {pendingCountForUser > 0 && (
            <div className="p-4 rounded-[16px] bg-[#fbf0eb] border border-[#B45529]/30 flex items-center justify-between text-xs gap-3">
              <div className="flex items-center gap-2.5 text-[#B45529] font-medium">
                <SolarIcon name="shield-check" size={18} className="shrink-0" />
                <span>You have <strong>{pendingCountForUser} pending approval request(s)</strong> awaiting your key.</span>
              </div>
              <Badge variant="need_approval" className="shrink-0">Action Required</Badge>
            </div>
          )}

          {/* Quick Action Link Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("contract")}
              className="p-4 rounded-[14px] bg-[#fcf8f0] hover:bg-[#f5eee1] border border-[#d1c9bf]/40 text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div>
                <span className="text-xs font-bold text-[#2a2b2f] block group-hover:text-[#B45529] transition-colors">
                  Adjust Couple Contract
                </span>
                <span className="text-[11px] text-[#808988]">Update split ratios or spending thresholds</span>
              </div>
              <SolarIcon name="arrow-right" size={16} className="text-[#808988] group-hover:text-[#B45529] transition-colors" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("privacy")}
              className="p-4 rounded-[14px] bg-[#fcf8f0] hover:bg-[#f5eee1] border border-[#d1c9bf]/40 text-left transition-all cursor-pointer flex items-center justify-between group"
            >
              <div>
                <span className="text-xs font-bold text-[#2a2b2f] block group-hover:text-[#B45529] transition-colors">
                  Privacy Safeguards
                </span>
                <span className="text-[11px] text-[#808988]">Toggle Total-Only Privacy and Cooling-Off lock</span>
              </div>
              <SolarIcon name="arrow-right" size={16} className="text-[#808988] group-hover:text-[#B45529] transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: COUPLE CONTRACT */}
      {activeTab === "contract" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          {/* Status / Amendment Banner */}
          {isProposed ? (
            <div className="p-4 sm:p-5 rounded-[16px] bg-[#B45529]/10 border border-[#B45529]/25 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#B45529] font-bold text-xs sm:text-sm">
                  <SolarIcon name="shield-check" size={18} />
                  <span>Contract Amendment Pending Partner Signature</span>
                </div>
                <Badge variant="pending">Awaiting Dual-Key</Badge>
              </div>
              <p className="text-xs text-[#333333] leading-relaxed">
                {proposedBy === currentUser ? (
                  <span>
                    You proposed changing the threshold to{" "}
                    <strong className="font-serif text-[#2a2b2f]">
                      {formatMoney(contract.proposedChange!.approvalThreshold, contract.thresholdCurrency, locale)}
                      {contract.thresholdCurrency !== reportingCurrency && (
                        <span className="text-xs font-normal text-[#515151]">
                          {" "}(≈ {formatMoneyConverted(contract.proposedChange!.approvalThreshold, contract.thresholdCurrency, reportingCurrency, locale)})
                        </span>
                      )}
                    </strong>{" "}
                    and split to{" "}
                    <strong className="text-[#2a2b2f]">
                      {contract.proposedChange!.splitPartnerB}% {partnerBName} : {contract.proposedChange!.splitPartnerA}% {partnerAName}
                    </strong>
                    . Waiting for {partnerDisplayName} to sign.
                  </span>
                ) : (
                  <span>
                    {proposedByName} proposed updating threshold to{" "}
                    <strong className="font-serif text-[#2a2b2f]">
                      {formatMoney(contract.proposedChange!.approvalThreshold, contract.thresholdCurrency, locale)}
                      {contract.thresholdCurrency !== reportingCurrency && (
                        <span className="text-xs font-normal text-[#515151]">
                          {" "}(≈ {formatMoneyConverted(contract.proposedChange!.approvalThreshold, contract.thresholdCurrency, reportingCurrency, locale)})
                        </span>
                      )}
                    </strong>{" "}
                    and split to{" "}
                    <strong className="text-[#2a2b2f]">
                      {contract.proposedChange!.splitPartnerB}% {partnerBName} : {contract.proposedChange!.splitPartnerA}% {partnerAName}
                    </strong>
                    .
                  </span>
                )}
              </p>
              {canIApprove && (
                <div className="pt-1.5 flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleApproveContract}
                    className="bg-[#2d5232] hover:bg-[#234227] text-white text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <SolarIcon name="check" size={14} />
                    Sign & Activate Terms via PIN
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-[16px] bg-[#edf3ec] border border-[#2d5232]/20 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-[#2d5232] font-semibold">
                <SolarIcon name="shield-check" size={18} />
                <span>Couple Contract Active & Mutually Enforced</span>
              </div>
              <Badge variant="allow">Dual-Key Bound</Badge>
            </div>
          )}

          {/* Propose Contract Edit Form */}
          <form onSubmit={handleProposeContract} className="space-y-4">
            <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#2a2b2f]">Mutual Expense Split Ratio</h4>
                  <p className="text-xs text-[#808988]">Automated distribution applied to all joint transactions.</p>
                </div>
                <Badge variant="neutral">Sum 100%</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#515151] block mb-1">
                    {partnerBName} (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={splitDinaInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitDinaInput(val);
                      setSplitRakaInput((100 - Number(val)).toString());
                    }}
                    className="bg-white text-xs h-10 border-[#d1c9bf] font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#515151] block mb-1">
                    {partnerAName} (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={splitRakaInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitRakaInput(val);
                      setSplitDinaInput((100 - Number(val)).toString());
                    }}
                    className="bg-white text-xs h-10 border-[#d1c9bf] font-mono font-bold"
                  />
                </div>
              </div>
            </div>

            <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 space-y-4">
              <h4 className="text-sm font-bold text-[#2a2b2f]">Dual-Key Spending Threshold</h4>
              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1">
                  Approval Threshold ({contract.thresholdCurrency})
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="bg-white text-sm h-10 pl-8 font-mono font-bold border-[#d1c9bf]"
                  />
                  <span className="absolute left-3 top-2.5 text-sm text-[#808988] font-bold">$</span>
                </div>
                <span className="text-xs text-[#808988] mt-1.5 block">
                  Purchases exceeding this threshold mandate second partner dual-key approval before final charge.
                </span>
              </div>

              <div className="pt-3 border-t border-[#d1c9bf]/30 flex items-center justify-between">
                <div className="pr-3">
                  <span className="text-xs font-semibold text-[#2a2b2f] block">
                    Require Approval on All Shared Purchases
                  </span>
                  <span className="text-[11px] text-[#808988]">
                    Strict mode: Require signature regardless of transaction amount.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={approveEveryShared}
                  onChange={(e) => setApproveEveryShared(e.target.checked)}
                  className="w-4 h-4 accent-[#B45529] cursor-pointer shrink-0"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                size="sm"
                className="bg-[#B45529] hover:bg-[#96431e] text-[#fef9ef] text-xs px-5 py-2.5 rounded-full shadow-xs cursor-pointer"
              >
                <SolarIcon name="edit" size={14} className="mr-1.5" />
                Propose Contract Amendment
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: DUAL-KEY SECURITY */}
      {activeTab === "security" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-full bg-[#2d5232]/10 text-[#2d5232]">
                  <SolarIcon name="shield-check" size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#2a2b2f]">Biometric Device Passkey Confirmation</h4>
                  <p className="text-xs text-[#515151]">Hardware device key bound for high-value Dual-Key transactions</p>
                </div>
              </div>
              <Badge variant="allow">Active</Badge>
            </div>

            <div className="pt-3 border-t border-[#d1c9bf]/30 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-[12px] bg-[#fef9ef] border border-[#d1c9bf]/40">
                <span className="text-[#808988] block text-[11px]">Single-Signature Limit:</span>
                <span className="font-serif font-bold text-sm text-[#2a2b2f] mt-0.5 block">
                  Under {formatMoney(contract.approvalThreshold, contract.thresholdCurrency, locale)}
                  {contract.thresholdCurrency !== reportingCurrency && (
                    <span className="text-[11px] font-normal text-[#515151]">
                      {" "}(≈ {formatMoneyConverted(contract.approvalThreshold, contract.thresholdCurrency, reportingCurrency, locale)})
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-[#515151] mt-0.5 block">Autonomous card swipe permitted</span>
              </div>
              <div className="p-3 rounded-[12px] bg-[#fef9ef] border border-[#d1c9bf]/40">
                <span className="text-[#808988] block text-[11px]">Dual-Key Threshold:</span>
                <span className="font-serif font-bold text-sm text-[#B45529] mt-0.5 block">
                  {formatMoney(contract.approvalThreshold, contract.thresholdCurrency, locale)}+
                  {contract.thresholdCurrency !== reportingCurrency && (
                    <span className="text-[11px] font-normal text-[#515151]">
                      {" "}(≈ {formatMoneyConverted(contract.approvalThreshold, contract.thresholdCurrency, reportingCurrency, locale)})
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-[#515151] mt-0.5 block">Both partner keys strictly required</span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#515151]">
                <SolarIcon name="users-group-rounded" size={18} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#2a2b2f]">Mutual Couple Space Connection</h4>
                <p className="text-xs text-[#515151]">Consensus-driven shared cryptographic state</p>
              </div>
            </div>
            <span className="text-xs font-mono font-semibold text-[#2d5232] bg-[#dce8db] px-3 py-1 rounded-full">
              2 Active Signers
            </span>
          </div>
        </div>
      )}

      {/* TAB 4: PRIVACY & SAFEGUARDS */}
      {activeTab === "privacy" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-[#2a2b2f]">Total-Only Privacy Lock</h4>
              <p className="text-xs text-[#515151] mt-1 leading-relaxed max-w-xl">
                Conceals specific item descriptions, store names, and merchant details of your personal private transactions while keeping aggregate net balances synchronized.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPrivacyLock(!privacyLock)}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative shrink-0 ${
                privacyLock ? "bg-[#B45529]" : "bg-[#d1c9bf]"
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                  privacyLock ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-[#2a2b2f]">Late-Night Impulse Cooling-Off Safeguard</h4>
              <p className="text-xs text-[#515151] mt-1 leading-relaxed max-w-xl">
                Enforces an automated 8-hour cooling-off holding window on late-night high-value purchases over{" "}
                <span className="font-serif font-semibold text-[#2a2b2f]">
                  {formatMoney(contract.cooldownThreshold, contract.cooldownCurrency, locale)}
                  {contract.cooldownCurrency !== reportingCurrency && (
                    <span className="font-normal text-[#515151]">
                      {" "}(≈ {formatMoneyConverted(contract.cooldownThreshold, contract.cooldownCurrency, reportingCurrency, locale)})
                    </span>
                  )}
                </span>
                .
              </p>
            </div>
            <Badge variant="hold">Protected</Badge>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM PREFERENCES */}
      {activeTab === "preferences" && (
        <div className="space-y-4 animate-in fade-in-0 duration-200">
          <div className="p-5 rounded-[16px] bg-[#f5eee1] border border-[#d1c9bf]/30 space-y-4">
            <h4 className="text-sm font-bold text-[#2a2b2f]">Regional & Currency Formatting</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1">
                  Reporting Currency
                </label>
                <select
                  value={reportingCurrency}
                  onChange={(e) => setReportingCurrency(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-full border border-[#d1c9bf] bg-white text-xs font-mono font-semibold text-[#2a2b2f]"
                >
                  {availableCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol}) - {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1">
                  Locale & Number Formatting
                </label>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-full border border-[#d1c9bf] bg-white text-xs font-semibold text-[#2a2b2f]"
                >
                  <option value="en-US">English (United States)</option>
                  <option value="id-ID">Bahasa Indonesia</option>
                  <option value="ja-JP">Japanese (Japan)</option>
                  <option value="en-GB">English (United Kingdom)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1">
                  Timezone
                </label>
                <select
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-full border border-[#d1c9bf] bg-white text-xs font-semibold text-[#2a2b2f]"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Account Actions / Logout */}
          <div className="p-5 rounded-[16px] bg-[#fbf0eb] border border-[#a34426]/20 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-[#2a2b2f]">Account Session</h4>
              <p className="text-xs text-[#515151] mt-0.5">Switch active user or return to landing page persona selection.</p>
            </div>
            {onLogout && (
              <Button
                variant="outline"
                size="sm"
                onClick={onLogout}
                className="text-xs text-[#a34426] border-[#a34426]/30 hover:bg-[#a34426]/10 cursor-pointer"
              >
                <SolarIcon name="log-out" size={14} className="mr-1.5" />
                Log Out
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 right-6 z-50 p-3 rounded-[12px] bg-[#edf3ec] text-[#2d5232] text-xs font-semibold flex items-center gap-2 border border-[#2d5232]/30 shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
          <SolarIcon name="check-circle" size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Pin Authorization Dialog */}
      <PinAuthDialog
        open={showPinModal}
        onOpenChange={setShowPinModal}
        title="Approve Contract Amendment"
        description="Dual-Key signature requires 6-digit security PIN confirmation to activate new rules."
        actionLabel="Sign & Activate"
        onSuccess={handlePinSuccess}
      />
    </div>
  );
}
