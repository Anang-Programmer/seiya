"use client";

import React, { useState } from "react";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

interface OnboardingProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function OnboardingView({ onComplete, onCancel }: OnboardingProps) {
  const {
    partnerAName,
    partnerBName,
    reportingCurrency,
    setReportingCurrency,
    locale,
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [walletChoice, setWalletChoice] = useState<"both" | "shared" | "personal">("both");
  const [splitRatio, setSplitRatio] = useState<{ dina: number; raka: number }>({ dina: 50, raka: 50 });
  const [threshold, setThreshold] = useState<number>(500);
  const [coolingOff, setCoolingOff] = useState<boolean>(true);
  const [partnerASigned, setPartnerASigned] = useState<boolean>(false);
  const [partnerBSigned, setPartnerBSigned] = useState<boolean>(false);

  const canActivate = partnerASigned && partnerBSigned;
  const availableCurrencies = Object.values(SUPPORTED_CURRENCIES);

  return (
    <div className="fixed inset-0 z-50 bg-[#2a2b2f]/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#fef9ef] rounded-[12px] max-w-xl w-full shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 flex items-center justify-between bg-[#f5eee1]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#fef9ef] border border-[#e5dcd0] flex items-center justify-center shadow-xs">
              <SeiyaIcon size={20} />
            </div>
            <div>
              <h3 className="text-sm font-serif font-normal text-[#2a2b2f]">Couple Contract Setup</h3>
              <span className="text-[11px] text-[#515151]">Step {step} of 5 • Guided Agreement</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-[#515151] hover:text-[#2a2b2f] p-1.5 rounded-full hover:bg-[#fef9ef] transition-colors cursor-pointer"
          >
            <SolarIcon name="close-circle" size={20} />
          </button>
        </div>

        {/* Step Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#fef9ef]">
          {/* STEP 1: Choose Wallets & Currency */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-serif font-normal text-[#2a2b2f]">1. How do you want to manage money?</h4>
                <p className="text-xs text-[#515151] mt-1">
                  Choose your couple account transparency mode and baseline reporting currency.
                </p>
              </div>

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
              </div>

              <div className="space-y-2.5 pt-2">
                {[
                  {
                    id: "both",
                    title: "Shared + Personal Wallets (Recommended)",
                    desc: "Full shared visibility for joint expenses, plus privacy-protected personal accounts with aggregate total only.",
                  },
                  {
                    id: "shared",
                    title: "Shared Wallet Only",
                    desc: "Manage mutual household bills and savings in a 100% transparent joint pool.",
                  },
                  {
                    id: "personal",
                    title: "Personal Wallets with Split Logging",
                    desc: "Keep all accounts separate and settle shared expenses on demand.",
                  },
                ].map((opt) => (
                  <div
                    key={opt.id}
                    onClick={() => setWalletChoice(opt.id as any)}
                    className={`p-4 rounded-[12px] cursor-pointer transition-all ${
                      walletChoice === opt.id
                        ? "bg-[#B45529]/15 shadow-xs"
                        : "bg-[#f5eee1] hover:bg-[#f2e7d7]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#2a2b2f]">{opt.title}</span>
                      {walletChoice === opt.id && (
                        <SolarIcon name="check-circle" size={16} className="text-[#B45529]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[#515151] mt-1">{opt.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Choose Default Split */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-serif font-normal text-[#2a2b2f]">2. Agree on your shared expense split</h4>
                <p className="text-xs text-[#515151] mt-1">
                  When you record a meal or household bill together, Seiya applies this ratio automatically.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "50 : 50", dina: 50, raka: 50, desc: "Equal partners" },
                  { label: "60 : 40", dina: 60, raka: 40, desc: `${partnerBName} 60% : ${partnerAName} 40%` },
                  { label: "70 : 30", dina: 70, raka: 30, desc: "Proportional split" },
                ].map((s) => (
                  <div
                    key={s.label}
                    onClick={() => setSplitRatio({ dina: s.dina, raka: s.raka })}
                    className={`p-3.5 rounded-[12px] text-center cursor-pointer transition-all ${
                      splitRatio.dina === s.dina
                        ? "bg-[#B45529]/15 shadow-xs"
                        : "bg-[#f5eee1] hover:bg-[#f2e7d7]"
                    }`}
                  >
                    <span className="text-sm font-semibold font-serif text-[#2a2b2f] block">{s.label}</span>
                    <span className="text-[10px] text-[#515151] block mt-0.5">{s.desc}</span>
                  </div>
                ))}
              </div>

              <div className="p-3.5 rounded-[12px] bg-[#f5eee1] text-xs text-[#333333]">
                Selected split: <strong>{partnerBName} {splitRatio.dina}%</strong> and <strong>{partnerAName} {splitRatio.raka}%</strong>. If lunch is <strong className="font-serif">{formatMoneyConverted(100, "USD", reportingCurrency, locale)}</strong>, {partnerBName} contributes <strong className="font-serif">{formatMoneyConverted(splitRatio.dina, "USD", reportingCurrency, locale)}</strong> and {partnerAName} <strong className="font-serif">{formatMoneyConverted(splitRatio.raka, "USD", reportingCurrency, locale)}</strong>.
              </div>
            </div>
          )}

          {/* STEP 3: Approval Threshold */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-serif font-normal text-[#2a2b2f]">3. Set your shared approval threshold</h4>
                <p className="text-xs text-[#515151] mt-1">
                  Expenses from the shared wallet exceeding this limit will require the other partner's approval.
                </p>
              </div>

              <div className="space-y-2">
                {[250, 500, 1000].map((amt) => {
                  const displayConverted = formatMoneyConverted(amt, "USD", reportingCurrency, locale);
                  return (
                    <div
                      key={amt}
                      onClick={() => setThreshold(amt)}
                      className={`p-3.5 rounded-[12px] flex items-center justify-between cursor-pointer transition-all ${
                        threshold === amt
                          ? "bg-[#B45529]/15 shadow-xs"
                          : "bg-[#f5eee1] hover:bg-[#f2e7d7]"
                      }`}
                    >
                      <div>
                        <span className="text-xs font-semibold font-serif text-[#2a2b2f] block">
                          {displayConverted}
                        </span>
                        <span className="text-[10px] text-[#515151]">
                          {amt === 500 ? "Default recommended threshold" : "Custom boundary"}
                        </span>
                      </div>
                      {threshold === amt && (
                        <SolarIcon name="check-circle" size={16} className="text-[#B45529]" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4: Cooling-Off Safeguards */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-serif font-normal text-[#2a2b2f]">4. Cooling-Off Safeguards</h4>
                <p className="text-xs text-[#515151] mt-1">
                  Protect shared goals against impulse late-night flash sales with a non-judgmental temporary hold.
                </p>
              </div>

              <div className="p-4 rounded-[12px] bg-[#f5eee1] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <SolarIcon name="clock-circle" size={18} className="text-[#B45529]" />
                    <span className="text-xs font-semibold text-[#2a2b2f]">Late-Night 8h Cooling-Off Hold</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={coolingOff}
                    onChange={(e) => setCoolingOff(e.target.checked)}
                    className="w-4 h-4 accent-[#B45529] cursor-pointer"
                  />
                </div>
                <p className="text-xs text-[#333333] leading-relaxed">
                  When enabled, purchases over <strong className="font-serif">{formatMoneyConverted(1000, "USD", reportingCurrency, locale)}</strong> made between <strong>23:00 - 08:00</strong> are automatically placed on an 8-hour hold. Either partner can cancel or continue with secondary confirmation.
                </p>
              </div>
            </div>
          )}

          {/* STEP 5: Dual Approval Review */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h4 className="text-base font-serif font-normal text-[#2a2b2f]">5. Plain-Language Contract Review</h4>
                <p className="text-xs text-[#515151] mt-1">
                  Both partners must sign before this contract becomes active.
                </p>
              </div>

              <div className="p-4 rounded-[12px] bg-[#f5eee1] text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#515151]">Wallets:</span>
                  <span className="font-semibold text-[#2a2b2f] capitalize">{walletChoice}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515151]">Reporting Currency:</span>
                  <span className="font-serif font-semibold text-[#2a2b2f]">{reportingCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515151]">Shared Split:</span>
                  <span className="font-semibold text-[#2a2b2f]">
                    {partnerBName} {splitRatio.dina}% : {partnerAName} {splitRatio.raka}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515151]">Approval Limit:</span>
                  <span className="font-semibold font-serif text-[#2a2b2f]">
                    {formatMoneyConverted(threshold, "USD", reportingCurrency, locale)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515151]">Cooling-Off Safeguard:</span>
                  <span className="font-semibold text-[#B45529]">{coolingOff ? "Active (23:00-08:00)" : "Disabled"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#515151]">Personal Privacy:</span>
                  <span className="font-semibold text-[#2d5232]">Protected (Total Only)</span>
                </div>
              </div>

              {/* Dual Signature Buttons */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-[#2a2b2f] block">Partner Signatures:</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPartnerASigned(true)}
                    className={`p-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      partnerASigned
                        ? "bg-[#2d5232]/10 text-[#2d5232]"
                        : "bg-[#f5eee1] text-[#2a2b2f] hover:bg-[#ebdcc9]"
                    }`}
                  >
                    <SolarIcon name={partnerASigned ? "check-circle" : "shield-check"} size={16} />
                    {partnerASigned ? `${partnerAName} Signed ✓` : `Sign as ${partnerAName}`}
                  </button>

                  <button
                    onClick={() => setPartnerBSigned(true)}
                    className={`p-3 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      partnerBSigned
                        ? "bg-[#2d5232]/10 text-[#2d5232]"
                        : "bg-[#f5eee1] text-[#2a2b2f] hover:bg-[#ebdcc9]"
                    }`}
                  >
                    <SolarIcon name={partnerBSigned ? "check-circle" : "shield-check"} size={16} />
                    {partnerBSigned ? `${partnerBName} Signed ✓` : `Sign as ${partnerBName}`}
                  </button>
                </div>
                {!canActivate && (
                  <span className="text-[11px] text-[#B45529] block text-center mt-1">
                    Pending partner approval. Both partners must sign to activate the contract.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 sm:p-6 bg-[#f5eee1] flex items-center justify-between">
          {step > 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="rounded-[40px]"
            >
              Back
            </Button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <Button
              variant="primary"
              size="md"
              onClick={() => setStep((s) => (s + 1) as any)}
              className="rounded-[40px]"
            >
              Next Step
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              disabled={!canActivate}
              onClick={onComplete}
              className="rounded-[40px]"
            >
              Activate Contract & Enter Home
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
