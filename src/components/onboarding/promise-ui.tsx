"use client";

import React from "react";
import Image from "next/image";
import type { PromiseClause } from "@/lib/api";

// Building blocks for the post-profiling onboarding screens (Figma "Component 1",
// node 472:8257): white rounded cards, the terracotta primary button, status
// badges, partner avatars and the editable Seiya's Promise clause card.

export const CARD_SHADOW = "shadow-[0_20px_12px_rgba(0,0,0,0.08),0_8px_4px_rgba(0,0,0,0.03)]";

// Story / join card banner: the Figma frame shows the right part of the
// illustration (image is 197.55% wide, offset -97.54%, 151.51% tall).
export function OnboardingBanner() {
  return (
    <div className="relative w-full aspect-[555/242] overflow-hidden rounded-t-[20px] bg-[#f9eee0]">
      <div className="absolute" style={{ left: "-97.54%", top: "-0.19%", width: "197.55%", height: "151.51%" }}>
        <Image
          src="/images/onboarding/story-banner.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 1100px, 200vw"
          className="object-cover pointer-events-none select-none"
        />
      </div>
    </div>
  );
}

export function FigmaCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-white rounded-[30px] px-6 sm:px-8 pt-6 sm:pt-8 pb-6 sm:pb-8 ${CARD_SHADOW} ${className}`}>
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  className = "",
  rounded = "rounded-[15px]",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  rounded?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`h-12 px-4 ${rounded} bg-[#b4562a] hover:bg-[#9c4820] text-white font-jakarta font-semibold text-base tracking-[0.16px] leading-[1.2] inline-flex items-center justify-center gap-2.5 transition-all cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      <span>{children}</span>
      <Image src="/images/onboarding/arrow-next.svg" alt="" width={24} height={24} className="shrink-0" />
    </button>
  );
}

