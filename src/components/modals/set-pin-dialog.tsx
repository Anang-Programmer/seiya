"use client";

import React, { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SolarIcon } from "@/components/icons/solar";
import { useApp, PinSetupMode } from "@/lib/store";

// Mirrors isWeakPin in src/backend/validators/pin.ts so the hint shows before saving.
function weak(pin: string) {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const d = pin.split("").map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

const INPUT =
  "w-full h-12 px-4 rounded-[14px] border border-[#d1c9bf] bg-[#fef9ef] text-center font-mono text-xl tracking-[0.5em] text-[#2a2b2f] placeholder-[#c9c1b6] focus:outline-none focus:ring-2 focus:ring-[#B45529]/25 focus:border-[#B45529]";

function PinField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="space-y-1.5 block">
      <span className="text-xs font-semibold text-[#2a2b2f] block">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="••••••"
        className={INPUT}
      />
    </label>
  );
}

// Create the 6-digit security PIN (typed twice), or change it with the current one.
export function SetPinDialog() {
  const { pinSetupMode, closePinSetup } = useApp();
  return (
    <Dialog open={Boolean(pinSetupMode)} onOpenChange={(next) => !next && closePinSetup()} className="max-w-sm">
      {pinSetupMode && <SetPinForm key={pinSetupMode} mode={pinSetupMode} />}
    </Dialog>
  );
}

function SetPinForm({ mode }: { mode: PinSetupMode }) {
  const { closePinSetup, savePin } = useApp();
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isChange = mode === "change";
  const ready = pin.length === 6 && confirm.length === 6 && (!isChange || current.length === 6);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isChange && current.length !== 6) return setError("Enter your current 6-digit PIN.");
    if (pin.length !== 6) return setError("Your PIN needs exactly 6 digits.");
    if (weak(pin)) return setError("Too easy to guess. Avoid repeated or consecutive digits like 111111 or 123456.");
    if (pin !== confirm) return setError("The two PINs do not match. Type the same PIN twice.");
    if (isChange && pin === current) return setError("Pick a PIN different from your current one.");
    setSaving(true);
    const message = await savePin(pin, isChange ? current : undefined);
    setSaving(false);
    if (message) return setError(message);
    closePinSetup();
  };

  return (
    <>
      <DialogHeader onClose={closePinSetup}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0">
            <SolarIcon name="lock-keyhole" size={18} />
          </div>
          <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">
            {isChange ? "Change your security PIN" : "Create your security PIN"}
          </DialogTitle>
        </div>
        <DialogDescription className="text-xs text-[#515151]">
          {isChange
            ? "Enter your current PIN, then the new one twice."
            : "You need this 6-digit PIN to approve your partner's requests and sign changes to Seiya's Promise. Only you know it."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="pt-2 pb-4 space-y-4">
          {isChange && <PinField label="Current PIN" value={current} onChange={(v) => { setCurrent(v); setError(""); }} autoFocus />}
          <PinField label={isChange ? "New PIN" : "New 6-digit PIN"} value={pin} onChange={(v) => { setPin(v); setError(""); }} autoFocus={!isChange} />
          <PinField label="Type it again" value={confirm} onChange={(v) => { setConfirm(v); setError(""); }} />
          {pin.length === 6 && weak(pin) && !error && (
            <p className="text-[11px] text-[#C98A4F]">Too easy to guess. Avoid repeated or consecutive digits.</p>
          )}
          {error && <p className="text-xs text-[#a34426]">{error}</p>}
          <p className="text-[11px] text-[#808988] leading-relaxed">
            Don&apos;t share it, not even with your partner. Five wrong tries lock PIN checks for 15 minutes.
          </p>
        </DialogContent>

        <DialogFooter className="pt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={closePinSetup} className="text-xs">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={!ready || saving} className="text-xs">
            {saving ? "Saving…" : isChange ? "Change PIN" : "Create PIN"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
