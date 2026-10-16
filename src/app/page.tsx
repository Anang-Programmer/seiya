"use client";

import React, { useState } from "react";
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

function MainApp() {
  const { setCurrentUser } = useApp();
  const [currentTab, setCurrentTab] = useState<NavTab>("home");
  const [isLandingPage, setIsLandingPage] = useState<boolean>(false);
  const [profileInitialTab, setProfileInitialTab] = useState<"overview" | "contract" | "security" | "privacy" | "preferences">("overview");

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

  if (isLandingPage) {
    return (
      <LandingView
        onEnterApp={(persona) => {
          setCurrentUser(persona);
          setIsLandingPage(false);
          setCurrentTab("home");
        }}
      />
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-b from-[#fef9ef] to-[#fefcf6] text-[#2a2b2f] overflow-hidden">
      {/* Desktop Collapsible Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        onLogout={() => setIsLandingPage(true)}
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
              onLogout={() => setIsLandingPage(true)}
              onOpenProfile={() => handleOpenProfile("overview")}
              onNavigate={handleTabChange}
            />
          )}

          <div
            className={`relative z-10 flex-1 ${
              currentTab === "seiya"
                ? "p-2 sm:p-4 pb-24 md:pb-4 h-full flex flex-col"
                : "px-3.5 sm:px-8 pb-32 md:pb-8 pt-4 sm:pt-6"
            }`}
          >
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
                onLogout={() => setIsLandingPage(true)}
                initialTab={profileInitialTab}
              />
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
    </AppProvider>
  );
}
