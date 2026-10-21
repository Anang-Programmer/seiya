"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SolarIcon, type SolarIconName } from "@/components/icons/solar";
import { SeiyaLogo, SeiyaIcon } from "@/components/icons/seiya-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthView, AuthMode } from "./auth-view";

interface LandingViewProps {
  onEnterApp: () => void;
}

// ---------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  );
}

// Adds `is-in` to every `.lp-reveal` under the root once it scrolls into view.
// The CSS keeps these visible under reduced motion, so nothing hides content.
function useReveal(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(".lp-reveal"));
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef]);
}

const delay = (ms: number) => ({ "--lp-delay": `${ms}ms` }) as React.CSSProperties;

// ---------------------------------------------------------------------------
// Ask Seiya demo: scripted conversations that mirror real app flows
// ---------------------------------------------------------------------------

type SceneId = "expense" | "receipt" | "statement" | "bill" | "hold";

interface Scene {
  id: SceneId;
  chip: string;
  icon: SolarIconName;
  time: string;
  user: { text?: string; file?: { name: string; meta: string; icon: SolarIconName } };
  reply: string;
  bubble: string;
}

const SCENES: Scene[] = [
  {
    id: "expense",
    chip: "Log an expense",
    icon: "cup",
    time: "12:41",
    user: { text: "bakso 35rb tadi siang, pakai dompet bersama" },
    reply: "Siap! Rp35.000 untuk makan siang sudah dicatat di dompet bersama.",
    bubble: "Logged. In Bahasa, too.",
  },
  {
    id: "receipt",
    chip: "Read a receipt",
    icon: "camera",
    time: "18:05",
    user: {
      text: "groceries for the week",
      file: { name: "receipt.jpg", meta: "Photo", icon: "image" },
    },
    reply: "I read your receipt on this device. Check the total before I save it.",
    bubble: "Receipt read, nothing typed.",
  },
  {
    id: "statement",
    chip: "Import a statement",
    icon: "paperclip",
    time: "20:12",
    user: { file: { name: "statement-october.pdf", meta: "PDF · 3 pages", icon: "paperclip" } },
    reply: "I found 24 transactions. Choose the wallet to import them into. Nothing is saved until you confirm.",
    bubble: "24 transactions found.",
  },
  {
    id: "bill",
    chip: "Draft a bill",
    icon: "calendar",
    time: "21:30",
    user: { text: "Add our electricity bill, 450k every 5th" },
    reply: "Here's a bill draft for your shared wallet. Want me to add it?",
    bubble: "Bill drafted for you both.",
  },
  {
    id: "hold",
    chip: "Late-night big buy",
    icon: "clock-circle",
    time: "23:40",
    user: { text: "Buy the 55\" TV for 8 juta from shared" },
    reply:
      "That's above your Rp5.000.000 limit and it's after 22:00. As you both agreed, it waits until 08:00 and needs Dina's PIN.",
    bubble: "Rules first. Sleep on it.",
  },
];

const SCENE_HOLD_MS = 7000;

function ResultShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[#eadfcd] bg-white/90 p-3.5 shadow-[0_8px_24px_-16px_rgba(59,29,23,0.35)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function StatusPill({ tone = "ok", children }: { tone?: "ok" | "hold" | "draft"; children: React.ReactNode }) {
  const tones = {
    ok: "bg-[#4d7c5a]/10 text-[#3f6a4b]",
    hold: "bg-[#C98A4F]/15 text-[#8a5524]",
    draft: "bg-[#B45529]/10 text-[#B45529]",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold font-jakarta", tones)}>
      {children}
    </span>
  );
}

function MiniButton({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[11px] font-semibold font-jakarta",
        primary ? "bg-[#B45529] text-[#fef9ef]" : "border border-[#e3d6c2] text-[#3B1D17]"
      )}
    >
      {children}
    </span>
  );
}

