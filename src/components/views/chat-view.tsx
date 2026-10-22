"use client";

import React, { useState, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { OrbSignal } from "orb-ui";
import { SolarIcon } from "@/components/icons/solar";
import { RichText } from "@/components/ui/rich-text";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeiyaVideoAvatar } from "@/components/ui/seiya-video-avatar";
import { ActionCard, PlanCard, ClarificationCard } from "@/components/cards/domain-cards";
import { useApp, ChatMessage } from "@/lib/store";
import { apiCommitStatement, apiPreviewStatement, apiScanReceipt, type StatementTransaction } from "@/lib/api";
import { BillDraftCard, ReceiptDraftCard, StatementPreviewCard, type BillDraft, type ReceiptConfirmation } from "@/components/cards/attachment-cards";
import { readReceiptOnDevice } from "@/lib/receipt-ocr";
import { formatRelativeDate } from "@/lib/transformers";

const Orb = dynamic(() => import("orb-ui").then((mod) => mod.Orb), {
  ssr: false,
});

const orangeCloudTheme = {
  name: "cloud" as const,
  appearance: {
    deepColor: "#8c320a",      // Rich burnt orange / terracotta
    upperColor: "#f26a1b",     // Radiant vibrant sunset orange
    lowerColor: "#fb923c",     // Soft warm amber peach
    highlightColor: "#fff7ed", // Luminous sunlight gold cream
    launchColor: "#f26a1b",
    spinnerColor: "#ea580c",
  },
};


type ScannedReceiptLike = {
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  category: "Food & Drinks" | "Shopping" | "Bills" | "Transportation" | "Health" | "Social" | "Others";
};

