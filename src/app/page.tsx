"use client";

import React, { useEffect, useRef, useState } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { Sidebar, NavTab } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { HomeView } from "@/components/views/home-view";
import { ChatView } from "@/components/views/chat-view";
import { ApprovalsView } from "@/components/views/approvals-view";
import { WalletsView } from "@/components/views/wallets-view";
import { BillsView } from "@/components/views/bills-view";
import { PlanView } from "@/components/views/plan-view";
import { AddGoalView } from "@/components/views/add-goal-view";
import { DraftGoalsView } from "@/components/views/draft-goals-view";
import { WaitingListView } from "@/components/views/waiting-list-view";
import { ActivityView } from "@/components/views/activity-view";
import { SettingsView } from "@/components/views/settings-view";
import { ProfileView } from "@/components/views/profile-view";
import { LandingView } from "@/components/views/landing-view";
import { AuthView, AuthMode } from "@/components/views/auth-view";
import { SeiyaLogo } from "@/components/icons/seiya-logo";
import { SolarIcon } from "@/components/icons/solar";
import { readPendingInvite, storePendingInvite } from "@/lib/invite";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-[#fef9ef] to-[#fefcf6]">
      <SeiyaLogo height={40} />
      <div className="w-8 h-8 rounded-full border-2 border-[#B45529]/20 border-t-[#B45529] animate-spin" />
      <p className="text-xs text-[#808988] font-serif">Loading your shared space...</p>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-36 rounded-[20px] bg-[#f5eee1]" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="h-28 rounded-[16px] bg-[#f5eee1]" />
        <div className="h-28 rounded-[16px] bg-[#f5eee1]" />
        <div className="h-28 rounded-[16px] bg-[#f5eee1]" />
      </div>
      <div className="h-64 rounded-[16px] bg-[#f5eee1]" />
    </div>
  );
}