export function BackLink({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 font-serif text-[#737373] hover:text-black text-lg sm:text-xl tracking-[-0.85px] transition-colors cursor-pointer"
    >
      {/* Inline so the circle follows the text color (the Figma asset is white-only). */}
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="12" fill="currentColor" />
        <path d="M13.5 7.5 9 12l4.5 4.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

export type BadgeTone = "green" | "yellow" | "red";

const BADGE_TONES: Record<BadgeTone, string> = {
  green: "text-[#16a34a] bg-[#e8f6ed] border-[#16a34a]",
  yellow: "text-[#fcc850] bg-[#fffaee] border-[#fcc850]",
  red: "text-[#ff0000] bg-[#ffe6e6] border-[#ff0000]",
};

export function StatusBadge({ tone, children, bordered = true }: { tone: BadgeTone; children: React.ReactNode; bordered?: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 rounded-[20px] font-serif text-sm sm:text-base tracking-[-0.85px] whitespace-nowrap ${BADGE_TONES[tone]} ${bordered ? "border" : "border-transparent"}`}
    >
      {children}
    </span>
  );
}

export function PartnerAvatar({ who, size = 58 }: { who: "me" | "partner"; size?: number }) {
  return (
    <Image
      src={who === "me" ? "/images/onboarding/avatar-him.png" : "/images/onboarding/avatar-her.png"}
      alt=""
      width={size}
      height={size}
      className="rounded-full shrink-0 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function PersonRow({
  who,
  name,
  detail,
  badge,
}: {
  who: "me" | "partner";
  name: string;
  detail: string;
  badge: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <PartnerAvatar who={who} />
      <div className="flex-1 min-w-0">
        <p className="font-serif text-lg sm:text-xl text-black tracking-[-0.85px] truncate">{name}</p>
        <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">{detail}</p>
      </div>
      {badge}
    </div>
  );
}

export function LockNotice({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#fffaee] border border-[#fcc850] rounded-[15px] px-3 py-5 flex items-start gap-2.5">
      <Image src="/images/onboarding/lock.svg" alt="" width={24} height={24} className="shrink-0" />
      <div className="space-y-1 font-serif tracking-[-0.85px]">
        {title && <p className="text-base text-black">{title}</p>}
        <p className="text-sm sm:text-base text-[#737373] leading-snug">{children}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seiya's Promise clause card
// ---------------------------------------------------------------------------

const inlineInput =
  "w-full bg-transparent rounded-lg border border-transparent hover:border-[#e6e6e6] focus:border-[#b4562a] focus:outline-none px-1.5 -mx-1.5 py-0.5 tracking-[-0.85px] transition-colors";

function NumberField({
  label,
  value,
  suffix,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | undefined;
  suffix?: string;
  min: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-serif text-xs sm:text-sm text-[#737373] tracking-[-0.85px]">{label}</span>
      <span className="flex items-center gap-2 border border-[#bfbfbf] rounded-[12px] px-2.5 py-1.5 focus-within:border-[#b4562a]">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? undefined : Number(raw));
          }}
          className="w-full bg-transparent focus:outline-none text-base text-black"
        />
        {suffix && <span className="font-serif text-sm text-[#737373] whitespace-nowrap">{suffix}</span>}
      </span>
    </label>
  );
}

export function ClauseCard({
  clause,
  checked,
  onToggle,
  onChange,
  onRemove,
  currency,
  partnerName,
  partnerPicked,
  partnerDiffers,
  ownerLabel = "Partner A",
  memberLabel = "Partner B",
}: {
  clause: PromiseClause;
  checked: boolean;
  onToggle: () => void;
  onChange: (next: PromiseClause) => void;
  onRemove?: () => void;
  currency: string;
  partnerName: string;
  /** The partner selected this clause in their saved version. */
  partnerPicked: boolean;
  /** Both picked it, but the partner's wording or numbers differ from yours. */
  partnerDiffers: boolean;
  /** Names for the cost split: the space creator (ownerPercent) and the partner who joined. */
  ownerLabel?: string;
  memberLabel?: string;
}) {
  const params = clause.params ?? {};
  const setParam = (key: "ownerPercent" | "threshold" | "hours", value: number | undefined) =>
    onChange({ ...clause, params: { ...params, [key]: value } });

  return (
    <div className={`bg-white rounded-[30px] px-6 sm:px-8 pt-6 sm:pt-8 pb-6 sm:pb-8 ${CARD_SHADOW} transition-all ${checked ? "ring-1 ring-[#b4562a]/40" : ""}`}>
      <div className="flex items-start gap-4 sm:gap-5">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={checked}
          aria-label={checked ? "Unselect clause" : "Select clause"}
          className="shrink-0 w-[34px] h-[34px] flex items-center justify-center cursor-pointer"
        >
          <Image
            src={checked ? "/images/onboarding/clause-checked.svg" : "/images/onboarding/clause-unchecked.svg"}
            alt=""
            width={checked ? 40 : 34}
            height={checked ? 40 : 34}
          />
        </button>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {checked && clause.kind === "custom" ? (
              <input
                value={clause.category}
                maxLength={80}
                onChange={(e) => onChange({ ...clause, category: e.target.value })}
                placeholder="Category"
                className={`${inlineInput} font-serif text-sm sm:text-base text-[#737373] flex-1`}
              />
            ) : (
              <span className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">{clause.category}</span>
            )}
            {partnerPicked && !partnerDiffers && <StatusBadge tone="green">{partnerName} picked this</StatusBadge>}
            {partnerDiffers && <StatusBadge tone="yellow">{partnerName}&apos;s version differs</StatusBadge>}
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="ml-auto font-serif text-sm text-[#bfbfbf] hover:text-[#ff0000] cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>

          {checked ? (
            <>
              <textarea
                value={clause.title}
                maxLength={160}
                rows={1}
                onChange={(e) => onChange({ ...clause, title: e.target.value })}
                placeholder="Write the agreement"
                className={`${inlineInput} resize-none [field-sizing:content] font-serif text-lg sm:text-xl text-black`}
              />
              <textarea
                value={clause.description}
                maxLength={400}
                rows={1}
                onChange={(e) => onChange({ ...clause, description: e.target.value })}
                placeholder="Why it helps the two of you"
                className={`${inlineInput} resize-none [field-sizing:content] font-serif text-sm sm:text-base text-[#737373]`}
              />
            </>
          ) : (
            <>
              <p className="font-serif text-lg sm:text-xl text-black tracking-[-0.85px]">{clause.title}</p>
              {clause.description && (
                <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">{clause.description}</p>
              )}
            </>
          )}

          {checked && clause.kind === "cost_sharing" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <NumberField
                label={`${ownerLabel} pays`}
                value={params.ownerPercent}
                suffix="%"
                min={0}
                max={100}
                onChange={(v) => setParam("ownerPercent", v)}
              />
              <div className="flex flex-col gap-1">
                <span className="font-serif text-xs sm:text-sm text-[#737373] tracking-[-0.85px]">{memberLabel} pays</span>
                <span className="border border-[#e6e6e6] rounded-[12px] px-2.5 py-1.5 text-base text-[#737373]">
                  {params.ownerPercent === undefined ? "–" : `${100 - Math.min(100, Math.max(0, params.ownerPercent))} %`}
                </span>
              </div>
            </div>
          )}
          {checked && clause.kind === "discuss_first" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <NumberField
                label="Discuss purchases above"
                value={params.threshold}
                suffix={currency}
                min={0}
                onChange={(v) => setParam("threshold", v)}
              />
            </div>
          )}
          {checked && clause.kind === "cooling_off" && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <NumberField
                label="Hold purchases above"
                value={params.threshold}
                suffix={currency}
                min={0}
                onChange={(v) => setParam("threshold", v)}
              />
              <NumberField
                label="Cooling-off"
                value={params.hours}
                suffix="hours"
                min={1}
                max={72}
                onChange={(v) => setParam("hours", v)}
              />
            </div>
          )}

          <div className="border-t border-[#e6e6e6] pt-3 mt-1 flex items-start gap-1.5 font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">
            <span className="font-semibold whitespace-nowrap">Seiya will</span>
            {checked ? (
              <textarea
                value={clause.seiyaWill}
                maxLength={240}
                rows={1}
                onChange={(e) => onChange({ ...clause, seiyaWill: e.target.value })}
                placeholder="help you keep this agreement"
                className={`${inlineInput} resize-none [field-sizing:content] -my-0.5`}
              />
            ) : (
              <span>{clause.seiyaWill}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WriteOwnClauseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full bg-white rounded-[30px] py-8 flex items-center justify-center gap-4 ${CARD_SHADOW} hover:bg-[#fffdf8] transition-colors cursor-pointer`}
    >
      <Image src="/images/onboarding/write-clause-plus.svg" alt="" width={34} height={34} />
      <span className="font-serif text-lg sm:text-xl text-black tracking-[-0.85px]">Write Your Own Clause</span>
    </button>
  );
}

export function CoupleHeader({ partnerName, partnerDone }: { partnerName: string; partnerDone: boolean }) {
  return (
    <FigmaCard className="!py-6">
      <div className="flex items-center gap-3 sm:gap-5">
        <PartnerAvatar who="me" />
        <div className="shrink-0">
          <p className="font-serif text-lg sm:text-xl text-black tracking-[-0.85px]">Your profile</p>
          <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">Done</p>
        </div>
        <span className="flex-1 border-t border-[#ff5a79] hidden sm:block" />
        <Image src="/images/onboarding/revolving-hearts.svg" alt="" width={54} height={53} className="shrink-0 mx-auto sm:mx-0" />
        <span className="flex-1 border-t border-[#ff5a79] hidden sm:block" />
        <div className="shrink-0 text-right min-w-0">
          <p className="font-serif text-lg sm:text-xl text-black tracking-[-0.85px] truncate">{partnerName}</p>
          <p className="font-serif text-sm sm:text-base text-[#737373] tracking-[-0.85px]">{partnerDone ? "Done" : "Waiting"}</p>
        </div>
        <PartnerAvatar who="partner" />
      </div>
    </FigmaCard>
  );
}