// Unique ids for messages and chats created on this device.
function newLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
    sendChatMessage,
    loadChatHistory,
    updateConversation,
    deleteConversation,
    householdId,
    partnerAName,
    partnerBName,
    reportingCurrency,
    locale,
    pendingDirectChat,
    setPendingDirectChat,
    partnerProfile,
    refreshData,
    proposeExpense,
    addBill,
    household,
  } = useApp();

  const activeName = currentUser === "partner_a" ? partnerAName : partnerBName;
  // Until the partner joins, the store only has a "Partner B" placeholder.
  const partnerName = partnerProfile
    ? currentUser === "partner_a" ? partnerBName : partnerAName
    : "your partner";

  // First message of a new conversation.
  const introFor = (isShared: boolean) =>
    isShared
      ? `Hi ${activeName} and ${partnerName}! This is a **shared chat**: you both see everything here, and Seiya's suggestions follow your **Seiya's Promise**.`
      : `Hi ${activeName}! This is your **private chat** with Seiya, and only you can see it. Ask about your spending, plans, or anything on your mind. When you're ready, tap **Share with ${partnerName}** to bring it into your shared space.`;

  // Conversations live in Supabase; new ones are added as the user chats.
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const appendToSession = (sessionId: string, message: ChatMessage) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === sessionId ? { ...session, messages: [...session.messages, message] } : session
      )
    );
  };

  // ---------------------------------------------------------------------------
  // Attachments: 📎 bank statement (preview -> import) and 🖼 receipt photo
  // (read -> confirm -> record through the normal expense rules).
  // ---------------------------------------------------------------------------
  const statementInputRef = useRef<HTMLInputElement>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
  const baseCurrency = household?.baseCurrency ?? reportingCurrency;
  const nowTime = () => new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const seiyaNote = (text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
    id: newLocalId("msg"),
    sender: "seiya",
    text,
    timestamp: nowTime(),
    ...extra,
  });

  // Posts the user's attachment line into the open chat, starting a chat if needed.
  const postUserAttachment = (label: string): string => {
    const userMsg: ChatMessage = {
      id: newLocalId("msg"),
      sender: "user",
      userRole: currentUser,
      text: label,
      timestamp: nowTime(),
    };
    if (activeSessionId) {
      appendToSession(activeSessionId, userMsg);
      return activeSessionId;
    }
    const id = newLocalId("session");
    const isShared = newChatMode === "shared";
    setSessions((prev) => [
      {
        id,
        title: label.length > 32 ? label.slice(0, 32) + "..." : label,
        timestamp: "Just now",
        dateGroup: "Today",
        mode: newChatMode,
        isShared,
        creatorRole: currentUser,
        messages: [seiyaNote(introFor(isShared)), userMsg],
      },
      ...prev,
    ]);
    setActiveSessionId(id);
    return id;
  };

  const friendlyError = (error: unknown, fallback: string) => {
    const message = error instanceof Error && error.message ? error.message : fallback;
    if (/not active yet|no active (shared|personal) wallet/i.test(message)) {
      return "Your wallets open after you and your partner agree on Seiya's Promise. Try again once it's active.";
    }
    return message;
  };

  // Attachments wait in the composer until Send, so the user can add a note.
  type AttachmentKind = "statement" | "receipt";
  type WalletChoice = "shared" | "personal";
  const [pendingAttachment, setPendingAttachment] = useState<{ file: File; hint: AttachmentKind; previewUrl: string | null } | null>(null);
  const [processingLabel, setProcessingLabel] = useState<string | null>(null);

  const isImageFile = (f: File) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name);
  const isSheetFile = (f: File) => /\.(csv|xlsx|xls)$/i.test(f.name);
  const isPdfFile = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  const stageAttachment = (file: File, hint: AttachmentKind) => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, hint, previewUrl: isImageFile(file) ? URL.createObjectURL(file) : null };
    });
  };
  const clearAttachment = () =>
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });

  // "masuk shared ya" / "pribadi" in the note preselects the wallet on the card.
  const walletFromNote = (note: string): WalletChoice | undefined =>
    /\b(shared|bersama|berdua|patungan|joint)\b/i.test(note)
      ? "shared"
      : /\b(pribadi|personal|sendiri|private)\b/i.test(note)
        ? "personal"
        : undefined;

  const processStatement = async (sessionId: string, file: File, wallet: WalletChoice | undefined, rethrow = false) => {
    if (!householdId) return;
    setProcessingLabel("Reading your statement…");
    try {
      const res = await apiPreviewStatement(householdId, file);
      appendToSession(
        sessionId,
        seiyaNote(
          `I found **${res.extractedCount} transaction${res.extractedCount === 1 ? "" : "s"}** in your statement. Check them below and choose which wallet to import them into. Nothing is saved until you confirm.`,
          { cardType: "STATEMENT_PREVIEW", cardData: { fileName: res.fileName || file.name, transactions: res.transactions, defaultWallet: wallet } }
        )
      );
    } catch (error) {
      if (rethrow) throw error;
      appendToSession(sessionId, seiyaNote(friendlyError(error, "I couldn't read that statement. Please try another file.")));
    }
  };

  const postReceiptDraft = (sessionId: string, receipt: ScannedReceiptLike, note: string, wallet: WalletChoice | undefined) => {
    const missing = receipt.total === null ? " I couldn't read the total, so please type it in." : "";
    appendToSession(
      sessionId,
      seiyaNote(`Here's what I read from your receipt. Check the details, then tap **Record expense**.${missing}`, {
        cardType: "RECEIPT_DRAFT",
        cardData: { ...receipt, merchant: receipt.merchant ?? (note ? note.slice(0, 80) : null), defaultWallet: wallet },
      })
    );
  };

  const processReceiptPdf = async (sessionId: string, file: File, note: string, wallet: WalletChoice | undefined, rethrow = false) => {
    if (!householdId) return;
    setProcessingLabel("Reading your receipt…");
    try {
      const res = await apiScanReceipt(householdId, file, file.name);
      postReceiptDraft(sessionId, res.receipt, note, wallet);
    } catch (error) {
      if (rethrow) throw error;
      appendToSession(sessionId, seiyaNote(friendlyError(error, "I couldn't read that receipt.")));
    }
  };

  // Photos: on-device OCR first (no AI tokens); the vision model is only a fallback.
  const processReceiptImage = async (sessionId: string, file: File, note: string, wallet: WalletChoice | undefined) => {
    if (!householdId) return;
    let image: Blob;
    try {
      image = await shrinkImage(file);
    } catch {
      appendToSession(sessionId, seiyaNote("I couldn't open that photo. Please take it again as a JPG or PNG."));
      return;
    }
    setProcessingLabel("Reading your receipt on this device…");
    try {
      const { fields } = await readReceiptOnDevice(image);
      if (fields.total !== null) {
        postReceiptDraft(sessionId, fields, note, wallet);
        return;
      }
    } catch (error) {
      console.warn("[receipt] on-device OCR unavailable:", error instanceof Error ? error.message : error);
    }
    if (image.size > MAX_UPLOAD_BYTES) {
      appendToSession(sessionId, seiyaNote("That photo is larger than **4 MB**. Please crop it to just the receipt."));
      return;
    }
    setProcessingLabel("Taking a closer look at your receipt…");
    try {
      const res = await apiScanReceipt(householdId, image, "receipt.jpg");
      postReceiptDraft(sessionId, res.receipt, note, wallet);
    } catch (error) {
      appendToSession(sessionId, seiyaNote(friendlyError(error, "I couldn't read that receipt. Try a sharper, well-lit photo.")));
    }
  };

  const sendAttachment = async (noteRaw: string) => {
    const attachment = pendingAttachment;
    if (!attachment || !householdId) return;
    const { file, hint } = attachment;
    const note = noteRaw.trim();
    clearAttachment();
    setInputText("");

    const sessionId = postUserAttachment(`${isImageFile(file) ? "🖼" : "📎"} ${file.name}${note ? `\n${note}` : ""}`);
    const wallet = walletFromNote(note);

    if (!isImageFile(file) && file.size > MAX_UPLOAD_BYTES) {
      appendToSession(sessionId, seiyaNote("That file is larger than **4 MB**. Please export a shorter period (for example one month) and try again."));
      return;
    }

    setIsProcessing(true);
    try {
      if (isImageFile(file)) {
        await processReceiptImage(sessionId, file, note, wallet);
      } else if (isSheetFile(file)) {
        await processStatement(sessionId, file, wallet);
      } else if (isPdfFile(file)) {
        // A PDF can be either; try the button's intent first, then the other.
        const order: AttachmentKind[] = hint === "receipt" ? ["receipt", "statement"] : ["statement", "receipt"];
        let lastError: unknown = null;
        for (const kind of order) {
          try {
            if (kind === "statement") await processStatement(sessionId, file, wallet, true);
            else await processReceiptPdf(sessionId, file, note, wallet, true);
            return;
          } catch (error) {
            lastError = error;
          }
        }
        appendToSession(sessionId, seiyaNote(friendlyError(lastError, "I couldn't find a statement or a receipt in this PDF.")));
      } else {
        appendToSession(
          sessionId,
          seiyaNote("I can read **bank statements** (PDF, Excel or CSV) and **receipts** (a photo or a PDF e-receipt). Please attach one of those.")
        );
      }
    } finally {
      setIsProcessing(false);
      setProcessingLabel(null);
    }
  };

  const importStatement = async (sessionId: string | null, transactions: StatementTransaction[], walletType: "shared" | "personal") => {
    if (!householdId) throw new Error("No household found.");
    try {
      const res = await apiCommitStatement(householdId, { transactions, walletType, paidBy: currentUser });
      void refreshData();
      const count = res.importedCount ?? transactions.length;
      const where = walletType === "shared" ? "your shared wallet" : "your personal wallet";
      if (sessionId) appendToSession(sessionId, seiyaNote(`Done! I imported **${count} transaction${count === 1 ? "" : "s"}** into ${where}. You'll see them in Activity and in your monthly overview.`));
      return `Imported ${count} transaction${count === 1 ? "" : "s"} into ${where}.`;
    } catch (error) {
      throw new Error(friendlyError(error, "Import failed. Please try again."));
    }
  };

  // Phone photos are large; shrink to ~1600 px JPEG before upload.
  const shrinkImage = async (file: File): Promise<Blob> => {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't prepare the photo."))), "image/jpeg", 0.85)
    );
  };

  // "Add bill" on a bill draft card from Seiya.
  const saveBillDraft = async (bill: BillDraft): Promise<string> => {
    const ok = await addBill({
      title: bill.title,
      amount: bill.amount,
      currency: bill.currency,
      dueDate: bill.dueDate,
      wallet: "shared",
      category: bill.payee || "Bills",
      status: "upcoming",
      isRecurring: bill.recurrence === "monthly",
    });
    if (!ok) throw new Error("Couldn't add this bill. Please try again.");
    return `Added to Bills${bill.recurrence === "monthly" ? " · repeats every month" : ""}.`;
  };

  const recordReceipt = async (sessionId: string | null, draft: ReceiptConfirmation) => {
    try {
      const res = await proposeExpense({
        title: draft.title,
        amount: draft.amount,
        currency: draft.currency,
        category: draft.category,
        wallet: draft.wallet === "shared" ? "shared" : currentUser === "partner_a" ? "personal_a" : "personal_b",
        notes: draft.date ? `Receipt dated ${draft.date}` : "From a receipt photo",
        receiptName: "receipt.jpg",
      });
      const amountText = new Intl.NumberFormat(locale, { style: "currency", currency: draft.currency, maximumFractionDigits: 2 }).format(draft.amount);
      const text =
        res.outcome === "ALLOW"
          ? `Recorded **${amountText}** at ${draft.title}.`
          : res.outcome === "NEED_APPROVAL"
            ? `**${amountText}** at ${draft.title} is above your agreed limit, so I sent it to ${partnerName} for approval.`
            : `**${amountText}** at ${draft.title} is on hold until tomorrow morning (cooling-off). You can continue or cancel it in Waiting List.`;
      if (sessionId) appendToSession(sessionId, seiyaNote(text));
      return text.replace(/\*\*/g, "");
    } catch (error) {
      throw new Error(friendlyError(error, "Couldn't record this expense. Please try again."));
    }
  };

  // Restore saved conversations for this household.
  useEffect(() => {
    let cancelled = false;
    loadChatHistory().then((history) => {
      if (cancelled || history.length === 0) return;
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      setSessions((prev) => {
        const known = new Set(prev.map((s) => s.id));
        const restored: ChatSession[] = history
          .filter((h) => !known.has(`history-${h.conversationId}`))
          .map((h) => {
            const updated = new Date(h.updatedAt).getTime();
            const dateGroup: ChatSession["dateGroup"] =
              updated >= startOfToday.getTime()
                ? "Today"
                : updated >= startOfToday.getTime() - 86_400_000
                ? "Yesterday"
                : "Previous";
            return {
              id: `history-${h.conversationId}`,
              title: h.title,
              timestamp: formatRelativeDate(h.updatedAt, locale),
              dateGroup,
              mode: h.isShared ? "shared" : "personal",
              isShared: h.isShared,
              creatorRole: h.creatorRole,
              messages: h.messages,
            };
          });
        return [...prev, ...restored];
      });
    });
    return () => {
      cancelled = true;
    };
  }, [householdId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newChatMode, setNewChatMode] = useState<"personal" | "shared">("personal");
  const [historyFilter, setHistoryFilter] = useState<"all" | "shared" | "private">("all");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [inputText, setInputText] = useState("");
  const hasComposerContent = Boolean(inputText.trim() || pendingAttachment);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMenuSessionId, setActiveMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [newChatMenuOpen, setNewChatMenuOpen] = useState(false);
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const [isVoiceSpeaking, setIsVoiceSpeaking] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [liveVoiceTranscript, setLiveVoiceTranscript] = useState("");
  const [hasVoiceTranscribed, setHasVoiceTranscribed] = useState(false);
  const [orbVolume, setOrbVolume] = useState(0);
  const recognitionRef = useRef<any>(null);
  const mascotVideoRef = useRef<HTMLVideoElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Audio-reactive volume animation for Cloud Voice Orb
  useEffect(() => {
    if (!isVoiceChatActive || isVoiceMuted) {
      setOrbVolume(0);
      return;
    }

    if (isVoiceSpeaking) {
      const interval = setInterval(() => {
        setOrbVolume(0.55 + Math.sin(Date.now() / 150) * 0.25 + Math.random() * 0.15);
      }, 80);
      return () => clearInterval(interval);
    }

    if (isVoiceListening) {
      const interval = setInterval(() => {
        if (liveVoiceTranscript.trim().length > 0) {
          setOrbVolume(0.45 + Math.sin(Date.now() / 180) * 0.2 + Math.random() * 0.2);
        } else {
          setOrbVolume(0.08 + Math.random() * 0.08);
        }
      }, 100);
      return () => clearInterval(interval);
    }

    setOrbVolume(0);
  }, [isVoiceChatActive, isVoiceMuted, isVoiceSpeaking, isVoiceListening, liveVoiceTranscript]);

  const orbSignal: OrbSignal = {
    state: !isVoiceChatActive
      ? "idle"
      : isVoiceSpeaking
      ? "speaking"
      : isProcessing
      ? "thinking"
      : "listening",
    inputVolume: isVoiceListening && !isVoiceMuted ? orbVolume : 0,
    outputVolume: isVoiceSpeaking ? orbVolume : 0,
  };

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) || null : null;
  const shouldHideLandingHero = Boolean(
    activeSession ||
    isVoiceChatActive ||
    liveVoiceTranscript.trim().length > 0 ||
    hasVoiceTranscribed ||
    isProcessing
  );

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
    // The welcome screen starts at the top; only a conversation follows its latest message.
    if (!activeSession && !isProcessing) return;
    scrollToBottom();
  }, [activeSession, activeSession?.messages, isProcessing]);

  // Handle direct chat shortcut initiated from dashboard
  useEffect(() => {
    if (pendingDirectChat) {
      const mode = pendingDirectChat.mode || "personal";
      const isShared = mode === "shared";
      const newSessionId = `session-${Date.now()}`;

      const introText = introFor(isShared);

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

      sendChatMessage(fullUserText, { sessionKey: newSessionId, shared: isShared })
        .then((reply) => {
          if (reply) appendToSession(newSessionId, reply);
        })
        .finally(() => {
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
    setHasVoiceTranscribed(false);
    setLiveVoiceTranscript("");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setShowHistory(false);
    }
    setToastMessage(
      mode === "shared"
        ? `Ready for Shared Conversation with ${partnerName}`
        : `Ready for Private Personal Conversation`
    );
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Only the person who started a chat can rename, share, delete or continue it.
  const ownsSession = (session: ChatSession | null | undefined) =>
    Boolean(session) && (session!.creatorRole ?? currentUser) === currentUser;

  // Delete Chat Session (saved on the server, so it stays deleted after a refresh)
  const handleDeleteSession = async (sessionId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = sessions.find((s) => s.id === sessionId);
    if (!ownsSession(target)) return;
    if (!(await deleteConversation(sessionId))) return;
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) setActiveSessionId(null);
    setToastMessage("Conversation deleted.");
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Save Renamed Conversation Title
  const handleSaveTitle = async (sessionId: string) => {
    const title = editTitleText.trim().slice(0, 120);
    const target = sessions.find((s) => s.id === sessionId);
    setEditingSessionId(null);
    if (!title || !target || title === target.title || !ownsSession(target)) return;
    setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title } : s)));
    if (!(await updateConversation(sessionId, { title }))) {
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? { ...s, title: target.title } : s)));
      return;
    }
    setToastMessage("Conversation renamed.");
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Toggle Share to Partner
  const handleToggleShare = async (sessionId: string) => {
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (!targetSession || !ownsSession(targetSession)) return;
    const nextShared = !targetSession.isShared;

    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, isShared: nextShared, mode: nextShared ? "shared" : "personal" } : s))
    );
    if (!(await updateConversation(sessionId, { shared: nextShared }))) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, isShared: targetSession.isShared, mode: targetSession.mode } : s))
      );
      return;
    }

    setToastMessage(
      nextShared
        ? `Shared with ${partnerName}.`
        : `This chat is private again.`
    );
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSend = async (textToSend?: string): Promise<ChatMessage | null> => {
    const text = textToSend || inputText;
    if (!text.trim()) return null;
    if (activeSession && !ownsSession(activeSession)) {
      setToastMessage(`${partnerName} shared this chat with you. Start a new chat to ask Seiya.`);
      setTimeout(() => setToastMessage(null), 3500);
      return null;
    }

    setInputText("");
    setIsProcessing(true);

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      userRole: currentUser,
      text,
      timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    };

    const targetSessionId = activeSessionId ?? `session-${Date.now()}`;

    // If currently in Neutral state (activeSessionId === null), auto-create a new conversation session
    if (!activeSessionId) {
      const newSessionId = targetSessionId;
      const isShared = newChatMode === "shared";
      const title = text.length > 32 ? text.slice(0, 32) + "..." : text;
      const introText = introFor(isShared);

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

    // Seiya's AI backend answers (and may record expenses through its tools).
    try {
      const sendShared = activeSessionId ? Boolean(activeSession?.isShared) : newChatMode === "shared";
      const reply = await sendChatMessage(text, { sessionKey: targetSessionId, shared: sendShared });
      if (reply) appendToSession(targetSessionId, reply);
      return reply;
    } finally {
      setIsProcessing(false);
    }
  };

  // Speech Synthesis Helper for Voice Chat
  const speakVoiceText = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const clean = text.replace(/[*_#`~[\]]/g, "").replace(/https?:\/\/\S+/g, "").trim();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.02;
      utterance.pitch = 1.05;
      utterance.lang = "en-US";

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Samantha") || v.name.includes("Google") || v.name.includes("Natural"))
      );
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => {
        setIsVoiceSpeaking(true);
      };
      utterance.onend = () => {
        setIsVoiceSpeaking(false);
        if (isVoiceChatActive && !isVoiceMuted) {
          startVoiceListening();
        }
      };
      utterance.onerror = () => {
        setIsVoiceSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setIsVoiceSpeaking(true);
      setTimeout(() => setIsVoiceSpeaking(false), 2400);
    }
  };

  // Start Speech Recognition
  const startVoiceListening = () => {
    if (typeof window === "undefined" || isVoiceMuted) return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsVoiceListening(true);
      };
      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) final += event.results[i][0].transcript;
          else interim += event.results[i][0].transcript;
        }
        const spoken = final || interim;
        setLiveVoiceTranscript(spoken);
        if (spoken.trim()) {
          setHasVoiceTranscribed(true);
        }

        if (final.trim()) {
          rec.stop();
          setLiveVoiceTranscript("");
          handleVoiceSubmit(final.trim());
        }
      };
      rec.onerror = () => {
        setIsVoiceListening(false);
      };
      rec.onend = () => {
        setIsVoiceListening(false);
      };
      recognitionRef.current = rec;
      rec.start();
    } catch (e) {
      setIsVoiceListening(false);
    }
  };

  // Stop Speech Recognition
  const stopVoiceListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsVoiceListening(false);
  };

  // Handle Voice Message Submission
  const handleVoiceSubmit = async (queryText: string) => {
    if (!queryText.trim()) return;
    setHasVoiceTranscribed(true);
    setLiveVoiceTranscript("");
    const reply = await handleSend(queryText);

    // Read Seiya's actual answer aloud.
    if (reply?.text) speakVoiceText(reply.text);
  };

  // Manage voice mode lifecycle
  useEffect(() => {
    if (!isVoiceChatActive) {
      stopVoiceListening();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsVoiceSpeaking(false);
      setIsVoiceListening(false);
      setLiveVoiceTranscript("");
    } else {
      if (!isVoiceMuted) {
        startVoiceListening();
      }
      if (mascotVideoRef.current) {
        mascotVideoRef.current.play().catch(() => {});
      }
    }
  }, [isVoiceChatActive, isVoiceMuted]);

  // Safe starters: questions only. Nothing here records or proposes a transaction.
  const quickPrompts = [
    { label: "Our balances", text: "How much is in our shared wallet and my personal wallet?" },
    { label: "Bills due", text: "Which bills are due this month?" },
    { label: "Budget check", text: "How is our budget doing this month?" },
    { label: "Log an expense", text: "I want to log a shared expense." },
    { label: "Plan a goal", text: "Help us plan savings for a shared goal." },
    { label: "Our rules", text: "What did we agree in Seiya's Promise?" },
    { label: "Money talk tips", text: "How can we talk about money without arguing?" },
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
            className="fixed inset-0 z-[45] bg-neutral-900/40 backdrop-blur-xs md:hidden"
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
                  title="Chats shared with your partner"
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
                  title="Chats only you can see"
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
                      ? "Start a shared chat, or share one of your private chats."
                      : "All your chats are shared with your partner."}
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
                                      title={ownsSession(session) ? "Shared with your partner" : `Shared with you by ${partnerName}`}
                                      className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[#B45529] bg-[#fbf0eb] px-1.5 py-0.5 rounded-full shrink-0 border border-[#B45529]/20"
                                    >
                                      <SolarIcon name="users-group-rounded" size={9} />
                                      <span>{ownsSession(session) ? "Shared" : `From ${partnerName}`}</span>
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

                            {/* Triple Dots Menu Button (only for chats you started) */}
                            {!isEditing && ownsSession(session) && (
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
                <span>Saved to your account</span>
              </span>
              <span className="font-mono text-[10px] text-[#808988]">
                {filteredSessions.length} {historyFilter === "all" ? "chats" : `${historyFilter} ${filteredSessions.length === 1 ? "chat" : "chats"}`}
              </span>
            </div>
          </aside>
        </>
      )}

      {/* 2. MAIN CHAT CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 h-full bg-[#f5eee1] text-[#2a2b2f] relative overflow-hidden">
        {/* Chat Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-[#d1c9bf]/30 bg-[#f5eee1] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {!showHistory && (
              <button
                onClick={() => setShowHistory(true)}
                className="p-1.5 rounded-lg bg-[#fef9ef] border border-[#d1c9bf]/40 text-[#515151] hover:text-[#B45529] transition-colors cursor-pointer shadow-2xs shrink-0"
                title="Open chat history"
              >
                <SolarIcon name="chat-round-dots" size={16} />
              </button>
            )}

            {/* Mascot Emblem with thinking eye animation */}
            <div className="w-9 h-9 rounded-full bg-[#fef9ef] border border-[#e5dcd0] flex items-center justify-center shrink-0 shadow-2xs">
              <SeiyaIcon size={24} isThinking={isProcessing || isVoiceSpeaking} />
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-serif font-normal text-[#2a2b2f] leading-tight truncate">
                {activeSession?.title || "New chat"}
              </h3>
              {isVoiceChatActive ? (
                <div className="flex items-center gap-1.5 text-[11px] text-[#B45529] font-medium mt-0.5 animate-in fade-in-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B45529] animate-ping" />
                  <span>{isVoiceSpeaking ? "Seiya is speaking..." : isVoiceListening ? `Listening to ${activeName}...` : "Voice Assistant Active"}</span>
                </div>
              ) : isProcessing ? (
                <div className="flex items-center gap-1.5 text-[11px] text-[#B45529] font-medium mt-0.5 animate-in fade-in-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#B45529] animate-ping" />
                  <span>{processingLabel ?? "Checking your rules and balances…"}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Share to Partner button for Personal chats */}
            {activeSession && !activeSession.isShared && ownsSession(activeSession) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleToggleShare(activeSession.id)}
                className={`h-7 px-2.5 rounded-full text-[11px] font-semibold gap-1 shadow-2xs ${isVoiceChatActive ? "text-[#B45529] border-[#B45529]/40 bg-[#1c1b1a] hover:bg-[#2a170f]" : "text-[#B45529] border-[#B45529]/30 hover:bg-[#B45529] hover:text-[#fef9ef]"}`}
                title={`Share this chat with ${partnerName}`}
              >
                <SolarIcon name="users-group-rounded" size={13} />
                <span className="hidden sm:inline">Share with {partnerName}</span>
                <span className="sm:hidden">Share</span>
              </Button>
            )}

            {activeSession && activeSession.isShared && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${isVoiceChatActive ? "text-[#78c282] bg-[#162519] border-[#2d5232]/50" : "text-[#2d5232] bg-[#edf3ec] border-[#2d5232]/20"}`}>
                <SolarIcon name="users-group-rounded" size={12} />
                <span className="hidden sm:inline">Shared with {partnerName}</span>
                <span className="sm:hidden">Shared</span>
              </span>
            )}

            <Badge variant="neutral">{reportingCurrency}</Badge>
          </div>
        </div>

        {/* Quick Prompts Bar (Hidden in voice mode for minimal clean focus) */}
        {!isVoiceChatActive && (
          <div className="px-4 py-2 bg-[#f5eee1] border-b border-[#d1c9bf]/20 overflow-x-auto whitespace-nowrap flex gap-2 no-scrollbar">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p.text)}
                className="px-3 py-1.5 sm:py-1 rounded-full bg-[#fef9ef] hover:text-[#B45529] hover:bg-[#ece3d3] text-xs sm:text-[11px] font-semibold text-[#333333] transition-all cursor-pointer shrink-0 shadow-2xs"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 ${isVoiceChatActive ? "pb-24 sm:pb-28" : ""}`}>
          {/* Neutral Condition (No active session selected yet): AI landing screen with suggestions */}
          {!activeSession && (
            <div
              className={`flex flex-col items-center justify-center text-center max-w-lg mx-auto transition-all duration-700 ease-in-out ${
                shouldHideLandingHero
                  ? "opacity-0 -translate-y-8 scale-95 max-h-0 overflow-hidden pointer-events-none py-0 mb-0"
                  : "opacity-100 translate-y-0 scale-100 max-h-[1400px] pointer-events-auto py-2 sm:py-12"
              }`}
            >
              <SeiyaVideoAvatar size={210} className="mb-2 max-sm:!w-[140px] max-sm:!h-[140px]" />
              <h2 className="text-[22px] sm:text-2xl leading-snug font-serif font-normal text-[#2a2b2f] mb-2">
                How can I help you today, {activeName}?
              </h2>
              <p className="text-xs sm:text-sm text-[#515151] leading-relaxed max-w-md mb-6">
                I&apos;m Seiya, the money co-pilot for the two of you. Ask about your spending, bills, or plans, and a new chat starts automatically.
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
                  <span>Private</span>
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

              {/* Starter prompts (questions only; nothing is recorded until you give an amount) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left">
                {[
                  { icon: "calendar", title: "Bills this month", text: "Which bills are due this month, and can we cover them?" },
                  { icon: "receipt", title: "Log an expense", text: "I want to log a shared expense." },
                  { icon: "chart", title: "Plan a savings goal", text: "Help us plan savings for a shared goal." },
                  { icon: "shield-check", title: "Our agreement", text: "What did we agree in Seiya's Promise?" },
                ].map((card) => (
                  <button
                    key={card.title}
                    onClick={() => handleSend(card.text)}
                    className="w-full text-left p-3 rounded-[14px] bg-[#fef9ef] hover:bg-[#fffdf9] border border-[#d1c9bf]/50 hover:border-[#B45529]/40 text-xs text-[#2a2b2f] shadow-2xs transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 font-semibold text-[#B45529] mb-1">
                      <SolarIcon name={card.icon as "calendar"} size={15} />
                      <span>{card.title}</span>
                    </div>
                    <span className="block text-xs sm:text-[11px] text-[#515151]">{card.text}</span>
                  </button>
                ))}
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
                  className={`p-3.5 rounded-[22px] text-[13px] sm:text-sm leading-relaxed transition-all ${
                    msg.sender === "user"
                      ? "bg-[#B45529] text-[#fef9ef] rounded-tr-xs shadow-xs"
                      : "bg-[#fef9ef] text-[#2a2b2f] rounded-tl-xs shadow-2xs border border-[#e5dcd0]/70"
                  }`}
                >
                  {msg.sender === "seiya" ? (
                    <RichText text={msg.text} />
                  ) : (
                    <p className="whitespace-pre-line">{msg.text}</p>
                  )}
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
                    reason={msg.cardData.income ? "Money added. Income never needs your partner's approval." : "Checked against your budget and Seiya's Promise."}
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

                {msg.cardType === "STATEMENT_PREVIEW" && msg.cardData && (
                  <StatementPreviewCard
                    fileName={msg.cardData.fileName}
                    transactions={msg.cardData.transactions}
                    locale={locale}
                    partnerName={partnerName}
                    defaultWallet={msg.cardData.defaultWallet}
                    onImport={(walletType) => importStatement(activeSessionId, msg.cardData.transactions, walletType)}
                  />
                )}

                {msg.cardType === "BILL_DRAFT" && Array.isArray(msg.cardData?.bills) &&
                  (msg.cardData.bills as BillDraft[]).map((bill, j) => (
                    <BillDraftCard key={`${msg.id}-bill-${j}`} draft={bill} onAdd={saveBillDraft} />
                  ))}

                {msg.cardType === "RECEIPT_DRAFT" && msg.cardData && (
                  <ReceiptDraftCard
                    receipt={msg.cardData}
                    fallbackCurrency={baseCurrency}
                    partnerName={partnerName}
                    defaultWallet={msg.cardData.defaultWallet}
                    onRecord={(draft) => recordReceipt(activeSessionId, draft)}
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
                <span className="font-medium text-[#2a2b2f]">{processingLabel ?? "Checking your rules and balances…"}</span>
              </div>
            </div>
          )}

          {/* Live Voice Speech Interim Bubble */}
          {liveVoiceTranscript && (
            <div className="flex gap-3 justify-end animate-in fade-in-0 duration-150">
              <div className="max-w-[85%] sm:max-w-xl items-end">
                <div className="p-3.5 rounded-[22px] text-xs sm:text-sm leading-relaxed bg-[#B45529] text-[#fef9ef] rounded-tr-xs shadow-xs flex items-center gap-2">
                  <span>{liveVoiceTranscript}</span>
                  <span className="w-2 h-2 rounded-full bg-[#fef9ef] animate-ping shrink-0" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Voice AI Orb with orb-ui Cloud Theme */}
        {isVoiceChatActive && (
          <div className="absolute bottom-[66px] sm:bottom-[78px] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center justify-center pointer-events-auto select-none animate-in fade-in-0 zoom-in-95 duration-300">
            <button
              type="button"
              onClick={() => setIsVoiceMuted(!isVoiceMuted)}
              className="relative flex items-center justify-center rounded-full transition-transform duration-300 active:scale-95 cursor-pointer focus:outline-none border-0 border-none outline-none ring-0 shadow-none appearance-none bg-transparent"
              style={{ border: "none", outline: "none", boxShadow: "none" }}
              title={
                isVoiceSpeaking
                  ? "Seiya is speaking..."
                  : isVoiceListening
                  ? isVoiceMuted
                    ? "Muted (tap to unmute)"
                    : `Listening to ${activeName}... (tap to mute)`
                  : isVoiceMuted
                  ? "Muted (tap to unmute)"
                  : "Voice active (tap to mute)"
              }
              aria-label="Cloud Voice Orb"
            >
              <Orb
                theme={orangeCloudTheme}
                signal={orbSignal}
                size={160}
                interactive={false}
                slotProps={{
                  root: {
                    className: "border-0 border-none outline-none ring-0 shadow-none",
                    style: { border: "none", outline: "none", boxShadow: "none" },
                  },
                  content: {
                    className: "overflow-hidden rounded-full border-0 border-none outline-none ring-0 shadow-none",
                    style: {
                      border: "none",
                      outline: "none",
                      boxShadow: "none",
                      overflow: "hidden",
                      borderRadius: "50%",
                      WebkitMaskImage: "-webkit-radial-gradient(white, black)",
                    },
                  },
                  surface: {
                    className: "border-0 border-none outline-none ring-0 shadow-none",
                    style: {
                      border: "none",
                      outline: "none",
                      boxShadow: "none",
                      clipPath: "circle(49% at 50% 50%)",
                      WebkitClipPath: "circle(49% at 50% 50%)",
                    },
                  },
                }}
                className="border-0 border-none outline-none ring-0 shadow-none"
              />
              {isVoiceMuted && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-[#1c1b1a]/85 text-white rounded-full backdrop-blur-xs border border-white/20 shadow-sm">
                    Muted
                  </span>
                </div>
              )}
            </button>
          </div>
        )}

        {/* Bottom Dock: Smooth Morphing Between Standard Chat Input and Voice Controls */}
        <div className="p-2.5 sm:p-4 bg-[#f5eee1] border-t border-[#d1c9bf]/30 flex items-center justify-between gap-2 sm:gap-3 z-30 transition-all duration-500 ease-in-out relative min-h-[58px] sm:min-h-[64px]">
          {/* 1. Standard Chat Input (Smoothly transitions out and hides when Voice Chat is active) */}
          <div
            className={`w-full flex items-center gap-1.5 sm:gap-2 transition-all duration-500 ease-in-out ${
              isVoiceChatActive
                ? "opacity-0 -translate-y-2 pointer-events-none absolute inset-x-2.5 sm:inset-x-4 invisible"
                : "opacity-100 translate-y-0 relative visible"
            }`}
          >
            {/* Attachments: 📎 bank statement, 🖼 receipt photo */}
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              <input
                ref={statementInputRef}
                type="file"
                accept=".pdf,.csv,.xlsx,.xls,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) stageAttachment(file, "statement");
                }}
              />
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*,application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) stageAttachment(file, "receipt");
                }}
              />
              <button
                type="button"
                onClick={() => statementInputRef.current?.click()}
                disabled={isProcessing || !householdId}
                className="p-1.5 sm:p-2 rounded-full text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Import a bank statement (PDF, Excel or CSV)"
                aria-label="Import a bank statement"
              >
                <SolarIcon name="paperclip" size={17} />
              </button>
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={isProcessing || !householdId}
                className="p-1.5 sm:p-2 rounded-full text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Scan a receipt (photo or PDF)"
                aria-label="Scan a receipt photo"
              >
                <SolarIcon name="image" size={17} />
              </button>
            </div>

            {/* Chat Textformfield */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pendingAttachment) void sendAttachment(inputText);
                else handleSend();
              }}
              className="flex-1 min-w-0 flex flex-col gap-1.5"
            >
              {pendingAttachment && (
                <div className="flex items-center gap-2 self-start max-w-full pl-1.5 pr-1 py-1 rounded-[14px] bg-white border border-[#e5dcd0] shadow-2xs">
                  {pendingAttachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pendingAttachment.previewUrl} alt="" className="w-9 h-9 rounded-[8px] object-cover shrink-0" />
                  ) : (
                    <span className="w-9 h-9 rounded-[8px] bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0">
                      <SolarIcon name={isPdfFile(pendingAttachment.file) || isSheetFile(pendingAttachment.file) ? "paperclip" : "image"} size={16} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[11px] sm:text-xs font-semibold text-[#2a2b2f] max-w-[180px] sm:max-w-[280px]">
                      {pendingAttachment.file.name}
                    </span>
                    <span className="block text-[10px] text-[#808988]">
                      {isImageFile(pendingAttachment.file) ? "Receipt photo" : isSheetFile(pendingAttachment.file) ? "Bank statement" : "PDF"} ·{" "}
                      {(pendingAttachment.file.size / 1024 < 1024
                        ? `${Math.max(1, Math.round(pendingAttachment.file.size / 1024))} KB`
                        : `${(pendingAttachment.file.size / 1024 / 1024).toFixed(1)} MB`)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={clearAttachment}
                    className="p-1 rounded-full text-[#808988] hover:text-[#a34426] hover:bg-[#f5eee1] cursor-pointer"
                    aria-label="Remove attachment"
                    title="Remove"
                  >
                    <SolarIcon name="close-circle" size={16} />
                  </button>
                </div>
              )}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={Boolean(activeSession) && !ownsSession(activeSession)}
                placeholder={
                  activeSession && !ownsSession(activeSession)
                    ? `Shared by ${partnerName} · start a new chat to reply`
                    : pendingAttachment
                    ? "Add a note (optional), then press Send"
                    : "Message Seiya…"
                }
                className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-[#fef9ef] border border-[#d1c9bf] text-xs sm:text-sm text-[#2a2b2f] placeholder-[#808988] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20 transition-all shadow-2xs"
              />
            </form>

            {/* Unified Dynamic Voice Chat & Send Action Button (sends text and/or the attachment) */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                if (pendingAttachment) {
                  void sendAttachment(inputText);
                } else if (inputText.trim()) {
                  handleSend();
                } else {
                  setIsVoiceChatActive(true);
                }
              }}
              className={`h-9 sm:h-10 shrink-0 flex items-center justify-center transition-all duration-300 ease-in-out cursor-pointer group select-none ${
                hasComposerContent
                  ? "px-3.5 sm:px-5 rounded-[40px] bg-[#B45529] hover:bg-[#9a451e] border border-transparent text-[#fef9ef] shadow-xs active:scale-95"
                  : "w-9 sm:w-10 px-0 rounded-full bg-[#fbf0eb] hover:bg-[#f6e1d7] border border-[#B45529]/35 text-[#B45529] shadow-2xs hover:shadow-xs active:scale-95"
              }`}
              title={hasComposerContent ? "Send message" : "Start Voice Chat with Seiya"}
              aria-label={hasComposerContent ? "Send message" : "Start Voice Chat with Seiya"}
            >
              <div className="relative flex items-center justify-center">
                <span
                  className={`flex items-center justify-center transition-all duration-300 ease-in-out ${
                    hasComposerContent
                      ? "opacity-0 scale-50 max-w-0 overflow-hidden pointer-events-none"
                      : "opacity-100 scale-100 max-w-[40px]"
                  }`}
                >
                  <SolarIcon
                    name="soundwave"
                    size={18}
                    className="text-[#B45529] group-hover:scale-110 transition-transform"
                  />
                </span>
                <span
                  className={`flex items-center gap-1.5 transition-all duration-300 ease-in-out overflow-hidden ${
                    hasComposerContent
                      ? "opacity-100 scale-100 max-w-[100px]"
                      : "opacity-0 scale-50 max-w-0 pointer-events-none"
                  }`}
                >
                  <SolarIcon name="paper-plane" size={15} className="text-[#fef9ef] shrink-0" />
                  <span className="hidden sm:inline font-bold text-xs sm:text-sm text-[#fef9ef] whitespace-nowrap">
                    Send
                  </span>
                </span>
              </div>
            </button>
          </div>

          {/* 2. Voice Chat Controls (Centered Mute & End Voice buttons with smooth transitions) */}
          <div
            className={`w-full flex items-center justify-center gap-4 sm:gap-6 transition-all duration-500 ease-in-out ${
              isVoiceChatActive
                ? "opacity-100 translate-y-0 relative visible"
                : "opacity-0 translate-y-2 pointer-events-none absolute inset-x-2.5 sm:inset-x-4 invisible"
            }`}
          >
            {/* Mic Mute / Unmute Button (Slightly larger with smooth transitions) */}
            <button
              type="button"
              onClick={() => setIsVoiceMuted(!isVoiceMuted)}
              className={`w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center transition-all duration-300 ease-out cursor-pointer active:scale-90 hover:scale-105 shadow-xs hover:shadow-md shrink-0 ${
                isVoiceMuted
                  ? "bg-[#fbf0eb] text-[#ba3c2a] border border-[#ba3c2a]/40 hover:bg-[#f6e1d7] ring-2 ring-[#ba3c2a]/20"
                  : "bg-[#fef9ef] text-[#2a2b2f] border border-[#d1c9bf] hover:border-[#B45529]/40 hover:bg-[#f7efe3] hover:text-[#B45529]"
              }`}
              title={isVoiceMuted ? "Unmute microphone" : "Mute microphone"}
              aria-label={isVoiceMuted ? "Unmute microphone" : "Mute microphone"}
            >
              <SolarIcon
                name={isVoiceMuted ? "microphone-slash" : "microphone"}
                size={22}
                className="transition-transform duration-200"
              />
            </button>

            {/* End / Exit Voice Mode Button (Slightly larger with smooth transitions) */}
            <button
              type="button"
              onClick={() => {
                setIsVoiceChatActive(false);
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
              }}
              className="w-12 h-12 sm:w-13 sm:h-13 rounded-full bg-[#fef9ef] hover:bg-[#fdf2f0] border border-[#d1c9bf] hover:border-[#ba3c2a]/40 text-[#71717a] hover:text-[#ba3c2a] flex items-center justify-center transition-all duration-300 ease-out shadow-xs hover:shadow-md cursor-pointer active:scale-90 hover:scale-105 group shrink-0"
              title="End Voice Chat"
              aria-label="End Voice Chat"
            >
              <SolarIcon
                name="close-circle"
                size={22}
                className="group-hover:rotate-90 transition-transform duration-300"
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