function NoticeStack() {
  const { notices, dismissNotice } = useApp();
  if (notices.length === 0) return null;

  return (
    <div className="fixed z-[60] bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 w-[calc(100%-32px)] max-w-sm space-y-2">
      {notices.map((n) => (
        <div
          key={n.id}
          role={n.kind === "error" ? "alert" : "status"}
          className={`p-3 rounded-[12px] text-xs font-semibold flex items-start gap-2 border shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 ${
            n.kind === "error"
              ? "bg-[#fcf0ee] text-[#9e382b] border-[#9e382b]/25"
              : n.kind === "success"
              ? "bg-[#edf3ec] text-[#2d5232] border-[#2d5232]/30"
              : "bg-[#fef9ef] text-[#2a2b2f] border-[#d1c9bf]"
          }`}
        >
          <SolarIcon
            name={n.kind === "error" ? "danger-triangle" : "check-circle"}
            size={16}
            className="shrink-0 mt-px"
          />
          <span className="flex-1 leading-relaxed">{n.message}</span>
          <button
            type="button"
            onClick={() => dismissNotice(n.id)}
            className="opacity-60 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss"
          >
            <SolarIcon name="close-circle" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function MainApp() {
  const {
    isLoading,
    isAuthenticated,
    householdId,
    partnerProfile,
    contractMeta,
    dataStatus,
    refreshData,
    signOut,
  } = useApp();

  const [currentTab, setCurrentTab] = useState<NavTab>("home");
  const [showLanding, setShowLanding] = useState<boolean>(true);
  // The auth/onboarding flow stays mounted until it reports success, so a
  // household created mid-flow does not yank the user to the dashboard.
  const [authFlowActive, setAuthFlowActive] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authScreen, setAuthScreen] = useState<number | undefined>(undefined);
  const [authFlowKey, setAuthFlowKey] = useState(0);
  const [profileInitialTab, setProfileInitialTab] = useState<"overview" | "contract" | "security" | "privacy" | "preferences">("overview");
  const initialised = useRef(false);

  // Capture invitation links (/?invite=<token>) before anything else.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token) {
      storePendingInvite(token);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // After the first session check, decide where the user lands.
  useEffect(() => {
    if (isLoading || initialised.current) return;
    initialised.current = true;
    if (isAuthenticated && householdId) {
      setAuthFlowActive(false);
      setShowLanding(false);
    } else if (isAuthenticated) {
      setShowLanding(false);
      setAuthMode("choose-path");
      setAuthFlowActive(true);
    } else if (readPendingInvite()) {
      setShowLanding(false);
      setAuthMode("register");
      setAuthFlowActive(true);
    } else {
      setShowLanding(true);
      setAuthFlowActive(false);
    }
  }, [isLoading, isAuthenticated, householdId]);

  const openSetupFlow = (mode: AuthMode, screen?: number) => {
    setAuthMode(mode);
    setAuthScreen(screen);
    setAuthFlowKey((k) => k + 1);
    setAuthFlowActive(true);
    setShowLanding(false);
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentTab("home");
    setShowLanding(true);
    setAuthFlowActive(false);
  };

  const handleOpenProfile = (tab: "overview" | "contract" | "security" | "privacy" | "preferences" = "overview") => {
    setProfileInitialTab(tab);
    setCurrentTab("profile");
  };

  const handleTabChange = (tab: NavTab) => {
    if (tab === "settings") {
      handleOpenProfile("contract");
      return;
    }
    setCurrentTab(tab);
  };

  if (isLoading) {
    return <FullScreenLoader />;
  }

  if (!isAuthenticated && showLanding) {
    return (
      <LandingView
        onEnterApp={() => {
          setShowLanding(false);
          setAuthFlowActive(false);
          setCurrentTab("home");
        }}
      />
    );
  }

  if (!isAuthenticated || !householdId || authFlowActive) {
    return (
      <AuthView
        key={authFlowKey}
        initialMode={isAuthenticated && !householdId && (authMode === "login" || authMode === "register") ? "choose-path" : authMode}
        initialScreen={authScreen}
        onSuccess={() => {
          setAuthFlowActive(false);
          setShowLanding(false);
          setCurrentTab("home");
        }}
        onClose={
          isAuthenticated
            ? householdId
              ? () => setAuthFlowActive(false)
              : handleLogout
            : () => {
                setAuthFlowActive(false);
                setShowLanding(true);
              }
        }
      />
    );
  }

  // Couple setup is incomplete until the partner joins and both agree on
  // Seiya's Promise; both open the couple setup screen (24) of the flow.
  const setupBanner = !partnerProfile
    ? {
        message: "Your partner hasn't joined yet. Share your invitation link to unlock shared wallets and approvals.",
        action: "Invite partner",
        mode: "questionnaire" as AuthMode,
        screen: 24,
      }
    : !contractMeta.hasActiveRule
    ? {
        message: "Seiya's Promise becomes active once you both agree on the same clauses. Shared wallets open after that.",
        action: "Open Seiya's Promise",
        mode: "questionnaire" as AuthMode,
        screen: 24,
      }
    : null;

  return (
    <div className="flex h-screen bg-gradient-to-b from-[#fef9ef] to-[#fefcf6] text-[#2a2b2f] overflow-hidden">
      {/* Desktop Collapsible Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        onOpenProfile={() => handleOpenProfile("overview")}
        onOpenContract={() => handleOpenProfile("contract")}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        <main
          id="main-scroll-container"
          className="flex-1 overflow-y-auto relative flex flex-col"
        >
          {/* Top Landscape Illustration Background on Home Dashboard - Subtly cropped only on desktop (lg+) with bottom mask to transparent */}
          {currentTab === "home" && (
            <div
              style={{
                maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 45%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.2) 88%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 45%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.2) 88%, transparent 100%)",
              }}
              className="absolute top-0 left-0 right-0 w-full pointer-events-none select-none z-0 overflow-hidden"
            >
              <div className="w-full mt-0 lg:-mt-[4%]">
                <img
                  src="/dashboard/SeiyaBG-Landscape.png"
                  alt="Seiya Landscape Background"
                  className="w-full h-auto block"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent 55% to-[#fefcf6]/90" />
            </div>
          )}

          {currentTab !== "seiya" && (
            <Header
              currentTab={currentTab}
              onOpenAskSeiya={() => setCurrentTab("seiya")}
              onLogout={handleLogout}
              onOpenProfile={() => handleOpenProfile("overview")}
              onNavigate={handleTabChange}
            />
          )}

          {currentTab !== "seiya" && (setupBanner || dataStatus.error) && (
            <div className="relative z-10 px-3.5 sm:px-8 pt-3 space-y-2">
              {setupBanner && (
                <div className="max-w-5xl mx-auto p-3.5 rounded-[12px] bg-[#B45529]/10 border border-[#B45529]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2 text-xs text-[#2a2b2f]">
                    <SolarIcon name="users-group-rounded" size={16} className="text-[#B45529] shrink-0 mt-px" />
                    <span>{setupBanner.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openSetupFlow(setupBanner.mode, setupBanner.screen)}
                    className="shrink-0 px-4 py-1.5 rounded-full bg-[#B45529] hover:bg-[#9c4820] text-white text-xs font-serif transition-colors cursor-pointer"
                  >
                    {setupBanner.action}
                  </button>
                </div>
              )}
              {dataStatus.error && (
                <div className="max-w-5xl mx-auto p-3.5 rounded-[12px] bg-[#fcf0ee] border border-[#9e382b]/20 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2 text-xs text-[#9e382b]">
                    <SolarIcon name="danger-triangle" size={16} className="shrink-0 mt-px" />
                    <span>{dataStatus.error}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshData()}
                    className="shrink-0 px-4 py-1.5 rounded-full border border-[#9e382b]/30 text-[#9e382b] text-xs font-serif hover:bg-white/60 transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          )}

          <div
            className={`relative z-10 flex-1 ${
              currentTab === "seiya"
                ? "p-2 sm:p-4 pb-24 md:pb-4 h-full flex flex-col"
                : "px-3.5 sm:px-8 pb-32 md:pb-8 pt-4 sm:pt-6"
            }`}
          >
            {!dataStatus.loaded && currentTab !== "seiya" ? (
              <ContentSkeleton />
            ) : (
              <>
                {currentTab === "home" && <HomeView onNavigate={handleTabChange} />}
                {currentTab === "seiya" && <ChatView />}
                {currentTab === "approvals" && <ApprovalsView />}
                {currentTab === "wallets" && <WalletsView />}
                {currentTab === "bills" && <BillsView />}
                {currentTab === "plan" && <PlanView onNavigate={handleTabChange} />}
                {currentTab === "add_goal" && (
                  <AddGoalView
                    onBack={() => handleTabChange("plan")}
                    onGoalCreated={() => handleTabChange("plan")}
                  />
                )}
                {currentTab === "draft_goals" && (
                  <DraftGoalsView
                    onBack={() => handleTabChange("plan")}
                    onNavigate={handleTabChange}
                  />
                )}
                {currentTab === "waiting_list" && <WaitingListView />}
                {currentTab === "activity" && <ActivityView />}
                {currentTab === "settings" && <SettingsView />}
                {currentTab === "profile" && (
                  <ProfileView
                    onLogout={handleLogout}
                    initialTab={profileInitialTab}
                  />
                )}
              </>
            )}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <BottomNav
          currentTab={currentTab}
          onTabChange={handleTabChange}
          onOpenProfile={() => handleOpenProfile("overview")}
        />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AppProvider>
      <MainApp />
      <NoticeStack />
    </AppProvider>
  );
}
