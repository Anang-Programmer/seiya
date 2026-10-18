"use client";

import React, { useState } from "react";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaLogo } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OnboardingView } from "./onboarding-view";
import { AuthView, AuthMode } from "./auth-view";
import { useApp, UserRole } from "@/lib/store";

interface LandingViewProps {
  onEnterApp: (persona: UserRole) => void;
}

export function LandingView({ onEnterApp }: LandingViewProps) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const { partnerAName, partnerBName } = useApp();

  if (authMode) {
    return (
      <AuthView
        initialMode={authMode}
        onSuccess={(persona) => {
          setAuthMode(null);
          onEnterApp(persona || "partner_a");
        }}
        onClose={() => setAuthMode(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fef9ef] to-[#fefcf6] text-[#2a2b2f] flex flex-col justify-between selection:bg-[#B45529]/20 selection:text-[#B45529]">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 bg-[#fefcf6]/90 backdrop-blur-md px-6 py-4 max-w-7xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center">
          <SeiyaLogo height={34} />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAuthMode("login")}
            className="text-xs hidden sm:inline-flex rounded-full"
          >
            Sign In
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setAuthMode("register")}
            className="text-xs rounded-full"
          >
            Create Account
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 py-14 text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#B45529]/10 text-[#B45529] text-xs font-semibold">
          <SolarIcon name="shield-check" size={14} />
          <span>Deterministic Dual-Key Gateway • Zero Unsanctioned Fund Moves</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-serif font-normal tracking-tight text-[#2a2b2f] max-w-3xl mx-auto leading-[1.12]">
          Money decisions, <br />
          <span className="font-serif italic font-light text-[#B45529]">
            made together.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-[#515151] max-w-2xl mx-auto leading-relaxed">
          The global-ready personal finance journal and co-pilot for couples. See shared and personal finances clearly across currencies, plan life goals, and guard shared wealth with mutual approval workflows.
        </p>

        {/* Action CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => setAuthMode("register")}
            className="text-sm shadow-xs rounded-[40px]"
          >
            <SolarIcon name="sparkles" size={18} />
            Set Up Couple Contract (Figma Flow)
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setAuthMode("login")}
            className="text-sm rounded-[40px]"
          >
            Sign In to Account
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => onEnterApp("partner_a")}
            className="text-sm rounded-[40px]"
          >
            Direct Demo: {partnerAName}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => onEnterApp("partner_b")}
            className="text-sm rounded-[40px]"
          >
            Direct Demo: {partnerBName}
          </Button>
        </div>

        {/* Visual Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-12 text-left">
          <div className="p-6 rounded-[12px] bg-[#f5eee1] space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#B45529]/15 text-[#B45529] flex items-center justify-center mb-3">
              <SolarIcon name="wallet" size={20} />
            </div>
            <h3 className="text-base font-serif font-normal text-[#2a2b2f]">Total Visibility & <span className="italic font-light">Privacy</span></h3>
            <p className="text-xs text-[#515151] leading-relaxed">
              Shared joint savings are 100% transparent. Personal wallets protect itemized logs while sharing aggregate totals for complete peace of mind.
            </p>
          </div>

          <div className="p-6 rounded-[12px] bg-[#f5eee1] space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#B45529]/15 text-[#B45529] flex items-center justify-center mb-3">
              <SolarIcon name="shield-check" size={20} />
            </div>
            <h3 className="text-base font-serif font-normal text-[#2a2b2f]">Dual-Key <span className="italic font-light">Gateway</span></h3>
            <p className="text-xs text-[#515151] leading-relaxed">
              AI proposes, but never executes without you. Shared spending over threshold requires explicit second-partner confirmation.
            </p>
          </div>

          <div className="p-6 rounded-[12px] bg-[#f5eee1] space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#B45529]/15 text-[#B45529] flex items-center justify-center mb-3">
              <SolarIcon name="clock-circle" size={20} />
            </div>
            <h3 className="text-base font-serif font-normal text-[#2a2b2f]">Cooling-Off <span className="italic font-light">Safeguards</span></h3>
            <p className="text-xs text-[#515151] leading-relaxed">
              Non-judgmental protection against impulsive late-night checkouts. High-value purchases are placed on a gentle hold until morning.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-xs text-[#515151]">
        © 2026 Seiya • AI Personal Finance Assistant for Couples • Money decisions, made together.
      </footer>

      {/* Guided Onboarding Modal */}
      {showOnboarding && (
        <OnboardingView
          onComplete={() => {
            setShowOnboarding(false);
            onEnterApp("partner_a");
          }}
          onCancel={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
