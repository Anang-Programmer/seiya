"use client";

import { useEffect } from "react";
import { storePendingInvite } from "@/lib/invite";

// Landing point for partner invitation links (APP_BASE_URL/invite?token=...).
// The token is handed to the main app, which accepts it once the partner has signed in.
export default function InvitePage() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) storePendingInvite(token);
    window.location.replace("/");
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fef9ef] text-xs text-[#808988] font-serif">
      Opening your invitation...
    </div>
  );
}
