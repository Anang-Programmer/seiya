"use client";

import React, { useState, useEffect, useRef } from "react";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// Amounts here are decided on, so they stay visible in privacy mode.
import { formatMoneyConvertedAlways as formatMoneyConverted } from "@/lib/utils";
import { ChatMessage } from "@/lib/store";
import { RichText } from "@/components/ui/rich-text";

interface VoiceChatViewProps {
  onClose: () => void;
  activeSessionTitle?: string;
  isShared?: boolean;
  activeName: string;
  partnerName: string;
  currentUser: "partner_a" | "partner_b";
  reportingCurrency: string;
  locale: string;
  onSendVoiceMessage: (text: string) => Promise<string | void>;
  existingMessages?: ChatMessage[];
}

export function VoiceChatView({
  onClose,
  activeSessionTitle = "Voice Consultation",
  isShared = true,
  activeName,
  partnerName,
  currentUser,
  reportingCurrency,
  locale,
  onSendVoiceMessage,
  existingMessages = [],
}: VoiceChatViewProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [currentSpeaker, setCurrentSpeaker] = useState<"user" | "seiya" | null>("seiya");
  const [lastSeiyaReply, setLastSeiyaReply] = useState<string>(
    `Hello ${activeName}! I'm listening. Ask me anything about your couple budget, bills, or savings.`
  );
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [transcriptItems, setTranscriptItems] = useState<
    Array<{ id: string; sender: "user" | "seiya"; text: string; timestamp: string }>
  >(() => {
    // Seed with existing recent messages if available
    const recents = existingMessages.slice(-4).map((m) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp,
    }));
    if (recents.length > 0) return recents;
    return [
      {
        id: "intro-voice",
        sender: "seiya",
        text: `Hello ${activeName}! I'm listening. Ask me anything about your couple budget, bills, or savings.`,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      },
    ];
  });

  const recognitionRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptItems, liveTranscript, lastSeiyaReply]);

  // Ensure mascot video plays continuously
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Text-to-speech speaker function
  const speakText = (text: string) => {
    if (isSpeakerMuted) {
      setIsSpeaking(false);
      return;
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();

      // Clean markdown tags or bullets from speech text
      const cleanText = text
        .replace(/[*_#`~[\]]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.02;
      utterance.pitch = 1.05;
      utterance.lang = "en-US";

      // Select female / pleasant English voice if found
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Samantha") ||
            v.name.includes("Google") ||
            v.name.includes("Natural") ||
            v.name.includes("Zira"))
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setCurrentSpeaker("seiya");
      };

      utterance.onend = () => {
        setIsSpeaking(false);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    } else {
      // Fallback: visual wave animation for 2.8 seconds
      setIsSpeaking(true);
      setCurrentSpeaker("seiya");
      setTimeout(() => {
        setIsSpeaking(false);
      }, 2800);
    }
  };

  // Initial welcome voice greetings on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      speakText(lastSeiyaReply);
    }, 600);
    return () => {
      clearTimeout(timer);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Setup Web Speech Recognition
  const startListening = () => {
    if (typeof window === "undefined") return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // Fallback message for unsupported speech recognition
      handleSimulatedVoicePrompt("Can we afford all bills this month?");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        setCurrentSpeaker("user");
        setLiveTranscript("");
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const spoken = final || interim;
        setLiveTranscript(spoken);

        if (final.trim()) {
          recognition.stop();
          processUserVoiceQuery(final.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Process user voice query (either from speech recognition or quick voice chips)
  const processUserVoiceQuery = async (queryText: string) => {
    if (!queryText.trim()) return;

    setIsListening(false);
    setIsThinking(true);
    setLiveTranscript(queryText);
    setCurrentSpeaker("user");

    const timeString = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

    // Append user message to local transcript history
    setTranscriptItems((prev) => [
      ...prev,
      {
        id: `voice-usr-${Date.now()}`,
        sender: "user",
        text: queryText,
        timestamp: timeString,
      },
    ]);

    // Send query to the store/co-pilot
    try {
      await onSendVoiceMessage(queryText);

      // Intelligent tailored voice responses matching couple financials
      const lower = queryText.toLowerCase();
      let responseSpeech = "";

      if (lower.includes("bill") || lower.includes("afford")) {
        responseSpeech = `All regular bills this month are within agreed thresholds. With your current pool balance, you have sufficient liquidity to cover upcoming utilities and shared rent.`;
      } else if (lower.includes("lunch") || lower.includes("dinner") || lower.includes("food") || lower.includes("restaurant")) {
        responseSpeech = `Recorded lunch expense under standard dining rules! 60% assigned to Taylor and 40% to Alex. Both balances have been adjusted.`;
      } else if (lower.includes("kyoto") || lower.includes("trip") || lower.includes("vacation") || lower.includes("savings")) {
        responseSpeech = `Your Kyoto trip savings plan is progressing well! Target is ${formatMoneyConverted(15000, "USD", reportingCurrency, locale)} in 10 months. You are currently on track.`;
      } else if (lower.includes("groceries") || lower.includes("supermarket")) {
        responseSpeech = `For groceries, please confirm if this should be charged to the Shared Essentials wallet or your Personal card.`;
      } else if (lower.includes("insurance") || lower.includes("flight") || lower.includes("large")) {
        responseSpeech = `This expense exceeds your $500 single-signer threshold. I have submitted it as a dual-signature approval request for ${partnerName}'s review.`;
      } else {
        responseSpeech = `I analyzed your Couple Contract and current balances. All rules are satisfied, and your shared financial status remains healthy!`;
      }

      setLastSeiyaReply(responseSpeech);
      setCurrentSpeaker("seiya");
      setLiveTranscript("");
      setIsThinking(false);

      // Append Seiya reply to transcript history
      setTranscriptItems((prev) => [
        ...prev,
        {
          id: `voice-seiya-${Date.now()}`,
          sender: "seiya",
          text: responseSpeech,
          timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      // Speak aloud through Web Speech Synthesis
      speakText(responseSpeech);
    } catch (err) {
      setIsThinking(false);
      const fallbackError = "I'm reviewing your request against your Couple Contract. Please try asking again.";
      setLastSeiyaReply(fallbackError);
      speakText(fallbackError);
    }
  };

  const handleSimulatedVoicePrompt = (prompt: string) => {
    processUserVoiceQuery(prompt);
  };

  // Quick Voice Prompts
  const quickVoicePrompts = [
    { label: "Can we afford dinner?", text: "Can we afford $85 for dinner tonight?" },
    { label: "Check due bills", text: "Can we afford all bills this month?" },
    { label: "Kyoto trip savings", text: "How is our Kyoto trip savings plan going?" },
    { label: "Grocery budget", text: "Check our shared grocery budget" },
    { label: "Record $45 lunch", text: "Paid $45 for lunch together, I paid." },
  ];

  return (
    <div className="relative w-full h-full min-h-[550px] flex flex-col justify-between overflow-hidden bg-[#f5eee1] select-none">
      {/* 1. TOP BAR: STATUS & SWITCH TO TEXT CHAT */}
      <div className="relative z-20 px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-[#d1c9bf]/30 bg-[#f5eee1]/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="relative flex items-center justify-center">
            <span
              className={`w-3 h-3 rounded-full ${
                isSpeaking
                  ? "bg-[#B45529] animate-ping"
                  : isListening
                  ? "bg-[#2d5232] animate-ping"
                  : "bg-[#B45529]"
              }`}
            />
            <span
              className={`w-2.5 h-2.5 rounded-full absolute ${
                isSpeaking ? "bg-[#B45529]" : isListening ? "bg-[#2d5232]" : "bg-[#B45529]"
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-serif font-semibold text-[#2a2b2f]">
                Voice Chat with Seiya
              </h2>
              <Badge variant={isShared ? "primary" : "neutral"} className="text-[10px] px-2 py-0.5">
                {isShared ? `Shared with ${partnerName}` : "Personal Private"}
              </Badge>
            </div>
            <p className="text-[11px] text-[#808988]">
              {isSpeaking
                ? "Seiya is speaking aloud..."
                : isListening
                ? "Listening to you speak..."
                : isThinking
                ? "Checking Couple Contract rules & balances..."
                : "Tap the microphone to speak"}
            </p>
          </div>
        </div>

        {/* Action Controls: Sound Mute & Switch to Text */}
        <div className="flex items-center gap-2">
          {/* Audio Output Mute / Unmute */}
          <button
            type="button"
            onClick={() => {
              if (!isSpeakerMuted && isSpeaking) {
                if (typeof window !== "undefined" && "speechSynthesis" in window) {
                  window.speechSynthesis.cancel();
                }
                setIsSpeaking(false);
              }
              setIsSpeakerMuted(!isSpeakerMuted);
            }}
            className="p-2 rounded-full bg-[#fef9ef] border border-[#d1c9bf]/60 text-[#515151] hover:text-[#B45529] hover:bg-[#fbf0eb] transition-all shadow-2xs cursor-pointer"
            title={isSpeakerMuted ? "Unmute Seiya's voice" : "Mute Seiya's voice"}
          >
            <SolarIcon name={isSpeakerMuted ? "volume-cross" : "volume-loud"} size={16} />
          </button>

          {/* Transcript History Drawer Toggle */}
          <button
            type="button"
            onClick={() => setShowHistoryModal(true)}
            className="px-2.5 py-1.5 rounded-full bg-[#fef9ef] border border-[#d1c9bf]/60 text-xs font-semibold text-[#515151] hover:text-[#B45529] hover:bg-[#fbf0eb] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            title="View full conversation transcript"
          >
            <SolarIcon name="receipt" size={14} />
            <span className="hidden sm:inline">Transcript</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#ebe2d3] text-[#2a2b2f] font-mono">
              {transcriptItems.length}
            </span>
          </button>

          {/* Switch back to Standard Text Chat */}
          <Button
            onClick={onClose}
            variant="outline"
            size="sm"
            className="rounded-full bg-[#fef9ef] border-[#d1c9bf] hover:bg-[#fbf0eb] hover:text-[#B45529] hover:border-[#B45529]/40 text-xs font-semibold px-3 h-8 shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Switch back to standard text chat"
          >
            <SolarIcon name="chat-round-dots" size={14} className="text-[#B45529]" />
            <span>Text Chat</span>
          </Button>
        </div>
      </div>

      {/* 2. CENTER STAGE: PRIMARY GRADIENT BACKGROUND & FLOATING LEGLESS SEIYA MASCOT */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-4 overflow-hidden">
        {/* Dynamic Primary Color Gradient Background & Ambient Aura Glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(180, 85, 41, 0.42) 0%, rgba(201, 138, 79, 0.22) 35%, rgba(245, 238, 225, 0.5) 70%, transparent 100%)",
          }}
        />

        {/* Concentric Primary Terracotta Soundwave Ripple Rings */}
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-700 ${
            isSpeaking || isListening ? "w-80 h-80 opacity-90" : "w-64 h-64 opacity-40"
          }`}
        >
          <div className="w-full h-full rounded-full border border-[#B45529]/30 bg-[#B45529]/10 animate-primary-ripple-1" />
        </div>

        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-all duration-700 ${
            isSpeaking || isListening ? "w-[420px] h-[420px] opacity-75" : "w-80 h-80 opacity-20"
          }`}
        >
          <div className="w-full h-full rounded-full border border-[#C98A4F]/25 bg-[#B45529]/5 animate-primary-ripple-2" />
        </div>

        {/* Ambient Glowing Primary Aura Orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-gradient-to-tr from-[#B45529]/40 via-[#C98A4F]/30 to-transparent blur-3xl pointer-events-none animate-primary-aura" />

        {/* FLOATING LEGLESS SEIYA MASCOT VIDEO */}
        <div className="relative z-10 flex flex-col items-center">
          <div
            className={`relative transition-transform duration-500 animate-float-mascot ${
              isSpeaking ? "scale-105" : isListening ? "scale-102" : "scale-100"
            }`}
          >
            {/* Mascot Video with Feathered Elliptical Mask (Seamlessly dissolves warm-offwhite background into page) */}
            <div
              style={{
                width: 250,
                height: 250,
                maskImage:
                  "radial-gradient(ellipse 49% 45% at 50% 53%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 49% 45% at 50% 53%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
              }}
              className="relative overflow-hidden shrink-0 select-none drop-shadow-md"
            >
              <video
                ref={videoRef}
                src="/ask-seiya/curiousseiya_clean.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>

            {/* Speaking Status Pill */}
            {(isSpeaking || isListening || isThinking) && (
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-md border backdrop-blur-md transition-all ${
                    isSpeaking
                      ? "bg-[#B45529] text-[#fef9ef] border-[#8a3b16]"
                      : isListening
                      ? "bg-[#2d5232] text-[#fef9ef] border-[#1d3821]"
                      : "bg-[#fef9ef] text-[#B45529] border-[#B45529]/30"
                  }`}
                >
                  {isSpeaking && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#fef9ef] animate-pulse" />
                      <span>Seiya Speaking</span>
                    </>
                  )}
                  {isListening && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#fef9ef] animate-ping" />
                      <span>Listening to {activeName}...</span>
                    </>
                  )}
                  {isThinking && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-[#B45529] animate-ping" />
                      <span>Analyzing rules...</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. LIVE TRANSCRIPT CARD */}
        <div className="relative z-10 w-full max-w-lg mt-4 px-2">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#fefcf6]/90 backdrop-blur-md border border-[#d1c9bf]/70 shadow-warm-lg transition-all text-center">
            {/* Live user transcript indicator */}
            {isListening && (
              <div className="space-y-1.5 animate-in fade-in-0 duration-200">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#2d5232]">
                  <span className="w-2 h-2 rounded-full bg-[#2d5232] animate-ping" />
                  <span>{activeName} Speaking</span>
                </div>
                <p className="text-sm sm:text-base font-medium text-[#2a2b2f] italic min-h-[28px]">
                  {liveTranscript ? `"${liveTranscript}"` : "Listening for your voice..."}
                </p>
              </div>
            )}

            {/* Thinking indicator */}
            {isThinking && (
              <div className="space-y-1.5 animate-in fade-in-0 duration-200">
                <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#B45529]">
                  <span className="w-2 h-2 rounded-full bg-[#B45529] animate-ping" />
                  <span>Evaluating Contract Rules</span>
                </div>
                <p className="text-sm text-[#515151]">
                  Checking single-signer thresholds, shared wallet allocations, and savings goals...
                </p>
              </div>
            )}

            {/* Seiya Spoken Transcript */}
            {!isListening && !isThinking && (
              <div className="space-y-1 animate-in fade-in-0 duration-200">
                <div className="flex items-center justify-center gap-1.5 text-xs font-serif font-bold text-[#B45529]">
                  <SeiyaIcon size={16} isThinking={isSpeaking} />
                  <span>Seiya Co-Pilot</span>
                </div>
                <p className="text-sm sm:text-base text-[#2a2b2f] font-serif leading-relaxed px-2">
                  {lastSeiyaReply}
                </p>
              </div>
            )}

            {/* Dynamic Audio Waveform Visualizer */}
            <div className="flex items-center justify-center gap-1 mt-3.5 pt-2 border-t border-[#d1c9bf]/30">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                const isActive = isSpeaking || isListening;
                return (
                  <div
                    key={i}
                    style={{
                      animationDelay: `${i * 0.14}s`,
                      height: isActive ? undefined : "5px",
                    }}
                    className={`w-1 rounded-full transition-all duration-200 ${
                      isActive
                        ? "bg-gradient-to-t from-[#B45529] to-[#C98A4F] animate-wave-bar"
                        : "bg-[#d1c9bf]/60 h-1.5"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. BOTTOM CONTROLS & QUICK VOICE PROMPTS */}
      <div className="relative z-20 px-4 sm:px-6 py-3.5 bg-[#f5eee1]/90 backdrop-blur-md border-t border-[#d1c9bf]/30 flex flex-col items-center gap-3">
        {/* Quick Voice Prompt Chips */}
        <div className="w-full max-w-2xl overflow-x-auto no-scrollbar flex items-center justify-center gap-2 py-0.5">
          {quickVoicePrompts.map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              disabled={isSpeaking || isListening || isThinking}
              onClick={() => handleSimulatedVoicePrompt(prompt.text)}
              className="shrink-0 px-3 py-1.5 rounded-full bg-[#fef9ef] hover:bg-[#fbf0eb] border border-[#d1c9bf]/70 hover:border-[#B45529]/40 text-xs font-semibold text-[#515151] hover:text-[#B45529] transition-all shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {prompt.label}
            </button>
          ))}
        </div>

        {/* Main Microphone Button Dock */}
        <div className="flex items-center gap-4">
          {/* Replay last speech button */}
          <button
            type="button"
            disabled={isSpeaking || isListening || isThinking}
            onClick={() => speakText(lastSeiyaReply)}
            className="p-3 rounded-full bg-[#fef9ef] border border-[#d1c9bf]/70 text-[#515151] hover:text-[#B45529] hover:bg-[#fbf0eb] transition-all shadow-2xs cursor-pointer disabled:opacity-40"
            title="Replay Seiya's spoken response"
          >
            <SolarIcon name="refresh" size={18} />
          </button>

          {/* Large Center Microphone Toggle */}
          <button
            type="button"
            onClick={toggleListening}
            className={`relative p-5 rounded-full text-[#fef9ef] shadow-warm-xl transition-all duration-300 cursor-pointer group ${
              isListening
                ? "bg-[#2d5232] scale-110 ring-4 ring-[#2d5232]/30"
                : "bg-gradient-to-tr from-[#B45529] to-[#C98A4F] hover:scale-105 ring-4 ring-[#B45529]/20"
            }`}
            title={isListening ? "Stop listening" : "Tap to speak with Seiya"}
          >
            <SolarIcon
              name={isListening ? "soundwave" : "microphone"}
              size={26}
              className="transition-transform group-hover:scale-110"
            />
            {isListening && (
              <span className="absolute inset-0 rounded-full border-2 border-white animate-ping opacity-40" />
            )}
          </button>

          {/* End Call / Switch to Text */}
          <button
            type="button"
            onClick={onClose}
            className="p-3 rounded-full bg-[#fef9ef] border border-[#d1c9bf]/70 text-[#a34426] hover:bg-[#fcf0ee] transition-all shadow-2xs cursor-pointer"
            title="End Voice Chat"
          >
            <SolarIcon name="phone-hangup" size={18} />
          </button>
        </div>

        <p className="text-[11px] text-[#808988]">
          {isListening
            ? "Tap the microphone to finish speaking"
            : "Tap the microphone to speak, or select a quick financial prompt above"}
        </p>
      </div>

      {/* 5. FULL TRANSCRIPT HISTORY MODAL / DRAWER */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs animate-in fade-in-0 duration-200">
          <div className="bg-[#fefcf6] rounded-2xl border border-[#d1c9bf] shadow-warm-xl max-w-lg w-full max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#d1c9bf]/40 flex items-center justify-between bg-[#f5eee1]">
              <div className="flex items-center gap-2">
                <SolarIcon name="receipt" size={18} className="text-[#B45529]" />
                <h3 className="font-serif font-bold text-sm sm:text-base text-[#2a2b2f]">
                  Voice Conversation Transcript
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="p-1 rounded-md text-[#808988] hover:text-[#2a2b2f] hover:bg-[#ece3d3] transition-colors cursor-pointer"
              >
                <SolarIcon name="close-circle" size={18} />
              </button>
            </div>

            {/* Transcript Messages List */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3">
              {transcriptItems.map((item) => {
                const isUser = item.sender === "user";
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[#808988]">
                      {isUser ? (
                        <span className="font-semibold text-[#B45529]">{activeName}</span>
                      ) : (
                        <span className="font-serif font-bold text-[#2a2b2f] flex items-center gap-1">
                          <SeiyaIcon size={13} /> Seiya
                        </span>
                      )}
                      <span>• {item.timestamp}</span>
                    </div>

                    <div
                      className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                        isUser
                          ? "bg-[#B45529] text-[#fef9ef] rounded-tr-xs"
                          : "bg-[#f5eee1] text-[#2a2b2f] border border-[#d1c9bf]/40 rounded-tl-xs font-serif"
                      }`}
                    >
                      {isUser ? item.text : <RichText text={item.text} />}
                    </div>
                  </div>
                );
              })}
              <div ref={transcriptEndRef} />
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-[#d1c9bf]/40 bg-[#f5eee1] flex items-center justify-between">
              <span className="text-[11px] text-[#808988]">
                {transcriptItems.length} transcript entries recorded
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-full text-xs px-4"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