function SceneResult({ id }: { id: SceneId }) {
  switch (id) {
    case "expense":
      return (
        <ResultShell>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C98A4F]/15 text-[#B45529]">
              <SolarIcon name="cup" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#2a2b2f]">Lunch · Bakso</p>
              <p className="truncate text-[11px] text-[#808988]">Food · Shared wallet · Today</p>
            </div>
            <p className="font-numeric text-[14px] font-semibold text-[#2a2b2f]">Rp35.000</p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-[#eadfcd] pt-2.5">
            <StatusPill>
              <SolarIcon name="check" size={11} /> Logged
            </StatusPill>
            <span className="text-[10.5px] text-[#808988]">Visible to both of you</span>
          </div>
        </ResultShell>
      );
    case "receipt":
      return (
        <ResultShell>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#2a2b2f]">Green Basket Market</p>
            <StatusPill tone="draft">
              <SolarIcon name="lock-keyhole" size={11} /> Read on device
            </StatusPill>
          </div>
          <ul className="mt-2 space-y-1 text-[11.5px] text-[#515151]">
            {[
              ["Milk 1L × 2", "¥18.50"],
              ["Eggs (10)", "¥22.00"],
              ["Rice 5 kg", "¥59.90"],
            ].map(([item, price]) => (
              <li key={item} className="flex justify-between">
                <span>{item}</span>
                <span className="font-numeric">{price}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-dashed border-[#eadfcd] pt-2">
            <span className="text-[11px] text-[#808988]">Total · CNY</span>
            <span className="font-numeric text-[14px] font-semibold text-[#2a2b2f]">¥100.40</span>
          </div>
          <div className="mt-2.5 flex gap-2">
            <MiniButton primary>Save to Personal</MiniButton>
            <MiniButton>Edit</MiniButton>
          </div>
        </ResultShell>
      );
    case "statement":
      return (
        <ResultShell>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#2a2b2f]">statement-october.pdf</p>
            <StatusPill tone="draft">Preview</StatusPill>
          </div>
          <ul className="mt-2 space-y-1.5 text-[11.5px]">
            {[
              ["Oct 02", "Salary", "+Rp15.000.000", true],
              ["Oct 03", "Grab ride", "Rp42.000", false],
              ["Oct 03", "Indomaret", "Rp87.500", false],
            ].map(([date, label, amount, income]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <span className="w-11 shrink-0 text-[#808988]">{date}</span>
                <span className="flex-1 truncate text-[#2a2b2f]">{label}</span>
                <span className={cn("font-numeric", income ? "text-[#3f6a4b]" : "text-[#2a2b2f]")}>{amount}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10.5px] text-[#808988]">+ 21 more</p>
          <div className="mt-2.5 flex gap-2">
            <MiniButton primary>Import 24 → Personal</MiniButton>
            <MiniButton>Review</MiniButton>
          </div>
        </ResultShell>
      );
    case "bill":
      return (
        <ResultShell>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B45529]/10 text-[#B45529]">
              <SolarIcon name="bolt" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#2a2b2f]">Electricity</p>
              <p className="truncate text-[11px] text-[#808988]">Monthly · due on the 5th · Shared</p>
            </div>
            <p className="font-numeric text-[14px] font-semibold text-[#2a2b2f]">Rp450.000</p>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-[#eadfcd] pt-2.5">
            <StatusPill tone="draft">Bill draft</StatusPill>
            <div className="flex gap-2">
              <MiniButton primary>Add bill</MiniButton>
            </div>
          </div>
        </ResultShell>
      );
    case "hold":
      return (
        <ResultShell className="border-[#e6c9a8] bg-[#fffaf1]">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3B1D17] text-[#fef9ef]">
              <SolarIcon name="tv" size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#2a2b2f]">55&quot; TV</p>
              <p className="truncate text-[11px] text-[#808988]">Shared wallet · requested 23:40</p>
            </div>
            <p className="font-numeric text-[14px] font-semibold text-[#2a2b2f]">Rp8.000.000</p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-[#e6c9a8] pt-2.5">
            <StatusPill tone="hold">
              <SolarIcon name="clock-circle" size={11} /> Waiting List · until 08:00
            </StatusPill>
            <span className="flex items-center gap-1" aria-label="Waiting for partner PIN">
              {Array.from({ length: 6 }).map((_, i) => (
                <span key={i} className="h-1.5 w-1.5 rounded-full border border-[#B45529]/60" />
              ))}
            </span>
          </div>
        </ResultShell>
      );
  }
}

function AskSeiyaDemo() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState(0); // 0 empty, 1 user, 2 typing, 3 reply
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const scene = SCENES[index];
  const shownPhase = reduced ? 3 : phase;
  const autoplay = !reduced && !hovering && inView;

  const select = (i: number) => {
    setIndex(i);
    setPhase(0);
    setRun((r) => r + 1);
  };

  // Play the scene: user message, typing dots, then Seiya's answer.
  useEffect(() => {
    if (reduced) return;
    const timers = [
      setTimeout(() => setPhase(1), 250),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 2300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [run, reduced]);

  // Move on to the next scene once the answer has been on screen for a while.
  useEffect(() => {
    if (!autoplay || phase !== 3) return;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % SCENES.length);
      setPhase(0);
      setRun((r) => r + 1);
    }, SCENE_HOLD_MS);
    return () => clearTimeout(t);
  }, [autoplay, phase, run]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const bubble = shownPhase === 2 ? "Reading that…" : shownPhase === 3 ? scene.bubble : "Just tell me.";

  return (
    <div className="relative w-full">
      <div
        ref={panelRef}
        className="relative mx-auto w-full max-w-[360px]"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {/* Mascot with a status bubble, perched on the phone's corner */}
        <div className="pointer-events-none absolute -right-2 -top-12 z-30 flex flex-row-reverse items-start gap-1.5 sm:-right-12">
          <div className="lp-float drop-shadow-[0_10px_14px_rgba(180,85,41,0.35)]">
            <SeiyaIcon size={68} isThinking={shownPhase === 2} />
          </div>
          <div
            key={`${run}-${shownPhase === 3 ? "done" : shownPhase === 2 ? "think" : "idle"}`}
            className="lp-swap mt-2 max-w-[190px] rounded-2xl rounded-tr-[4px] border border-[#eadfcd] bg-white px-3 py-1.5 text-[12px] font-semibold leading-snug text-[#3B1D17] shadow-[0_8px_20px_-12px_rgba(59,29,23,0.45)] font-jakarta"
          >
            {bubble}
          </div>
        </div>

        {/* Floating context cards (wide screens only) */}
        <div
          aria-hidden="true"
          className="lp-float absolute -right-32 top-40 z-20 hidden rounded-2xl border border-[#eadfcd] bg-white/95 px-3.5 py-2.5 shadow-[0_18px_40px_-20px_rgba(59,29,23,0.4)] xl:block"
          style={{ animationDelay: "-2s" }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#808988]">Shared wallet</p>
          <p className="font-numeric text-[15px] font-semibold text-[#2a2b2f]">Rp12.450.000</p>
        </div>
        <div
          aria-hidden="true"
          className="lp-float absolute -left-36 bottom-32 z-20 hidden items-center gap-2 rounded-2xl border border-[#eadfcd] bg-white/95 px-3 py-2 shadow-[0_18px_40px_-20px_rgba(59,29,23,0.4)] xl:flex"
          style={{ animationDelay: "-3.5s" }}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4d7c5a]/15 text-[#3f6a4b]">
            <SolarIcon name="check" size={13} />
          </span>
          <span className="text-[11.5px] font-semibold text-[#3B1D17] font-jakarta">Dina approved with PIN</span>
        </div>

        {/* Phone */}
        <div className="relative rounded-[48px] bg-[#2b1713] p-[9px] shadow-[0_50px_100px_-40px_rgba(59,29,23,0.6),inset_0_0_0_1.5px_rgba(255,255,255,0.08)]">
          <span aria-hidden="true" className="absolute -left-[3px] top-28 h-9 w-[3px] rounded-l bg-[#2b1713]" />
          <span aria-hidden="true" className="absolute -left-[3px] top-[164px] h-14 w-[3px] rounded-l bg-[#2b1713]" />
          <span aria-hidden="true" className="absolute -right-[3px] top-36 h-20 w-[3px] rounded-r bg-[#2b1713]" />

          <div className="relative overflow-hidden rounded-[39px] bg-[#fffdf8]">
            {/* Status bar */}
            <div aria-hidden="true" className="relative flex h-11 items-center justify-between px-7 text-[12.5px] font-semibold text-[#2a2b2f] font-jakarta">
              <span className="font-numeric">{scene.time}</span>
              <span className="absolute left-1/2 top-2.5 h-[25px] w-[88px] -translate-x-1/2 rounded-full bg-[#140a08]" />
              <span className="flex items-center gap-1.5">
                <span className="flex items-end gap-[2px]">
                  {[4, 6, 8, 10].map((h) => (
                    <span key={h} className="w-[3px] rounded-[1px] bg-[#2a2b2f]" style={{ height: h }} />
                  ))}
                </span>
                <span className="flex h-[11px] w-[22px] items-center rounded-[3px] border border-[#2a2b2f]/45 p-[1.5px]">
                  <span className="h-full w-[72%] rounded-[1.5px] bg-[#2a2b2f]" />
                </span>
              </span>
            </div>

            {/* App header */}
            <div className="flex items-center gap-2.5 border-b border-[#f0e6d6] px-4 pb-2.5 pt-1">
              <SeiyaIcon size={30} />
              <div className="min-w-0 flex-1">
                <p className="font-serif text-[15px] leading-tight text-[#2a2b2f]">Ask Seiya</p>
                <p className="flex items-center gap-1 truncate text-[10.5px] text-[#808988]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4d7c5a]" /> Raka &amp; Dina · shared space
                </p>
              </div>
              <div className="flex -space-x-2" aria-hidden="true">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#fffdf8] bg-[#3B1D17] text-[10px] font-semibold text-[#fef9ef]">R</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#fffdf8] bg-[#C98A4F] text-[10px] font-semibold text-[#fef9ef]">D</span>
              </div>
            </div>

            {/* Messages */}
            <div
              className="flex h-[440px] flex-col justify-end gap-2.5 overflow-hidden px-3 pb-3 pt-6"
              style={{
                maskImage: "linear-gradient(to bottom, transparent 0, black 36px)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0, black 36px)",
              }}
              aria-label={`Example: ${scene.chip}`}
            >
              <p className="text-center text-[10.5px] font-medium text-[#a19b91]">Today · {scene.time}</p>

              {shownPhase >= 1 && (
                <div key={`${run}-u`} className="lp-msg-in ml-auto flex max-w-[84%] flex-col items-end gap-1.5">
                  {scene.user.file && (
                    <span className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-[#eadfcd] bg-white px-3 py-2 text-[12px] text-[#2a2b2f]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#B45529]/10 text-[#B45529]">
                        <SolarIcon name={scene.user.file.icon} size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{scene.user.file.name}</span>
                        <span className="block text-[10.5px] text-[#808988]">{scene.user.file.meta}</span>
                      </span>
                    </span>
                  )}
                  {scene.user.text && (
                    <p className="rounded-2xl rounded-br-[6px] bg-[#B45529] px-3.5 py-2 text-[13px] leading-snug text-[#fef9ef]">
                      {scene.user.text}
                    </p>
                  )}
                </div>
              )}

              {shownPhase === 2 && (
                <div key={`${run}-t`} className="lp-msg-in flex items-end gap-2">
                  <SeiyaIcon size={22} />
                  <span className="lp-typing flex gap-1 rounded-2xl rounded-bl-[6px] border border-[#eadfcd] bg-white px-3 py-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#B45529]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#B45529]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#B45529]" />
                  </span>
                </div>
              )}

              {shownPhase >= 3 && (
                <div key={`${run}-r`} className="lp-msg-in flex items-start gap-2">
                  <SeiyaIcon size={22} className="mt-1 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="rounded-2xl rounded-tl-[6px] border border-[#eadfcd] bg-white px-3.5 py-2 text-[13px] leading-snug text-[#2a2b2f]">
                      {scene.reply}
                    </p>
                    <SceneResult id={scene.id} />
                  </div>
                </div>
              )}
            </div>

            {/* Composer (decorative) */}
            <div aria-hidden="true" className="flex items-center gap-1.5 border-t border-[#f0e6d6] px-3 pb-1.5 pt-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-[#808988]">
                <SolarIcon name="paperclip" size={17} />
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-[#808988]">
                <SolarIcon name="camera" size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate rounded-full bg-[#f5eee1] px-3.5 py-2 text-[12.5px] text-[#a19b91]">
                Tell Seiya what you spent…
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#B45529] text-[#fef9ef]">
                <SolarIcon name="microphone" size={15} />
              </span>
            </div>
            <div aria-hidden="true" className="flex justify-center pb-2 pt-2">
              <span className="h-[5px] w-28 rounded-full bg-[#2a2b2f]/85" />
            </div>
          </div>
        </div>
      </div>

      {/* Scene picker */}
      <div className="mt-7">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#808988] font-jakarta sm:text-center">Try asking Seiya</p>
        <div className="lp-no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
          {SCENES.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => select(i)}
                aria-pressed={active}
                className={cn(
                  "relative inline-flex shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-colors font-jakarta focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B45529]/40",
                  active
                    ? "border-[#3B1D17] bg-[#3B1D17] text-[#fef9ef]"
                    : "border-[#e3d6c2] bg-white/70 text-[#3B1D17] hover:border-[#B45529]/50 hover:text-[#B45529]"
                )}
              >
                <SolarIcon name={s.icon} size={14} />
                {s.chip}
                {active && autoplay && phase === 3 && (
                  <span
                    key={run}
                    aria-hidden="true"
                    className="lp-progress absolute inset-x-0 bottom-0 h-[2px] bg-[#C98A4F]"
                    style={{ animationDuration: `${SCENE_HOLD_MS}ms` }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules bento visuals
// ---------------------------------------------------------------------------

function DualKeyVisual() {
  return (
    <div className="relative rounded-2xl border border-[#eadfcd] bg-[#fefaf2] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold text-[#2a2b2f]">Weekend trip to Bandung</p>
          <p className="truncate text-[11.5px] text-[#808988]">Proposed by Raka · Shared wallet</p>
        </div>
        <p className="font-numeric text-[15px] font-semibold text-[#2a2b2f]">Rp3.200.000</p>
      </div>
      <div className="mt-4 space-y-2.5">
        <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
          <span className="flex items-center gap-2 text-[12.5px] text-[#2a2b2f]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3B1D17] text-[10px] font-semibold text-[#fef9ef]">R</span>
            Key 1 · Raka
          </span>
          <StatusPill>
            <SolarIcon name="check" size={11} /> Approved
          </StatusPill>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5">
          <span className="flex items-center gap-2 text-[12.5px] text-[#2a2b2f]">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C98A4F] text-[10px] font-semibold text-[#fef9ef]">D</span>
            Key 2 · Dina&apos;s PIN
          </span>
          <span className="flex items-center gap-1.5" aria-label="Six-digit PIN">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className="lp-pin-dot h-2.5 w-2.5 rounded-full border-[1.5px] border-[#B45529]"
                style={{ "--i": i } as React.CSSProperties}
              />
            ))}
          </span>
        </div>
      </div>
      <span
        aria-hidden="true"
        className="lp-stamp pointer-events-none absolute -right-2 -top-3 rounded-md border-2 border-[#B45529] bg-[#fffdf8] px-2 py-0.5 font-jakarta text-[11px] font-bold uppercase tracking-[0.16em] text-[#B45529]"
      >
        Both keys turned
      </span>
    </div>
  );
}

function CoolingOffVisual() {
  // Demo countdown for a TV requested at 23:40, released at 08:00.
  const [left, setLeft] = useState(8 * 3600 + 20 * 60);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 8 * 3600 + 20 * 60)), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(Math.floor(left / 3600)).padStart(2, "0");
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const night = 1 - left / (8 * 3600 + 20 * 60);

  return (
    <div className="rounded-2xl border border-[#eadfcd] bg-[#fefaf2] p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#808988]">Releases in</span>
        <span className="text-[11px] text-[#808988]">55&quot; TV · Rp8.000.000</span>
      </div>
      <p className="mt-1 font-numeric text-[34px] leading-none text-[#3B1D17]" aria-label="Demo countdown">
        {hh}:{mm}
        <span className="text-[#C98A4F]">:{ss}</span>
      </p>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#eadfcd]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#3B1D17] to-[#C98A4F]" style={{ width: `${Math.max(4, night * 100)}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-[#808988]">
        <span>23:40</span>
        <span>08:00</span>
      </div>
    </div>
  );
}

function PrivateWalletsVisual() {
  return (
    <ul className="space-y-2">
      <li className="flex items-center justify-between rounded-xl border border-[#eadfcd] bg-[#fefaf2] px-3 py-2.5">
        <span className="flex items-center gap-2 text-[12.5px] text-[#2a2b2f]">
          <SolarIcon name="users-group-rounded" size={16} className="text-[#B45529]" /> Shared wallet
        </span>
        <span className="font-numeric text-[13px] font-semibold text-[#2a2b2f]">Rp12.450.000</span>
      </li>
      <li className="flex items-center justify-between rounded-xl border border-[#eadfcd] bg-[#fefaf2] px-3 py-2.5">
        <span className="flex items-center gap-2 text-[12.5px] text-[#2a2b2f]">
          <SolarIcon name="wallet" size={16} className="text-[#B45529]" /> Your wallet
        </span>
        <span className="font-numeric text-[13px] font-semibold text-[#2a2b2f]">Rp3.200.000</span>
      </li>
      <li className="flex items-center justify-between rounded-xl border border-dashed border-[#d9c8ae] px-3 py-2.5">
        <span className="flex items-center gap-2 text-[12.5px] text-[#2a2b2f]">
          <SolarIcon name="eye-closed" size={16} className="text-[#808988]" /> Dina&apos;s wallet
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#3B1D17] px-2 py-0.5 text-[10.5px] font-semibold text-[#fef9ef] font-jakarta">
          <SolarIcon name="lock-keyhole" size={10} /> Private
        </span>
      </li>
    </ul>
  );
}

const GREETINGS = [
  { greeting: "Selamat pagi, Dina", code: "IDR", amount: "Rp12.450.000" },
  { greeting: "早上好，Wei", code: "CNY", amount: "¥5,320.00" },
  { greeting: "Good morning, Sam", code: "USD", amount: "$742.10" },
  { greeting: "おはようございます、Yuki さん", code: "JPY", amount: "¥98,400" },
];

function CurrencyVisual() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setI((n) => (n + 1) % GREETINGS.length), 2600);
    return () => clearInterval(id);
  }, [reduced]);
  const g = GREETINGS[i];

  return (
    <div className="rounded-2xl border border-[#eadfcd] bg-[#fefaf2] p-4">
      <div key={i} className="lp-swap">
        <p className="truncate font-serif text-[18px] text-[#2a2b2f]">{g.greeting}</p>
        <p className="mt-1 text-[11.5px] text-[#808988]">Shared wallet</p>
        <p className="font-numeric text-[22px] font-semibold text-[#3B1D17]">{g.amount}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {GREETINGS.map((x, n) => (
          <span
            key={x.code}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold font-jakarta transition-colors",
              n === i ? "bg-[#B45529] text-[#fef9ef]" : "bg-[#f0e6d6] text-[#8a7a66]"
            )}
          >
            {x.code}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const PROMISE_CLAUSES = [
  "We agree on one shared goal and review it together every month",
  "Shared costs are split 60:40 based on income",
  "Shared purchases above the limit need the other partner's approval",
  "Big late-night purchases wait until the next morning",
  "Family support has an agreed monthly amount",
  "Personal spending details stay private; only totals are shared",
  "We hold a short money check-in every Sunday evening",
  "We build an emergency fund before any big shared purchase",
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

function SectionEyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] font-jakarta",
        light ? "text-[#e7b98f]" : "text-[#B45529]"
      )}
    >
      <span className={cn("h-px w-7", light ? "bg-[#e7b98f]/70" : "bg-[#B45529]/60")} />
      {children}
    </p>
  );
}

export function LandingView({ onEnterApp }: LandingViewProps) {
  const [authMode, setAuthModeState] = useState<AuthMode | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  // Opening Sign In / Create Account adds a history entry, so the browser Back
  // button returns to this page instead of leaving the site.
  const setAuthMode = (mode: AuthMode | null) => {
    if (mode && !authMode) window.history.pushState({ seiyaAuth: true }, "");
    if (!mode && authMode && window.history.state?.seiyaAuth) {
      window.history.back();
      return;
    }
    setAuthModeState(mode);
  };

  useEffect(() => {
    const onPopState = () => {
      if (!window.history.state?.seiyaAuth) setAuthModeState(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useReveal(rootRef);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  };

  if (authMode) {
    return (
      <AuthView
        initialMode={authMode}
        onSuccess={() => {
          setAuthModeState(null);
          onEnterApp();
        }}
        onClose={() => setAuthMode(null)}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="min-h-screen overflow-x-clip bg-gradient-to-b from-[#fef9ef] to-[#fefcf6] text-[#2a2b2f] selection:bg-[#B45529]/20 selection:text-[#B45529]"
    >
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b border-[#eadfcd]/70 bg-[#fefcf6]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" })} aria-label="Seiya, back to top">
            <SeiyaLogo height={30} />
          </button>
          <nav className="hidden items-center gap-7 text-[13.5px] font-medium text-[#515151] md:flex" aria-label="Sections">
            {[
              ["how", "How it works"],
              ["rules", "Rules"],
              ["promise", "Seiya's Promise"],
            ].map(([id, label]) => (
              <button key={id} type="button" onClick={() => scrollTo(id)} className="transition-colors hover:text-[#B45529]">
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
            <div className="absolute right-[-10%] top-[-6%] h-[520px] w-[620px] rounded-full bg-[radial-gradient(closest-side,rgba(201,138,79,0.22),transparent)]" />
            <div className="absolute left-[-14%] top-[40%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(180,85,41,0.10),transparent)]" />
            <div
              className="absolute inset-0 opacity-[0.5]"
              style={{
                backgroundImage: "radial-gradient(rgba(59,29,23,0.13) 1px, transparent 1px)",
                backgroundSize: "22px 22px",
                maskImage: "radial-gradient(ellipse 70% 60% at 70% 40%, black, transparent)",
                WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 70% 40%, black, transparent)",
              }}
            />
          </div>

          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-16 px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:gap-12 lg:pb-28 lg:pt-20">
            <div>
              <div className="lp-reveal" style={delay(0)}>
                <SectionEyebrow>AI money co-pilot for couples</SectionEyebrow>
              </div>
              <h1 className="lp-reveal mt-5 font-serif text-[44px] font-normal leading-[1.04] tracking-[-0.03em] text-[#2a2b2f] sm:text-[60px] lg:text-[68px]" style={delay(80)}>
                Money decisions,
                <br />
                <span className="relative inline-block italic text-[#B45529]">
                  made together.
                  <svg
                    aria-hidden="true"
                    className="lp-underline absolute -bottom-2 left-0 h-3 w-full"
                    viewBox="0 0 300 12"
                    preserveAspectRatio="none"
                  >
                    <path d="M3 8 C 70 2, 160 2, 297 6" stroke="#C98A4F" strokeWidth="3" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="lp-reveal mt-7 max-w-xl text-[16.5px] leading-relaxed text-[#515151] sm:text-lg" style={delay(160)}>
                Just tell Seiya what you spent. It logs it, drafts bills and reads receipts,{" "}
                <span className="text-[#2a2b2f]">always within the rules you both agreed on.</span>
              </p>
              <div className="lp-reveal mt-8 flex flex-col gap-3 sm:flex-row sm:items-center" style={delay(240)}>
                <Button size="lg" onClick={() => setAuthMode("register")} className="group w-full rounded-full px-7 font-jakarta text-[15px] sm:w-auto">
                  Create your shared space
                  <SolarIcon name="arrow-right" size={18} className="transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button variant="outline" size="lg" onClick={() => setAuthMode("login")} className="w-full rounded-full px-7 font-jakarta text-[15px] sm:w-auto">
                  Sign In
                </Button>
              </div>
            </div>

            <div className="lp-reveal pt-12 lg:pt-8" style={delay(200)}>
              <AskSeiyaDemo />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-t border-[#eadfcd]/70 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <div className="lp-reveal">
                <SectionEyebrow>How it works</SectionEyebrow>
              </div>
              <h2 className="lp-reveal mt-4 text-balance font-serif text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[44px]" style={delay(80)}>
                Agree once. Talk naturally. <span className="italic text-[#B45529]">Decide together.</span>
              </h2>
            </div>

            <ol className="relative mt-14 grid grid-cols-[minmax(0,1fr)] gap-10 md:grid-cols-3 md:gap-8">
              <span
                aria-hidden="true"
                className="absolute left-[27px] top-14 bottom-14 w-px border-l border-dashed border-[#d9c8ae] md:left-[8%] md:right-[8%] md:top-[27px] md:bottom-auto md:h-px md:w-auto md:border-l-0 md:border-t"
              />
              {[
                {
                  title: "Sign Seiya's Promise",
                  body: "Answer a short questionnaire together, then pick the clauses you both agree on: how you split costs, when the other must approve, what stays private.",
                  tags: ["60:40 by income", "Approval limit", "Private details"],
                },
                {
                  title: "Just tell Seiya",
                  body: "Type or talk like you'd text a friend. Snap a receipt or drop in a bank statement. Seiya turns it into clean records in the right wallet.",
                  tags: ["Chat", "Voice", "Receipts", "Statements"],
                },
                {
                  title: "Both keys, every time",
                  body: "Shared spending above your limit waits for your partner's 6-digit PIN, and big late-night buys wait until morning. Seiya proposes. You decide.",
                  tags: ["Dual-Key PIN", "Waiting List", "Bills"],
                },
              ].map((step, n) => (
                <li key={step.title} className="lp-reveal relative pl-[76px] md:pl-0" style={delay(n * 120)}>
                  <span className="absolute left-0 top-0 flex h-[54px] w-[54px] items-center justify-center rounded-full border border-[#B45529]/40 bg-[#fefcf6] font-serif text-[20px] italic text-[#B45529] md:relative">
                    0{n + 1}
                  </span>
                  <h3 className="font-serif text-[22px] text-[#2a2b2f] md:mt-6">{step.title}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-[#515151]">{step.body}</p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {step.tags.map((t) => (
                      <span key={t} className="rounded-full border border-[#e3d6c2] bg-white/70 px-2.5 py-1 text-[11.5px] font-medium text-[#6d5a48]">
                        {t}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Rules bento */}
        <section id="rules" className="scroll-mt-20 bg-[#f6efe2] py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-2xl">
                <div className="lp-reveal">
                  <SectionEyebrow>The rules Seiya plays by</SectionEyebrow>
                </div>
                <h2 className="lp-reveal mt-4 text-balance font-serif text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[44px]" style={delay(80)}>
                  Smart enough to help. <span className="italic text-[#B45529]">Built to ask first.</span>
                </h2>
              </div>
              <p className="lp-reveal max-w-sm text-[15px] leading-relaxed text-[#515151]" style={delay(160)}>
                Every guardrail comes from the rules you two chose. Seiya can&apos;t skip them, and neither can one partner alone.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-6">
              <article className="lp-reveal grid grid-cols-[minmax(0,1fr)] gap-6 rounded-[24px] border border-[#eadfcd] bg-[#fffdf8] p-6 sm:p-7 md:col-span-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center">
                <div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#B45529]/10 text-[#B45529]">
                    <SolarIcon name="shield-check" size={20} />
                  </span>
                  <h3 className="mt-4 font-serif text-[24px] text-[#2a2b2f]">Dual-Key approvals</h3>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-[#515151]">
                    Shared spending above your limit needs both of you. Your partner confirms with their own 6-digit PIN, so no one
                    spends the shared pot alone.
                  </p>
                </div>
                <DualKeyVisual />
              </article>

              <article className="lp-reveal rounded-[24px] border border-[#eadfcd] bg-[#fffdf8] p-6 sm:p-7 md:col-span-2" style={delay(100)}>
                <h3 className="font-serif text-[22px] text-[#2a2b2f]">Cooling-off hold</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#515151]">
                  Big purchases after 22:00 wait on the Waiting List until 08:00. Sleep on it, together.
                </p>
                <div className="mt-5">
                  <CoolingOffVisual />
                </div>
              </article>

              <article className="lp-reveal rounded-[24px] border border-[#eadfcd] bg-[#fffdf8] p-6 sm:p-7 md:col-span-2">
                <h3 className="font-serif text-[22px] text-[#2a2b2f]">Private stays private</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#515151]">
                  Shared money is fully visible. Personal wallets share only totals, and your partner&apos;s balance shows as Private.
                </p>
                <div className="mt-5">
                  <PrivateWalletsVisual />
                </div>
              </article>

              <article className="lp-reveal rounded-[24px] border border-[#eadfcd] bg-[#fffdf8] p-6 sm:p-7 md:col-span-2" style={delay(100)}>
                <h3 className="font-serif text-[22px] text-[#2a2b2f]">Speaks your money</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#515151]">
                  IDR, CNY, USD and more, with a dashboard greeting in your own language.
                </p>
                <div className="mt-5">
                  <CurrencyVisual />
                </div>
              </article>

              <article className="lp-reveal relative overflow-hidden rounded-[24px] bg-[#3B1D17] p-6 text-[#fef9ef] sm:p-7 md:col-span-2" style={delay(200)}>
                <div aria-hidden="true" className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,rgba(201,138,79,0.35),transparent)]" />
                <div className="relative">
                  <SeiyaIcon size={46} />
                  <h3 className="mt-4 font-serif text-[22px]">
                    AI proposes. <span className="italic text-[#e7b98f]">You decide.</span>
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[#f3e6d4]/85">
                    Ask Seiya logs, drafts and suggests. It never moves money on its own; anything that touches the shared wallet
                    goes through you.
                  </p>
                  <div className="mt-5 flex items-center gap-2 text-[12px] font-semibold font-jakarta">
                    <span className="rounded-full bg-white/10 px-3 py-1.5">Seiya drafts</span>
                    <SolarIcon name="arrow-right" size={14} className="text-[#e7b98f]" />
                    <span className="rounded-full bg-[#B45529] px-3 py-1.5">You approve</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* Seiya's Promise */}
        <section id="promise" className="scroll-mt-20 py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
            <div>
              <div className="lp-reveal">
                <SectionEyebrow>Seiya&apos;s Promise</SectionEyebrow>
              </div>
              <h2 className="lp-reveal mt-4 text-balance font-serif text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[44px]" style={delay(80)}>
                Your house rules, <span className="italic text-[#B45529]">in writing.</span>
              </h2>
              <p className="lp-reveal mt-5 max-w-lg text-[16px] leading-relaxed text-[#515151]" style={delay(160)}>
                During onboarding you both answer a short questionnaire. Seiya turns your answers into eight plain-language clauses
                you pick together, and every request is checked against them.
              </p>
              <ul className="lp-reveal mt-7 space-y-3 text-[14.5px] text-[#2a2b2f]" style={delay(240)}>
                {[
                  "Written for your household, not a generic template",
                  "Limits and splits become real approval rules",
                  "Changes are flagged for both of you to sign",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B45529] text-[#fef9ef]">
                      <SolarIcon name="check" size={12} />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-reveal" style={delay(120)}>
              <div className="relative mx-auto max-w-[560px] rounded-[10px] border border-[#e6d8c2] bg-[#fffdf6] px-5 py-7 shadow-[0_40px_80px_-40px_rgba(59,29,23,0.45)] sm:px-9 sm:py-9 lg:rotate-[0.6deg]">
                <div aria-hidden="true" className="pointer-events-none absolute inset-2 rounded-[6px] border border-[#C98A4F]/25" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-serif text-[26px] italic text-[#3B1D17]">Seiya&apos;s Promise</p>
                      <p className="mt-0.5 text-[12.5px] text-[#808988]">between Raka &amp; Dina</p>
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#B45529]/30 bg-[#fef9ef]">
                      <SeiyaIcon size={30} />
                    </span>
                  </div>
                  <ol className="mt-6 space-y-3">
                    {PROMISE_CLAUSES.map((clause, n) => (
                      <li key={clause} className="flex items-start gap-3">
                        <span className="w-8 shrink-0 font-serif text-[13px] italic leading-snug text-[#B45529]">{ROMAN[n]}.</span>
                        <span className="flex-1 text-[13.5px] leading-snug text-[#2a2b2f]">{clause}</span>
                        <span className="flex shrink-0 gap-1 pt-0.5" aria-label="Agreed by both partners">
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#3B1D17] text-[8px] font-bold text-[#fef9ef]">R</span>
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#C98A4F] text-[8px] font-bold text-[#fef9ef]">D</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-8 grid grid-cols-2 gap-6">
                    {["Raka", "Dina"].map((name) => (
                      <div key={name}>
                        <p className="font-serif text-[24px] italic leading-none text-[#3B1D17]">{name}</p>
                        <div className="mt-1.5 border-t border-[#3B1D17]/40 pt-1.5 text-[11px] uppercase tracking-[0.14em] text-[#808988]">
                          Signed
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="pb-16 sm:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="lp-reveal relative overflow-hidden rounded-[32px] bg-[#3B1D17] px-6 py-14 text-[#fef9ef] sm:px-14 sm:py-16">
              <div aria-hidden="true" className="absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(180,85,41,0.55),transparent)]" />
              <div aria-hidden="true" className="absolute -bottom-32 left-1/4 h-[320px] w-[420px] rounded-full bg-[radial-gradient(closest-side,rgba(201,138,79,0.25),transparent)]" />
              <div className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
                <div>
                  <SectionEyebrow light>Start together</SectionEyebrow>
                  <h2 className="mt-4 max-w-xl text-balance font-serif text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[46px]">
                    Set up your shared space <span className="italic text-[#e7b98f]">in a few minutes.</span>
                  </h2>
                  <p className="mt-4 max-w-lg text-[15.5px] leading-relaxed text-[#f3e6d4]/85">
                    Create an account, invite your partner, and sign Seiya&apos;s Promise together. Then just start talking.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button size="lg" onClick={() => setAuthMode("register")} className="rounded-full px-7 font-jakarta text-[15px]">
                      Create Account
                      <SolarIcon name="arrow-right" size={18} />
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setAuthMode("login")}
                      className="rounded-full border-[#fef9ef]/50 px-7 font-jakarta text-[15px] text-[#fef9ef] hover:bg-white/10"
                    >
                      Sign In
                    </Button>
                  </div>
                </div>
                <div aria-hidden="true" className="hidden justify-center md:flex">
                  <div className="lp-float drop-shadow-[0_24px_30px_rgba(0,0,0,0.35)]">
                    <SeiyaIcon size={150} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#eadfcd]/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-7 text-[12.5px] text-[#808988] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <SeiyaLogo height={22} trackCursor={false} />
            <span>© 2026 · Money decisions, made together.</span>
          </div>
          <p>Wallet balances in Seiya are simulated. No real money moves.</p>
        </div>
      </footer>
    </div>
  );
}
