"use client";

import React, { useState, useRef, useEffect } from "react";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeiyaVideoAvatar } from "@/components/ui/seiya-video-avatar";
import { ActionCard, PlanCard, ClarificationCard } from "@/components/cards/domain-cards";
import { useApp, ChatMessage } from "@/lib/store";

interface ChatSession {
  id: string;
  title: string;
  timestamp: string;
  dateGroup: "Today" | "Yesterday" | "Previous";
  messages: ChatMessage[];
  isShared?: boolean;
  mode: "personal" | "shared";
  creatorRole?: "partner_a" | "partner_b";
}

export function ChatView() {
  const {
    currentUser,
    chatMessages: initialStoreMessages,
    sendChatMessage,
    partnerAName,
    partnerBName,
    reportingCurrency,
    locale,
    pendingDirectChat,
    setPendingDirectChat,
  } = useApp();

  const activeName = currentUser === "partner_a" ? partnerAName : partnerBName;
  const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

  // Initial Seeded Sessions for Chat History
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "session-1",
      title: "Can we afford all bills this month?",
      timestamp: "Today, 14:29",
      dateGroup: "Today",
      mode: "shared",
      isShared: true,
      creatorRole: "partner_a",
      messages: initialStoreMessages.length > 0 ? initialStoreMessages : [
        {
          id: "msg-1",
          sender: "seiya",
          text: "Hello! I'm Seiya, your financial co-pilot. I operate under your Couple Contract to help you make money decisions together. How can I help you both today?",
          timestamp: "09:00",
        },
        {
          id: "msg-2",
          sender: "user",
          userRole: "partner_a",
          text: "Can we afford all bills this month?",
          timestamp: "14:29",
        },
        {
          id: "msg-3",
          sender: "seiya",
          text: "Under your Couple Contract, I can record expenses, clarify budgets, analyze affordability, and safeguard mutual funds. How would you like to proceed?",
          timestamp: "14:29",
        },
      ],
    },
    {
      id: "session-2",
      title: "Kyoto Trip Savings Plan",
      timestamp: "Yesterday, 16:40",
      dateGroup: "Yesterday",
      mode: "shared",
      isShared: true,
      creatorRole: "partner_a",
      messages: [
        {
          id: "msg-k1",
          sender: "user",
          userRole: "partner_a",
          text: "We want to save $15,000 for our trip to Kyoto in 10 months.",
          timestamp: "16:40",
        },
        {
          id: "msg-k2",
          sender: "seiya",
          text: "I've structured a mutual milestone for your Kyoto vacation. Based on your 60:40 Couple Contract split ratio, here is the recommended monthly funding plan:",
          timestamp: "16:40",
          cardType: "PLAN",
          cardData: {
            title: "Kyoto Vacation Fund",
            targetAmount: 15000,
            currency: "USD",
            currentAmount: 2500,
            horizon: "10 months (July 2027)",
            monthlyTarget: 1250,
            split: "60% Taylor ($750) : 40% Alex ($500)",
            fundingWallet: "Shared Savings",
            assumptions: "Includes flight estimates, traditional ryokan lodging, and daily shared meal budgets.",
          },
        },
      ],
    },
    {
      id: "session-3",
      title: "Dinner Bistro Split ($85)",
      timestamp: "Yesterday, 19:10",
      dateGroup: "Yesterday",
      mode: "shared",
      isShared: true,
      creatorRole: "partner_a",
      messages: [
        {
          id: "msg-d1",
          sender: "user",
          userRole: "partner_a",
          text: "Paid $85 for dinner together, I paid.",
          timestamp: "19:10",
        },
        {
          id: "msg-d2",
          sender: "seiya",
          text: "Checked against Couple Contract rules: standard expense within agreed single-signer limit ($500). Recorded with 60:40 split ratio.",
          timestamp: "19:10",
          cardType: "ACTION_ALLOW",
          cardData: {
            title: "Dinner together",
            category: "Food & Drinks",
            amount: 85,
            currency: "USD",
            wallet: "shared",
            paidBy: partnerAName,
            partnerBOwesA: 51,
          },
        },
      ],
    },
    {
      id: "session-4",
      title: "Annual Home Insurance ($1,200)",
      timestamp: "11 Oct 2026",
      dateGroup: "Previous",
      mode: "shared",
      isShared: true,
      creatorRole: "partner_a",
      messages: [
        {
          id: "msg-i1",
          sender: "user",
          userRole: "partner_a",
          text: "Pay for annual home insurance $1,200 from shared wallet.",
          timestamp: "10:15",
        },
        {
          id: "msg-i2",
          sender: "seiya",
          text: "This payment exceeds your agreed $500 threshold and requires mutual authorization from Taylor before funds are disbursed.",
          timestamp: "10:15",
          cardType: "ACTION_NEED_APPROVAL",
          cardData: {
            title: "Annual Home Insurance",
            amount: 1200,
            currency: "USD",
            wallet: "shared",
            reason: "Amount exceeds agreed USD 500 threshold. Both keys required.",
          },
        },
      ],
    },
    {
      id: "session-5",
      title: "Flash-Sale TV ($1,400) Hold",
      timestamp: "08 Oct 2026",
      dateGroup: "Previous",
      mode: "personal",
      isShared: false,
      creatorRole: "partner_a",
      messages: [
        {
          id: "msg-f1",
          sender: "user",
          userRole: "partner_a",
          text: "Checkout flash-sale TV for $1,400 from the shared wallet.",
          timestamp: "23:40",
        },
        {
          id: "msg-f2",
          sender: "seiya",
          text: "Late-night promotional checkout triggered during cooling-off hours (23:00 - 08:00). Placed on an 8-hour hold to prevent impulse purchases.",
          timestamp: "23:40",
          cardType: "ACTION_HOLD",
          cardData: {
            title: "Flash-Sale TV",
            amount: 1400,
            currency: "USD",
            wallet: "shared",
            reason: "Late-night impulse safeguard active until 08:00 tomorrow.",
          },
        },
      ],
    },
  ]);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newChatMode, setNewChatMode] = useState<"personal" | "shared">("personal");
  const [historyFilter, setHistoryFilter] = useState<"all" | "shared" | "private">("all");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [newChatMenuOpen, setNewChatMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) || null : null;

  const sharedCount = sessions.filter((s) => s.isShared).length;
  const privateCount = sessions.filter((s) => !s.isShared).length;

  const filteredSessions = sessions.filter((s) => {
    if (historyFilter === "shared") return s.isShared;
    if (historyFilter === "private") return !s.isShared;
    return true;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 768) {
      setShowHistory(true);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeSession?.messages, isProcessing]);

  // Handle direct chat shortcut initiated from dashboard
  useEffect(() => {
    if (pendingDirectChat) {
      const mode = pendingDirectChat.mode || "personal";
      const isShared = mode === "shared";
      const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;
      const newSessionId = `session-${Date.now()}`;

      const introText = isShared
        ? `Hello ${activeName} & ${partnerName}! You are in a **Shared Conversation**. Decisions and ideas discussed here are visible to both partners in your Couple Space and bound by your Couple Contract.`
        : `Hello ${activeName}! This is your **Personal Private Conversation**. You can consult freely about personal spending, ideas, or questions. Whenever you're ready, click "Share with ${partnerName}" to bring it to your Couple Space.`;

      let fullUserText = pendingDirectChat.message.trim();
      if (pendingDirectChat.attachedFileName) {
        fullUserText = `📎 [Attached: ${pendingDirectChat.attachedFileName}]\n${fullUserText || "Please review and analyze this document for our budget."}`;
      }

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        sender: "user",
        userRole: currentUser,
        text: fullUserText,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      };

      const title = pendingDirectChat.message.trim()
        ? (pendingDirectChat.message.length > 28 ? pendingDirectChat.message.slice(0, 28) + "..." : pendingDirectChat.message)
        : (pendingDirectChat.attachedFileName ? `Doc: ${pendingDirectChat.attachedFileName}` : "New Consultation");

      const newSession: ChatSession = {
        id: newSessionId,
        title,
        timestamp: "Just now",
        dateGroup: "Today",
        mode,
        isShared,
        creatorRole: currentUser,
        messages: [
          {
            id: `msg-intro-${Date.now()}`,
            sender: "seiya",
            text: introText,
            timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
          },
          userMsg,
        ],
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSessionId);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setShowHistory(false);
      }
      setIsProcessing(true);

      sendChatMessage(fullUserText).finally(() => {
        setIsProcessing(false);
      });

      setToastMessage(
        isShared
          ? `Started Shared Conversation with ${partnerName}`
          : `Started Private Personal Conversation`
      );
      setTimeout(() => setToastMessage(null), 3000);

      setPendingDirectChat(null);
    }
  }, [pendingDirectChat, currentUser, partnerAName, partnerBName, activeName, locale, sendChatMessage, setPendingDirectChat]);

  // Start New Chat / Reset to Neutral Mode (mode: "personal" | "shared")
  const handleNewChat = (mode: "personal" | "shared" = "personal") => {
    setActiveSessionId(null);
    setNewChatMode(mode);
    setInputText("");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setShowHistory(false);
    }
    const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;
    setToastMessage(
      mode === "shared"
        ? `Ready for Shared Conversation with ${partnerName}`
        : `Ready for Private Personal Conversation`
    );
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Delete Chat Session
  const handleDeleteSession = (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== sessionId);
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      setActiveSessionId(filtered.length > 0 ? null : null);
    }
    setToastMessage("Conversation deleted.");
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Save Renamed Conversation Title
  const handleSaveTitle = (sessionId: string) => {
    if (!editTitleText.trim()) {
      setEditingSessionId(null);
      return;
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: editTitleText.trim() } : s))
    );
    setEditingSessionId(null);
    setToastMessage("Conversation renamed.");
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Toggle Share to Partner
  const handleToggleShare = (sessionId: string) => {
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession) return;
    const nextShared = !targetSession.isShared;
    const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, isShared: nextShared } : s))
    );

    setToastMessage(
      nextShared
        ? `Shared with ${partnerName}! Pinned to Couple Space.`
        : `Conversation unshared from Couple Space.`
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSend = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    setInputText("");
    setIsProcessing(true);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      userRole: currentUser,
      text,
      timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    };

    // If currently in Neutral state (activeSessionId === null), auto-create a new conversation session
    if (!activeSessionId) {
      const newSessionId = `session-${Date.now()}`;
      const isShared = newChatMode === "shared";
      const title = text.length > 32 ? text.slice(0, 32) + "..." : text;
      const introText = isShared
        ? `Hello ${activeName} & ${partnerName}! You are in a **Shared Conversation**. Decisions and ideas discussed here are visible to both partners in your Couple Space and bound by your Couple Contract.`
        : `Hello ${activeName}! This is your **Personal Private Conversation**. You can consult freely about personal spending, ideas, or questions. Whenever you're ready, click "Share with ${partnerName}" to bring it to your Couple Space.`;

      const newSession: ChatSession = {
        id: newSessionId,
        title,
        timestamp: "Just now",
        dateGroup: "Today",
        mode: newChatMode,
        isShared,
        creatorRole: currentUser,
        messages: [
          {
            id: `msg-intro-${Date.now()}`,
            sender: "seiya",
            text: introText,
            timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
          },
          userMsg,
        ],
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSessionId);
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setShowHistory(false);
      }
    } else {
      // Update active existing session messages and update session title if it's the first user msg
      setSessions((prevSessions) =>
        prevSessions.map((session) => {
          if (session.id === activeSessionId) {
            const isFirstUserMsg = !session.messages.some((m) => m.sender === "user");
            const newTitle = isFirstUserMsg ? (text.length > 32 ? text.slice(0, 32) + "..." : text) : session.title;
            return {
              ...session,
              title: newTitle,
              messages: [...session.messages, userMsg],
            };
          }
          return session;
        })
      );
    }

    // Call store handler to execute any side-effects (e.g. transactions, approvals, plans)
    await sendChatMessage(text);

    // Simulate "Checking rules..." delay before returning gateway confirmation
    setTimeout(() => {
      setIsProcessing(false);
    }, 900);
  };

  const quickPrompts = [
    { label: "Lunch $45 (ALLOW)", text: "Paid $45 for lunch together, I paid." },
    { label: "Groceries $120 (Clarify)", text: "Monthly groceries $120." },
    { label: "Correct to $38 (Edit)", text: "Actually, it was $38." },
    { label: "Shared Flights $650 (Approval)", text: "Pay for shared flight tickets $650." },
    { label: "Flash-Sale TV $1,400 (HOLD)", text: "Checkout flash-sale TV for $1,400 from the shared wallet." },
    { label: "External Transfer $2,500 (DENY)", text: "Transfer $2,500 to an external personal account now." },
    { label: "Kyoto Trip $15,000 (Plan)", text: "We want to save $15,000 for our trip to Kyoto in 10 months." },
    { label: "Check Due Bills (Cash-flow)", text: "Can we afford all bills this month?" },
    { label: "New Laptop $2,000 (Affordability)", text: "Can we afford a new laptop for $2,000?" },
  ];

  return (
    <div className="flex h-full min-h-[550px] w-full bg-[#f5eee1] rounded-[12px] overflow-hidden max-w-none shadow-xs border border-[#d1c9bf]/40 relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-3.5 left-1/2 transform -translate-x-1/2 z-50 bg-[#2a2b2f]/95 backdrop-blur-xs text-[#fef9ef] text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in-0 slide-in-from-top-2 duration-200 pointer-events-none">
          <SolarIcon name="check-circle" size={14} className="text-[#6bb573]" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* 1. CHAT HISTORY SIDEBAR (Collapsible / Mobile Slide-Over Drawer) */}
      {showHistory && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-neutral-900/40 backdrop-blur-xs md:hidden"
            onClick={() => setShowHistory(false)}
          />

          <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-[#fcf8f0] border-r border-[#d1c9bf]/40 flex flex-col shrink-0 shadow-2xl md:static md:z-auto md:w-64 sm:md:w-72 md:shadow-none animate-in slide-in-from-left duration-200">
            {/* History Header & New Chat button */}
            <div className="p-3.5 border-b border-[#d1c9bf]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-serif font-normal text-[#2a2b2f]">
                  <SolarIcon name="chat-round-dots" size={16} className="text-[#B45529]" />
                  <span className="font-semibold text-sm">Chat History</span>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="p-1.5 rounded-md text-[#808988] hover:text-[#2a2b2f] hover:bg-[#ece3d3]/60 transition-colors cursor-pointer"
                  title="Collapse history"
                >
                  <SolarIcon name="arrow-left" size={15} />
                </button>
              </div>

              {/* New Conversation Dropdown Selector (Pribadi vs Bersama) */}
              <div className="relative">
                <Button
                  onClick={() => setNewChatMenuOpen(!newChatMenuOpen)}
                  variant="outline"
                  size="sm"
                  className="w-full justify-between items-center px-3 bg-[#fef9ef] text-[#B45529] hover:bg-[#fbf0eb] font-semibold text-xs border border-[#B45529]/30 rounded-full h-9 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <SolarIcon name="plus" size={14} />
                    <span>New Conversation</span>
                  </span>
                  <SolarIcon name="arrow-down" size={12} className={`transition-transform duration-200 ${newChatMenuOpen ? "rotate-180" : ""}`} />
                </Button>

                {newChatMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setNewChatMenuOpen(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#fef9ef] rounded-[14px] shadow-xl border border-[#d1c9bf]/60 p-1.5 z-50 animate-in fade-in-0 zoom-in-95 space-y-1">
                      {/* Option 1: Pribadi (Personal with Share to Partner) */}
                      <button
                        type="button"
                        onClick={() => {
                          handleNewChat("personal");
                          setNewChatMenuOpen(false);
                        }}
                        className="w-full text-left p-2 rounded-[10px] hover:bg-[#f5eee1] transition-colors cursor-pointer group flex items-start gap-2.5"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#f5eee1] text-[#734a1a] flex items-center justify-center shrink-0 group-hover:bg-[#B45529] group-hover:text-[#fef9ef] transition-colors shadow-2xs mt-0.5">
                          <SolarIcon name="user" size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#2a2b2f]">Personal</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#f5eee1] text-[#734a1a] font-mono">Private</span>
                          </div>
                          <p className="text-[10px] text-[#808988] leading-tight mt-0.5">
                            Private consultation. Freely shareable to {currentUser === "partner_a" ? partnerBName : partnerAName} anytime.
                          </p>
                        </div>
                      </button>

                      {/* Option 2: Bersama (Shared Joint Space) */}
                      <button
                        type="button"
                        onClick={() => {
                          handleNewChat("shared");
                          setNewChatMenuOpen(false);
                        }}
                        className="w-full text-left p-2 rounded-[10px] hover:bg-[#f5eee1] transition-colors cursor-pointer group flex items-start gap-2.5 border-t border-[#d1c9bf]/25 pt-2"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0 group-hover:bg-[#B45529] group-hover:text-[#fef9ef] transition-colors shadow-2xs mt-0.5">
                          <SolarIcon name="users-group-rounded" size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#2a2b2f]">Shared</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#fbf0eb] text-[#B45529] font-mono">Synced</span>
                          </div>
                          <p className="text-[10px] text-[#808988] leading-tight mt-0.5">
                            Joint discussion directly synced with {currentUser === "partner_a" ? partnerBName : partnerAName}.
                          </p>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Chat Filter Menu: All, Shared, Private */}
              <div className="flex p-0.5 bg-[#ebe2d3] rounded-full text-xs font-medium text-[#515151] shadow-2xs">
                <button
                  type="button"
                  onClick={() => setHistoryFilter("all")}
                  className={`flex-1 py-1 px-2 rounded-full text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    historyFilter === "all"
                      ? "bg-[#fef9ef] text-[#2a2b2f] shadow-xs"
                      : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                  title="Show all conversations"
                >
                  <span>All</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      historyFilter === "all"
                        ? "bg-[#ebe2d3] text-[#2a2b2f]"
                        : "bg-[#ded5c5] text-[#717171]"
                    }`}
                  >
                    {sessions.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryFilter("shared")}
                  className={`flex-1 py-1 px-2 rounded-full text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    historyFilter === "shared"
                      ? "bg-[#fef9ef] text-[#B45529] shadow-xs"
                      : "text-[#515151] hover:text-[#B45529]"
                  }`}
                  title="Filter to Shared conversations synced with partner"
                >
                  <SolarIcon name="users-group-rounded" size={11} />
                  <span>Shared</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      historyFilter === "shared"
                        ? "bg-[#fbf0eb] text-[#B45529]"
                        : "bg-[#ded5c5] text-[#717171]"
                    }`}
                  >
                    {sharedCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryFilter("private")}
                  className={`flex-1 py-1 px-2 rounded-full text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    historyFilter === "private"
                      ? "bg-[#fef9ef] text-[#734a1a] shadow-xs"
                      : "text-[#515151] hover:text-[#734a1a]"
                  }`}
                  title="Filter to Private personal conversations"
                >
                  <SolarIcon name="lock-keyhole" size={10} />
                  <span>Private</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      historyFilter === "private"
                        ? "bg-[#f5eee1] text-[#734a1a]"
                        : "bg-[#ded5c5] text-[#717171]"
                    }`}
                  >
                    {privateCount}
                  </span>
                </button>
              </div>
            </div>

            {/* Session List Grouped */}
            <div className="flex-1 overflow-y-auto p-2 space-y-3.5">
              {filteredSessions.length === 0 ? (
                <div className="py-10 px-3 text-center space-y-2 animate-in fade-in-0 duration-200">
                  <div className="w-10 h-10 rounded-full bg-[#ebe2d3] text-[#808988] flex items-center justify-center mx-auto shadow-2xs">
                    <SolarIcon
                      name={historyFilter === "shared" ? "users-group-rounded" : "lock-keyhole"}
                      size={18}
                    />
                  </div>
                  <p className="text-xs font-semibold text-[#2a2b2f]">
                    {historyFilter === "shared"
                      ? "No shared conversations"
                      : "No private conversations"}
                  </p>
                  <p className="text-[11px] text-[#808988] leading-relaxed max-w-[200px] mx-auto">
                    {historyFilter === "shared"
                      ? "Start a new shared conversation or share an existing chat with your partner."
                      : "All of your conversations are currently shared in Couple Space."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter("all")}
                    className="text-[11px] font-semibold text-[#B45529] hover:underline cursor-pointer pt-1 block mx-auto"
                  >
                    View all conversations
                  </button>
                </div>
              ) : (
                (["Today", "Yesterday", "Previous"] as const).map((group) => {
                  const groupSessions = filteredSessions.filter((s) => s.dateGroup === group);
                  if (groupSessions.length === 0) return null;

                  return (
                    <div key={group} className="space-y-1">
                      <span className="px-2.5 text-[10px] font-bold text-[#808988] uppercase tracking-wider block">
                        {group}
                      </span>
                    <div className="space-y-0.5">
                      {groupSessions.map((session) => {
                        const isActive = session.id === activeSessionId;
                        const isEditing = editingSessionId === session.id;
                        const isMenuOpen = activeMenuSessionId === session.id;

                        return (
                          <div
                            key={session.id}
                            onClick={() => {
                              if (isEditing) return;
                              setActiveSessionId(session.id);
                              if (typeof window !== "undefined" && window.innerWidth < 768) {
                                setShowHistory(false);
                              }
                            }}
                            className={`group relative flex items-center justify-between px-2.5 py-2 rounded-[10px] transition-all cursor-pointer text-xs ${
                              isActive
                                ? "bg-[#fef9ef] text-[#2a2b2f] shadow-xs font-semibold border-l-2 border-[#B45529]"
                                : "text-[#515151] hover:bg-[#f5eee1] hover:text-[#2a2b2f]"
                            }`}
                          >
                            {isEditing ? (
                              <form
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  handleSaveTitle(session.id);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1.5 flex-1 min-w-0"
                              >
                                <input
                                  type="text"
                                  autoFocus
                                  value={editTitleText}
                                  onChange={(e) => setEditTitleText(e.target.value)}
                                  className="flex-1 min-w-0 px-2 py-1 text-xs rounded bg-[#fef9ef] border border-[#B45529] text-[#2a2b2f] focus:outline-none"
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") setEditingSessionId(null);
                                  }}
                                />
                                <button
                                  type="submit"
                                  className="p-1 rounded bg-[#B45529] text-[#fef9ef] hover:bg-[#943e18] cursor-pointer"
                                  title="Save name"
                                >
                                  <SolarIcon name="check" size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingSessionId(null)}
                                  className="p-1 rounded text-[#808988] hover:text-[#2a2b2f] cursor-pointer"
                                  title="Cancel"
                                >
                                  <SolarIcon name="close-circle" size={12} />
                                </button>
                              </form>
                            ) : (
                              <div className="min-w-0 flex-1 pr-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="truncate text-xs leading-snug font-medium">{session.title}</p>
                                  {session.isShared ? (
                                    <span
                                      title="Shared with partner in Couple Space"
                                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#B45529] bg-[#fbf0eb] px-1.5 py-0.5 rounded-full shrink-0 border border-[#B45529]/20"
                                    >
                                      <SolarIcon name="users-group-rounded" size={9} />
                                      <span>Shared</span>
                                    </span>
                                  ) : (
                                    <span
                                      title="Private personal chat"
                                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#734a1a] bg-[#f5eee1] px-1.5 py-0.5 rounded-full shrink-0 border border-[#d1c9bf]/40"
                                    >
                                      <SolarIcon name="lock-keyhole" size={9} />
                                      <span>Private</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-[#808988] font-normal block truncate mt-0.5">
                                  {session.timestamp}
                                </span>
                              </div>
                            )}

                            {/* Triple Dots Menu Button */}
                            {!isEditing && (
                              <div className="relative shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuSessionId(isMenuOpen ? null : session.id);
                                  }}
                                  className={`p-1 rounded-md text-[#808988] hover:text-[#2a2b2f] hover:bg-[#ece3d3] transition-colors cursor-pointer ${
                                    isMenuOpen
                                      ? "opacity-100 bg-[#ece3d3] text-[#2a2b2f]"
                                      : "opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                                  }`}
                                  title="Conversation options"
                                  aria-label="Conversation options"
                                >
                                  <SolarIcon name="dots-menu" size={13} />
                                </button>

                                {/* Dropdown Menu */}
                                {isMenuOpen && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-40"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuSessionId(null);
                                      }}
                                    />
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute right-0 top-full mt-1 w-48 bg-[#fef9ef] rounded-[10px] shadow-lg border border-[#d1c9bf]/60 py-1 z-50 animate-in fade-in-0 zoom-in-95 text-xs text-[#2a2b2f]"
                                    >
                                      {/* Option 1: Change Name */}
                                      <button
                                        onClick={() => {
                                          setEditingSessionId(session.id);
                                          setEditTitleText(session.title);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#f5eee1] transition-colors text-left cursor-pointer font-medium"
                                      >
                                        <SolarIcon name="edit" size={13} className="text-[#808988]" />
                                        <span>Change Name</span>
                                      </button>

                                      {/* Option 2: Share to Partner */}
                                      <button
                                        onClick={() => {
                                          handleToggleShare(session.id);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#f5eee1] transition-colors text-left cursor-pointer font-medium"
                                      >
                                        <SolarIcon name="users-group-rounded" size={13} className="text-[#B45529]" />
                                        <span>{session.isShared ? "Unshare from Partner" : "Share to Partner"}</span>
                                      </button>

                                      <div className="h-px bg-[#d1c9bf]/30 my-1" />

                                      {/* Option 3: Delete */}
                                      <button
                                        onClick={(e) => {
                                          handleDeleteSession(session.id, e);
                                          setActiveMenuSessionId(null);
                                        }}
                                        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#fcf0ee] text-[#a34426] transition-colors text-left cursor-pointer font-medium"
                                      >
                                        <SolarIcon name="close-circle" size={13} className="text-[#a34426]" />
                                        <span>Delete Conversation</span>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }))}
            </div>

            {/* Footer space indicator */}
            <div className="p-3 border-t border-[#d1c9bf]/30 bg-[#f8f3e9] flex items-center justify-between text-[11px] text-[#515151]">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2d5232]" />
                <span>Synced with Couple Space</span>
              </span>
              <span className="font-mono text-[10px] text-[#808988]">
                {filteredSessions.length} {historyFilter === "all" ? "chats" : `${historyFilter} ${filteredSessions.length === 1 ? "chat" : "chats"}`}
              </span>
            </div>
          </aside>
        </>
      )}

      {/* 2. MAIN CHAT CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Chat Header */}
        <div className="px-4 sm:px-5 py-3 bg-[#f5eee1] border-b border-[#d1c9bf]/30 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {!showHistory && (
              <button
                onClick={() => setShowHistory(true)}
                className="p-1.5 rounded-lg bg-[#fef9ef] text-[#515151] hover:text-[#B45529] transition-colors cursor-pointer shadow-2xs shrink-0"
                title="Open chat history"
              >
                <SolarIcon name="chat-round-dots" size={16} />
              </button>
            )}

            {/* Mascot Emblem with thinking eye animation */}
            <div className="w-9 h-9 rounded-full bg-[#fef9ef] border border-[#e5dcd0] flex items-center justify-center shrink-0 shadow-2xs">
              <SeiyaIcon size={24} isThinking={isProcessing} />
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-serif font-normal text-[#2a2b2f] leading-tight truncate">
                {activeSession?.title || "New Consultation"}
              </h3>
              {isProcessing && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#B45529] font-medium mt-0.5 animate-in fade-in-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B45529] animate-ping" />
                  <span>Analyzing rules & balances...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Share to Partner button for Personal chats */}
            {activeSession && !activeSession.isShared && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleShare(activeSession.id)}
                className="h-7 px-2.5 rounded-full text-[11px] font-semibold text-[#B45529] border-[#B45529]/30 hover:bg-[#B45529] hover:text-[#fef9ef] gap-1 shadow-2xs"
                title={`Share this conversation with ${currentUser === "partner_a" ? partnerBName : partnerAName}`}
              >
                <SolarIcon name="users-group-rounded" size={13} />
                <span className="hidden sm:inline">Share with {currentUser === "partner_a" ? partnerBName : partnerAName}</span>
                <span className="sm:hidden">Share</span>
              </Button>
            )}

            {activeSession && activeSession.isShared && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2d5232] bg-[#edf3ec] px-2.5 py-1 rounded-full border border-[#2d5232]/20">
                <SolarIcon name="users-group-rounded" size={12} />
                <span className="hidden sm:inline">Shared with {currentUser === "partner_a" ? partnerBName : partnerAName}</span>
                <span className="sm:hidden">Shared</span>
              </span>
            )}

            <Badge variant="neutral">{reportingCurrency}</Badge>
          </div>
        </div>

        {/* Quick Prompts Bar */}
        <div className="px-4 py-2 bg-[#f5eee1] border-b border-[#d1c9bf]/20 overflow-x-auto whitespace-nowrap flex gap-2 scrollbar-none">
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p.text)}
              className="px-3 py-1 rounded-full bg-[#fef9ef] hover:text-[#B45529] hover:bg-[#ece3d3] text-[11px] font-semibold text-[#333333] transition-all cursor-pointer shrink-0 shadow-2xs"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Neutral Condition (No active session selected yet): AI landing screen with suggestions */}
          {!activeSession && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8 sm:py-12 animate-in fade-in-0 duration-300">
              <SeiyaVideoAvatar size={210} className="mb-2" />
              <h2 className="text-2xl font-serif font-normal text-[#2a2b2f] mb-2">
                How can I help you today, {activeName}?
              </h2>
              <p className="text-xs sm:text-sm text-[#515151] leading-relaxed max-w-md mb-6">
                I am Seiya, your AI financial co-pilot operating under your Couple Contract. Ask any question or propose a transaction to start a new chat automatically.
              </p>

              {/* Mode switch for the next conversation */}
              <div className="inline-flex p-1 bg-[#ebe2d3] rounded-full gap-1 mb-6 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setNewChatMode("personal")}
                  className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    newChatMode === "personal"
                      ? "bg-[#fef9ef] text-[#2a2b2f] shadow-xs"
                      : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  <SolarIcon name="user" size={13} />
                  <span>Personal (Private)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewChatMode("shared")}
                  className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    newChatMode === "shared"
                      ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                      : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  <SolarIcon name="users-group-rounded" size={13} />
                  <span>Shared with {partnerName}</span>
                </button>
              </div>

              {/* Starter prompts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                <button
                  onClick={() => handleSend("Can we afford all bills this month?")}
                  className="p-3 rounded-[14px] bg-[#fef9ef] hover:bg-[#fffdf9] border border-[#d1c9bf]/50 hover:border-[#B45529]/40 text-xs text-[#2a2b2f] shadow-2xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 font-semibold text-[#B45529] mb-1">
                    <SolarIcon name="calendar" size={15} />
                    <span>Affordability Check</span>
                  </div>
                  <span className="text-[11px] text-[#515151]">Can we afford all upcoming bills this month?</span>
                </button>

                <button
                  onClick={() => handleSend("Paid $45 for lunch together, I paid.")}
                  className="p-3 rounded-[14px] bg-[#fef9ef] hover:bg-[#fffdf9] border border-[#d1c9bf]/50 hover:border-[#B45529]/40 text-xs text-[#2a2b2f] shadow-2xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 font-semibold text-[#B45529] mb-1">
                    <SolarIcon name="receipt" size={15} />
                    <span>Log an Expense</span>
                  </div>
                  <span className="text-[11px] text-[#515151]">Paid $45 for lunch together, I paid.</span>
                </button>

                <button
                  onClick={() => handleSend("We want to save $15,000 for our trip to Kyoto in 10 months.")}
                  className="p-3 rounded-[14px] bg-[#fef9ef] hover:bg-[#fffdf9] border border-[#d1c9bf]/50 hover:border-[#B45529]/40 text-xs text-[#2a2b2f] shadow-2xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 font-semibold text-[#B45529] mb-1">
                    <SolarIcon name="chart" size={15} />
                    <span>Create Savings Plan</span>
                  </div>
                  <span className="text-[11px] text-[#515151]">Save $15,000 for Kyoto in 10 months.</span>
                </button>

                <button
                  onClick={() => handleSend("Pay for annual home insurance $1,200 from shared wallet.")}
                  className="p-3 rounded-[14px] bg-[#fef9ef] hover:bg-[#fffdf9] border border-[#d1c9bf]/50 hover:border-[#B45529]/40 text-xs text-[#2a2b2f] shadow-2xs transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 font-semibold text-[#B45529] mb-1">
                    <SolarIcon name="shield-check" size={15} />
                    <span>Propose Large Expense</span>
                  </div>
                  <span className="text-[11px] text-[#515151]">Propose $1,200 annual home insurance.</span>
                </button>
              </div>
            </div>
          )}
          {activeSession?.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.sender === "seiya" && (
                <div className="w-8 h-8 rounded-full bg-[#fef9ef] border border-[#e5dcd0] flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <SeiyaIcon size={20} />
                </div>
              )}

              <div className={`max-w-[85%] sm:max-w-xl ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                {/* Message bubble */}
                <div
                  className={`p-3.5 rounded-[20px] text-xs sm:text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-[#B45529] text-[#fef9ef] rounded-tr-xs shadow-xs"
                      : "bg-[#fef9ef] text-[#2a2b2f] rounded-tl-xs shadow-2xs"
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>

                {/* Timestamp */}
                <span className="text-[10px] text-[#515151] mt-1 block px-1">
                  {msg.timestamp} {msg.userRole && `• by ${msg.userRole === "partner_a" ? partnerAName : partnerBName}`}
                </span>

                {/* Embedded Structured Cards */}
                {msg.cardType === "ACTION_ALLOW" && msg.cardData && (
                  <ActionCard
                    outcome="ALLOW"
                    title={msg.cardData.title}
                    amount={msg.cardData.amount}
                    currency={msg.cardData.currency || reportingCurrency}
                    category={msg.cardData.category}
                    wallet={msg.cardData.wallet}
                    reason="Validated against couple budget and contract split."
                    details={msg.cardData}
                  />
                )}

                {msg.cardType === "ACTION_NEED_APPROVAL" && msg.cardData && (
                  <ActionCard
                    outcome="NEED_APPROVAL"
                    title={msg.cardData.title}
                    amount={msg.cardData.amount}
                    currency={msg.cardData.currency || reportingCurrency}
                    wallet={msg.cardData.wallet}
                    reason={msg.cardData.reason}
                    details={msg.cardData}
                  />
                )}

                {msg.cardType === "ACTION_HOLD" && msg.cardData && (
                  <ActionCard
                    outcome="HOLD"
                    title={msg.cardData.title}
                    amount={msg.cardData.amount}
                    currency={msg.cardData.currency || reportingCurrency}
                    wallet={msg.cardData.wallet}
                    reason={msg.cardData.reason}
                    details={msg.cardData}
                  />
                )}

                {msg.cardType === "ACTION_DENY" && msg.cardData && (
                  <ActionCard
                    outcome="DENY"
                    title={msg.cardData.title}
                    amount={msg.cardData.amount}
                    currency={msg.cardData.currency || reportingCurrency}
                    wallet={msg.cardData.wallet}
                    reason={msg.cardData.reason}
                    details={msg.cardData}
                  />
                )}

                {msg.cardType === "PLAN" && msg.cardData && (
                  <PlanCard
                    title={msg.cardData.title}
                    targetAmount={msg.cardData.targetAmount}
                    currency={msg.cardData.currency || reportingCurrency}
                    currentAmount={msg.cardData.currentAmount}
                    horizon={msg.cardData.horizon}
                    monthlyTarget={msg.cardData.monthlyTarget}
                    split={msg.cardData.split}
                    fundingWallet={msg.cardData.fundingWallet}
                    assumptions={msg.cardData.assumptions}
                    status="Proposed"
                  />
                )}

                {msg.cardType === "CLARIFICATION" && msg.cardData && (
                  <ClarificationCard
                    question={msg.cardData.question}
                    options={msg.cardData.options}
                    onSelect={(opt) => handleSend(opt)}
                  />
                )}
              </div>
            </div>
          ))}

          {/* Thinking / Generating State with Animated Eyes */}
          {isProcessing && (
            <div className="flex gap-3 justify-start items-center animate-in fade-in-0 duration-200">
              <div className="w-8 h-8 rounded-full bg-[#fef9ef] border border-[#e5dcd0] flex items-center justify-center shrink-0 shadow-2xs">
                <SeiyaIcon size={22} isThinking={true} />
              </div>
              <div className="p-3.5 rounded-[20px] bg-[#fef9ef] rounded-tl-xs flex items-center gap-2.5 text-xs text-[#515151] shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#B45529] animate-ping" />
                <span className="font-medium text-[#2a2b2f]">Checking rules & balances...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="p-2.5 sm:p-4 bg-[#f5eee1] border-t border-[#d1c9bf]/30 flex items-center gap-1.5 sm:gap-2"
        >
          {/* Action buttons: Attach File & Image */}
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              type="button"
              onClick={() => handleSend("Here is my invoice document. Please analyze and log it.")}
              className="p-1.5 sm:p-2 rounded-full text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3] transition-colors cursor-pointer"
              title="Attach document or PDF"
              aria-label="Attach file"
            >
              <SolarIcon name="paperclip" size={17} />
            </button>
            <button
              type="button"
              onClick={() => handleSend("Here is our receipt photo. Can you split this expense?")}
              className="p-1.5 sm:p-2 rounded-full text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3] transition-colors cursor-pointer"
              title="Upload receipt photo or image"
              aria-label="Attach image"
            >
              <SolarIcon name="image" size={17} />
            </button>
          </div>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask Seiya as ${activeName}...`}
            className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#fef9ef] border border-[#d1c9bf] text-xs sm:text-sm text-[#2a2b2f] placeholder-[#808988] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20 transition-all shadow-2xs"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!inputText.trim() || isProcessing}
            className="rounded-[40px] px-3.5 sm:px-5 h-9 sm:h-10 shrink-0 font-bold flex items-center gap-1.5"
          >
            <SolarIcon name="paper-plane" size={15} className="text-[#fef9ef]" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
