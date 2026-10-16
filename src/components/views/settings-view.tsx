"use client";

import React, { useState } from "react";
import { formatMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { PageHeader } from "@/components/ui/page-header";

export function SettingsView() {
  const {
    currentUser,
    contract,
    proposeContractChange,
    approveContractChange,
    partnerAName,
    partnerBName,
    reportingCurrency,
    setReportingCurrency,
    locale,
    setLocale,
    timeZone,
    setTimeZone,
    simulateMissingFXRate,
    setSimulateMissingFXRate,
    applyDemoPreset,
  } = useApp();

  const [thresholdInput, setThresholdInput] = useState(contract.approvalThreshold.toString());
  const [splitDinaInput, setSplitDinaInput] = useState(contract.splitPartnerB.toString());
  const [splitRakaInput, setSplitRakaInput] = useState(contract.splitPartnerA.toString());
  const [approveEveryShared, setApproveEveryShared] = useState(contract.approveEverySharedPurchase);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const isProposed = contract.status === "pending_partner_approval";
  const proposedBy = contract.proposedChange?.proposedBy;
  const canIApprove = isProposed && proposedBy !== currentUser;
  const proposedByName = proposedBy === "partner_a" ? partnerAName : partnerBName;

  const handlePropose = (e: React.FormEvent) => {
    e.preventDefault();
    proposeContractChange(
      Number(thresholdInput),
      contract.thresholdCurrency,
      Number(splitDinaInput),
      Number(splitRakaInput),
      approveEveryShared
    );
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const availableCurrencies = Object.values(SUPPORTED_CURRENCIES);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">

      {/* Contract Status Banner */}
      {isProposed && (
        <div className="p-5 rounded-[12px] bg-[#B45529]/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#B45529] font-semibold text-xs">
              <SolarIcon name="shield-check" size={16} />
              <span>Pending Partner Approval for Contract Amendment</span>
            </div>
            <Badge variant="pending">Awaiting Signature</Badge>
          </div>
          <p className="text-xs text-[#333333]">
            {proposedBy === currentUser ? (
              <span>
                You proposed changing the threshold to{" "}
                <strong className="font-mono text-[#2a2b2f]">{formatMoney(contract.proposedChange!.approvalThreshold, contract.thresholdCurrency, locale)}</strong> and split to{" "}
                <strong className="text-[#2a2b2f]">{contract.proposedChange!.splitPartnerB}% {partnerBName} : {contract.proposedChange!.splitPartnerA}% {partnerAName}</strong>. Waiting for your partner to sign.
              </span>
            ) : (
              <span>
                {proposedByName} proposed changing the approval threshold to{" "}
                <strong className="font-mono text-[#2a2b2f]">{formatMoney(contract.proposedChange!.approvalThreshold, contract.thresholdCurrency, locale)}</strong> and split to{" "}
                <strong className="text-[#2a2b2f]">{contract.proposedChange!.splitPartnerB}% {partnerBName} : {contract.proposedChange!.splitPartnerA}% {partnerAName}</strong>.
              </span>
            )}
          </p>
          {canIApprove && (
            <div className="pt-2">
              <Button variant="primary" size="sm" onClick={approveContractChange} className="text-xs">
                <SolarIcon name="check" size={14} />
                Approve & Activate New Terms
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 1. GLOBAL MULTI-CURRENCY & LOCALE PREFERENCES */}
      <div className="p-6 rounded-[12px] bg-[#f5eee1] space-y-5">
        <div className="flex items-center justify-between pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#2a2b2f]">Currency & Regional Preferences</h3>
            <p className="text-xs text-[#515151] mt-0.5">
              Independent settings for reporting currency, display formatting, and time zone.
            </p>
          </div>
          <Badge variant="neutral">Independent Axes</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
              Couple Reporting Currency
            </label>
            <select
              value={reportingCurrency}
              onChange={(e) => setReportingCurrency(e.target.value)}
              className="w-full h-10 px-3.5 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-xs font-mono font-semibold text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
            >
              {availableCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[#515151] mt-1 block">
              Converts dashboard displays via mock rates without mutating native wallets.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
              Display Locale
            </label>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              className="w-full h-10 px-3.5 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-xs font-medium text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
            >
              <option value="en-US">English (United States, en-US)</option>
              <option value="en-GB">English (United Kingdom, en-GB)</option>
              <option value="id-ID">Indonesian (Indonesia, id-ID)</option>
              <option value="de-DE">German (Germany, de-DE)</option>
              <option value="ja-JP">Japanese (Japan, ja-JP)</option>
              <option value="zh-CN">Chinese (China, zh-CN)</option>
            </select>
            <span className="text-[10px] text-[#515151] mt-1 block">
              Controls number delimiters and date formatting.
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
              Time Zone
            </label>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full h-10 px-3.5 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-xs font-medium text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
            >
              <option value="America/New_York">America/New_York (UTC-5)</option>
              <option value="Europe/London">Europe/London (UTC+0)</option>
              <option value="Asia/Jakarta">Asia/Jakarta (UTC+7)</option>
              <option value="Asia/Singapore">Asia/Singapore (UTC+8)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
            </select>
            <span className="text-[10px] text-[#515151] mt-1 block">
              Used for 24h expiration deadlines and cooling-off windows.
            </span>
          </div>
        </div>

        {/* Demo Presets and Test Fixtures */}
        <div className="pt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#2a2b2f] block">Demonstration Fixtures</span>
            <span className="text-[11px] text-[#515151]">
              Quickly toggle between global multi-currency and regional Indonesian presets.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDemoPreset("global_usd")}
              className="text-xs"
            >
              Global Preset (USD/EUR)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyDemoPreset("regional_idr")}
              className="text-xs"
            >
              Regional Preset (IDR)
            </Button>
          </div>
        </div>

        {/* Test Scenario: Missing FX Rate Toggle */}
        <div className="p-4 rounded-[12px] bg-[#fef9ef] flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-[#2a2b2f] block">
              Test Scenario: Simulate Missing Exchange Rate
            </span>
            <span className="text-[11px] text-[#515151]">
              Simulates unavailable FX rate for secondary wallet to test incomplete reporting warning without fabricated sums.
            </span>
          </div>
          <input
            type="checkbox"
            checked={simulateMissingFXRate}
            onChange={(e) => setSimulateMissingFXRate(e.target.checked)}
            className="w-5 h-5 accent-[#B45529] cursor-pointer"
          />
        </div>
      </div>

      {/* 2. COUPLE IDENTITIES */}
      <div className="p-6 rounded-[12px] bg-[#f5eee1] space-y-4">
        <h3 className="text-sm font-semibold text-[#2a2b2f]">Couple Household Space</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-[12px] bg-[#fef9ef] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#B45529] text-[#fef9ef] font-bold flex items-center justify-center">
              {partnerAName.charAt(0)}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#2a2b2f]">{partnerAName}</h4>
              <span className="text-[11px] text-[#515151]">Partner 1</span>
            </div>
          </div>
          <div className="p-4 rounded-[12px] bg-[#fef9ef] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#3B1D17] text-[#fef9ef] font-bold flex items-center justify-center">
              {partnerBName.charAt(0)}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#2a2b2f]">{partnerBName}</h4>
              <span className="text-[11px] text-[#515151]">Partner 2</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CONTRACT EDIT FORM */}
      <form onSubmit={handlePropose} className="p-6 rounded-[12px] bg-[#f5eee1] space-y-5">
        <div className="flex items-center justify-between pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#2a2b2f]">Mutual Spending Rules</h3>
            <p className="text-xs text-[#515151] mt-0.5">
              Any changes require the second partner's signature before taking effect.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
              Shared Expense Split ({partnerBName} %)
            </label>
            <Input
              type="number"
              value={splitDinaInput}
              onChange={(e) => {
                setSplitDinaInput(e.target.value);
                setSplitRakaInput((100 - Number(e.target.value)).toString());
              }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
              Shared Expense Split ({partnerAName} %)
            </label>
            <Input
              type="number"
              value={splitRakaInput}
              onChange={(e) => {
                setSplitRakaInput(e.target.value);
                setSplitDinaInput((100 - Number(e.target.value)).toString());
              }}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
            Shared-Wallet Approval Threshold ({contract.thresholdCurrency})
          </label>
          <Input
            type="number"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
          <span className="text-[11px] text-[#515151] mt-1 block">
            Current active threshold: {formatMoney(contract.approvalThreshold, contract.thresholdCurrency, locale)}. Purchases exceeding this amount trigger Dual-Key approval.
          </span>
        </div>

        {/* Policy: Approve every shared purchase */}
        <div className="p-4 rounded-[12px] bg-[#fef9ef] flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-[#2a2b2f] block">
              Strict Policy: Approve Every Shared Purchase
            </span>
            <span className="text-[11px] text-[#515151]">
              When enabled, all shared purchases trigger Dual-Key approval regardless of the threshold amount.
            </span>
          </div>
          <input
            type="checkbox"
            checked={approveEveryShared}
            onChange={(e) => setApproveEveryShared(e.target.checked)}
            className="w-5 h-5 accent-[#B45529] cursor-pointer"
          />
        </div>

        {/* Cooling-off rule settings */}
        <div className="p-4 rounded-[12px] bg-[#fef9ef] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#2a2b2f]">Late-Night Cooling-Off Safeguard</span>
            <Badge variant="hold">Active</Badge>
          </div>
          <p className="text-xs text-[#333333]">
            Threshold: <strong>{formatMoney(contract.cooldownThreshold, contract.cooldownCurrency, locale)}</strong> • Night window: <strong>23:00 - 08:00</strong>.
          </p>
          <span className="text-[11px] text-[#515151] block">
            Purchases during this window are placed on an 8-hour hold. Users can cancel or continue with secondary confirmation.
          </span>
        </div>

        <div className="pt-2 flex items-center justify-between">
          {showSavedToast ? (
            <span className="text-xs text-[#2d5232] font-semibold flex items-center gap-1">
              <SolarIcon name="check-circle" size={14} /> Proposal submitted to partner!
            </span>
          ) : <div />}
          <Button type="submit" variant="primary" size="md">
            Propose Amendment to Partner
          </Button>
        </div>
      </form>

      {/* 4. PRIVACY & SECURITY CONTROLS */}
      <div className="p-6 rounded-[12px] bg-[#f5eee1] space-y-4">
        <h3 className="text-sm font-semibold text-[#2a2b2f]">Privacy & Account Security</h3>

        <div className="space-y-3 text-xs">
          <div className="py-3 flex items-center justify-between">
            <div>
              <span className="font-semibold text-[#2a2b2f] block">Partner Total-Only Privacy Lock</span>
              <span className="text-[#515151] text-[11px]">
                Server-enforced: hides individual transaction line items from your partner while displaying aggregate balance.
              </span>
            </div>
            <Badge variant="allow">Enforced</Badge>
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <span className="font-semibold text-[#2a2b2f] block">Dual-Key Passkey Authentication</span>
              <span className="text-[#515151] text-[11px]">
                Requires WebAuthn biometric / PIN for approving financial commitments.
              </span>
            </div>
            <Badge variant="allow">Enabled</Badge>
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <span className="font-semibold text-[#2a2b2f] block">Vault Encryption & Ledger Integrity</span>
              <span className="text-[#515151] text-[11px]">
                Financial ledger safeguards: undo is a reversing entry, not bank chargeback.
              </span>
            </div>
            <Badge variant="allow">Active</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
