"use client";

import React, { useState, useMemo } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SolarIcon } from "@/components/icons/solar";
import { useApp, ApprovalRequest } from "@/lib/store";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";

interface AllApprovalsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPinDialog?: (approval: ApprovalRequest) => void;
}

type FilterCategory = "All" | "Bills" | "Plans" | "Expenses" | "Contracts";
type ScopeFilter = "for_me" | "by_me" | "all";

export function AllApprovalsModal({ open, onOpenChange }: AllApprovalsModalProps) {
  const {
    approvals,
    currentUser,
    partnerAName,
    partnerBName,
    reportingCurrency,
    locale,
    approveApprovalRequest,
    declineApprovalRequest,
  } = useApp();

  const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

  const [activeCategory, setActiveCategory] = useState<FilterCategory>("All");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("for_me");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [pinPromptItem, setPinPromptItem] = useState<ApprovalRequest | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [approvedCelebration, setApprovedCelebration] = useState<ApprovalRequest | null>(null);

  // Filtered and sorted from newest first
  const filteredApprovals = useMemo(() => {
    return approvals
      .filter((item) => {
        // Scope filter: Requests for me (from partner), requests by me, or all
        if (scopeFilter === "for_me" && item.approver !== currentUser) return false;
        if (scopeFilter === "by_me" && item.requester !== currentUser) return false;

        // Category filter
        if (activeCategory !== "All") {
          const itemCat = item.category || (item.type === "BILL" ? "Bills" : item.type === "PLAN_DELETE" ? "Plans" : "Expenses");
          if (itemCat !== activeCategory) return false;
        }

        // Status filter
        if (statusFilter === "pending" && item.status !== "pending") return false;
        if (statusFilter === "resolved" && item.status === "pending") return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = item.title.toLowerCase().includes(q);
          const matchReason = (item.reason || "").toLowerCase().includes(q);
          if (!matchTitle && !matchReason) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Newest first by createdAt or ID timestamp
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  }, [approvals, scopeFilter, activeCategory, statusFilter, searchQuery, currentUser]);

  const categoryCounts = useMemo(() => {
    const counts: Record<FilterCategory, number> = {
      All: 0,
      Bills: 0,
      Plans: 0,
      Expenses: 0,
      Contracts: 0,
    };
    approvals.forEach((a) => {
      if (scopeFilter === "for_me" && a.approver !== currentUser) return;
      if (scopeFilter === "by_me" && a.requester !== currentUser) return;

      counts.All++;
      const cat = (a.category || (a.type === "BILL" ? "Bills" : a.type === "PLAN_DELETE" ? "Plans" : "Expenses")) as FilterCategory;
      if (counts[cat] !== undefined) {
        counts[cat]++;
      }
    });
    return counts;
  }, [approvals, scopeFilter, currentUser]);

  const handleStartPinApproval = (item: ApprovalRequest) => {
    setPinPromptItem(item);
    setPinInput("");
    setPinError("");
  };

  const handleConfirmPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinPromptItem) return;

    if (pinInput.length !== 6) {
      setPinError("Please enter your 6-digit security PIN.");
      return;
    }

    setIsAuthorizing(true);
    setTimeout(() => {
      setIsAuthorizing(false);
      const ok = approveApprovalRequest(pinPromptItem.id, pinInput);
      if (ok) {
        setApprovedCelebration(pinPromptItem);
        setActionSuccessMsg(`Consensus confirmed! "${pinPromptItem.title}" has been authorized.`);
        setPinPromptItem(null);
        setPinInput("");
        setTimeout(() => setActionSuccessMsg(null), 3500);
      } else {
        setPinError("Dual-key rule: You cannot approve your own request.");
      }
    }, 700);
  };

  const handleDecline = (item: ApprovalRequest) => {
    if (confirm(`Are you sure you want to decline "${item.title}"?`)) {
      declineApprovalRequest(item.id);
      setActionSuccessMsg(`Request "${item.title}" was declined.`);
      setTimeout(() => setActionSuccessMsg(null), 3000);
    }
  };

  const pendingCountForMe = approvals.filter((a) => a.status === "pending" && a.approver === currentUser).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl">
      <DialogHeader onClose={() => onOpenChange(false)} className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0">
              <SolarIcon name="layers" size={20} />
            </div>
            <div>
              <DialogTitle className="text-base sm:text-lg font-serif font-normal text-[#2a2b2f]">
                Partner Approval Requests
              </DialogTitle>
              <DialogDescription className="text-xs text-[#515151]">
                Every shared obligation, plan change, and bill settlement requires consensus from both partners.
              </DialogDescription>
            </div>
          </div>
          <Badge variant="neutral" className="font-mono text-xs">
            {pendingCountForMe} Pending for You
          </Badge>
        </div>
      </DialogHeader>

      <DialogContent className="pt-1 pb-4 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* Success Toast Banner */}
        {actionSuccessMsg && (
          <div className="p-3 rounded-[12px] bg-[#edf3ec] text-[#2d5232] text-xs font-semibold flex items-center gap-2 border border-[#2d5232]/20 animate-in fade-in-0">
            <SolarIcon name="check-circle" size={16} className="shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
        )}

        {/* Scope Selector: Requests for You vs Sent by You */}
        <div className="grid grid-cols-2 p-1 rounded-full bg-[#ece3d3]/70 border border-[#d1c9bf]/60 text-xs">
          <button
            type="button"
            onClick={() => setScopeFilter("for_me")}
            className={`py-1.5 px-3 rounded-full font-medium transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              scopeFilter === "for_me"
                ? "bg-[#fef9ef] text-[#2a2b2f] font-semibold shadow-2xs"
                : "text-[#515151] hover:text-[#2a2b2f]"
            }`}
          >
            <span>Requests from {partnerName}</span>
            {pendingCountForMe > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#B45529] text-white text-[10px] flex items-center justify-center font-mono">
                {pendingCountForMe}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setScopeFilter("by_me")}
            className={`py-1.5 px-3 rounded-full font-medium transition-all cursor-pointer ${
              scopeFilter === "by_me"
                ? "bg-[#fef9ef] text-[#2a2b2f] font-semibold shadow-2xs"
                : "text-[#515151] hover:text-[#2a2b2f]"
            }`}
          >
            Requests Sent by You
          </button>
        </div>

        {/* Category Filter Badges (Pills) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[#515151] px-1">
            <span className="font-semibold text-[#2a2b2f]">Filter by Category</span>
            <span className="text-[11px] text-[#808988]">Sorted by Newest First</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["All", "Bills", "Plans", "Expenses", "Contracts"] as FilterCategory[]).map((cat) => {
              const isActive = activeCategory === cat;
              const count = categoryCounts[cat];
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                    isActive
                      ? "bg-[#B45529] text-[#fef9ef] shadow-xs scale-102"
                      : "bg-[#fef9ef] text-[#515151] hover:text-[#2a2b2f] border border-[#d1c9bf]/60 hover:bg-[#f5eee1]"
                  }`}
                >
                  <span>{cat === "All" ? "All Categories" : cat}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? "bg-white/25 text-[#fef9ef]" : "bg-[#ece3d3] text-[#515151]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Search & Status Filter bar */}
        <div className="flex items-center gap-2 pt-1 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, bill, or reason..."
              className="w-full h-8 pl-8 pr-3 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-xs text-[#2a2b2f] placeholder-[#808988] focus:outline-none focus:ring-1 focus:ring-[#B45529]"
            />
            <div className="absolute left-2.5 top-2 text-[#808988] pointer-events-none">
              <SolarIcon name="search" size={13} />
            </div>
          </div>

          <div className="flex items-center p-0.5 rounded-full bg-[#ece3d3]/70 border border-[#d1c9bf]/60 text-xs shrink-0">
            <button
              onClick={() => setStatusFilter("pending")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                statusFilter === "pending"
                  ? "bg-[#fef9ef] text-[#2a2b2f] font-bold shadow-2xs"
                  : "text-[#515151] hover:text-[#2a2b2f]"
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => setStatusFilter("resolved")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                statusFilter === "resolved"
                  ? "bg-[#fef9ef] text-[#2a2b2f] font-bold shadow-2xs"
                  : "text-[#515151] hover:text-[#2a2b2f]"
              }`}
            >
              Resolved
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                statusFilter === "all"
                  ? "bg-[#fef9ef] text-[#2a2b2f] font-bold shadow-2xs"
                  : "text-[#515151] hover:text-[#2a2b2f]"
              }`}
            >
              All
            </button>
          </div>
        </div>

        {/* PIN Authorization Sub-Panel (when approving an item) */}
        {pinPromptItem && (
          <div className="p-4 rounded-[12px] bg-[#fcf5e8] border border-[#C98A4F]/40 space-y-3 animate-in fade-in-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#a34426]">
                <SolarIcon name="shield-check" size={18} />
                <span className="text-xs font-bold font-serif">Dual-Key Security PIN Required</span>
              </div>
              <button
                onClick={() => setPinPromptItem(null)}
                className="text-xs text-[#808988] hover:text-[#2a2b2f] cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>
            <p className="text-xs text-[#515151]">
              Authorizing: <strong>{pinPromptItem.title}</strong> for{" "}
              <strong className="font-mono">{formatMoney(pinPromptItem.amount, pinPromptItem.currency || reportingCurrency, locale)}</strong>.
              Enter your 6-digit security PIN:
            </p>

            <form onSubmit={handleConfirmPin} className="flex items-center gap-2 flex-wrap">
              <input
                type="password"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit PIN"
                autoFocus
                className="w-36 h-9 px-3 rounded-[10px] border border-[#d1c9bf] bg-[#fef9ef] text-center font-mono text-sm tracking-widest text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/30"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={isAuthorizing || pinInput.length !== 6}
                className="text-xs"
              >
                {isAuthorizing ? "Signing..." : "Sign & Approve"}
              </Button>
              <span className="text-[11px] text-[#808988] ml-2">Hint: 123456 / 654321</span>
            </form>
            {pinError && <p className="text-xs text-[#a34426] font-semibold">{pinError}</p>}
          </div>
        )}

        {/* Approvals List */}
        <div className="space-y-3">
          {filteredApprovals.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-[#f5eee1]/50 rounded-[12px] border border-dashed border-[#d1c9bf]">
              <div className="w-10 h-10 rounded-full bg-[#fef9ef] text-[#808988] flex items-center justify-center mx-auto">
                <SolarIcon name="check-circle" size={20} />
              </div>
              <h4 className="text-sm font-serif text-[#2a2b2f]">No Requests Found</h4>
              <p className="text-xs text-[#808988]">
                {statusFilter === "pending"
                  ? "All requests have been reviewed and settled!"
                  : "No items match your filter selection."}
              </p>
            </div>
          ) : (
            filteredApprovals.map((item) => {
              const itemCat = item.category || (item.type === "BILL" ? "Bills" : item.type === "PLAN_DELETE" ? "Plans" : "Expenses");
              const isPending = item.status === "pending";
              const isApproved = item.status === "approved";
              const isDeclined = item.status === "declined";
              const isRequester = item.requester === currentUser;
              const requesterName = item.requester === "partner_a" ? partnerAName : partnerBName;
              const approverName = item.approver === "partner_a" ? partnerAName : partnerBName;
              const currency = item.currency || reportingCurrency;

              // Badge category styles
              const catStyles: Record<string, { bg: string; text: string; icon: string }> = {
                Bills: { bg: "bg-[#fbf0eb]", text: "text-[#B45529]", icon: "calendar" },
                Plans: { bg: "bg-[#edf3ec]", text: "text-[#2d5232]", icon: "money-bag" },
                Expenses: { bg: "bg-[#eef2f6]", text: "text-[#2d4b68]", icon: "card" },
                Contracts: { bg: "bg-[#f3edf7]", text: "text-[#623b7a]", icon: "shield-check" },
              };
              const cs = catStyles[itemCat] || { bg: "bg-[#f5eee1]", text: "text-[#2a2b2f]", icon: "info-circle" };

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-[12px] transition-all border ${
                    isPending
                      ? "bg-[#fef9ef] border-[#d1c9bf]/80 shadow-xs hover:border-[#B45529]/40"
                      : "bg-[#f5eee1]/60 border-[#d1c9bf]/40 opacity-85"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Category Icon & Title */}
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-full shrink-0 ${cs.bg} ${cs.text}`}>
                        <SolarIcon name={cs.icon as any} size={18} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cs.bg} ${cs.text}`}>
                            {itemCat}
                          </span>
                          <h4 className="text-sm font-serif font-normal text-[#2a2b2f] leading-snug">
                            {item.title}
                          </h4>
                          {isPending && (
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#fcf5e8] text-[#C98A4F]">
                              {isRequester ? `Awaiting ${approverName}` : "Action Needed"}
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#edf3ec] text-[#2d5232]">
                              ✓ Confirmed
                            </span>
                          )}
                          {isDeclined && (
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#fcf0ee] text-[#a34426]">
                              Declined
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-[#515151] leading-relaxed max-w-lg">
                          {item.reason}
                        </p>

                        <div className="flex items-center gap-3 text-[11px] text-[#808988] pt-1">
                          <span>
                            Requested by: <strong>{requesterName}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Approver: <strong>{approverName}</strong>
                          </span>
                          {item.createdAt && (
                            <>
                              <span>•</span>
                              <span>{new Date(item.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Amount & Actions */}
                    <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1 pt-2 sm:pt-0 border-t sm:border-0 border-[#d1c9bf]/30">
                      <span className="text-base sm:text-lg font-bold font-serif text-[#2a2b2f]">
                        {formatMoney(item.amount, currency, locale)}
                      </span>
                      {currency !== reportingCurrency && (
                        <span className="text-[11px] font-serif text-[#808988] block">
                          ≈ {formatMoneyConverted(item.amount, currency, reportingCurrency, locale)}
                        </span>
                      )}

                      {isPending ? (
                        <div className="flex items-center gap-1.5">
                          {isRequester ? (
                            <span
                              className="text-[11px] font-medium text-[#808988] bg-[#ece3d3]/60 px-2.5 py-1 rounded-full cursor-not-allowed"
                              title="Dual-key rule: A requester cannot approve their own financial request"
                            >
                              Awaiting {approverName}&apos;s Confirmation
                            </span>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDecline(item)}
                                className="text-xs h-8 px-2.5 text-[#a34426] border-[#a34426]/30 hover:bg-[#fcf0ee]"
                              >
                                Decline
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleStartPinApproval(item)}
                                className="text-xs h-8 px-3 shadow-2xs"
                              >
                                Sign & Approve
                              </Button>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#515151] italic">
                          {isApproved ? "Executed via Dual-Key" : "Rejected"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>

      <DialogFooter className="pt-3 border-t border-[#d1c9bf]/40 flex items-center justify-between">
        <div className="text-[11px] text-[#808988] flex items-center gap-1.5">
          <SolarIcon name="shield-check" size={14} className="text-[#B45529]" />
          <span>Dual-Key Governance: Both partners have equal sovereignty.</span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="text-xs"
        >
          Close
        </Button>
      </DialogFooter>

      {/* Approved Celebration Modal */}
      {approvedCelebration && (
        <Dialog open={true} onOpenChange={() => setApprovedCelebration(null)} className="max-w-md">
          <DialogHeader onClose={() => setApprovedCelebration(null)}>
            <DialogTitle className="text-center font-serif font-normal text-lg">Signature Verified</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Dual-Key authorization confirmed.
            </DialogDescription>
          </DialogHeader>
          <DialogContent className="py-5 text-center space-y-3 animate-in fade-in-0 zoom-in-95 duration-200">
            <div
              style={{
                width: 210,
                height: 180,
                maskImage:
                  "radial-gradient(ellipse 49% 45% at 50% 50%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 49% 45% at 50% 50%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
              }}
              className="relative overflow-hidden shrink-0 select-none mx-auto flex items-center justify-center my-0"
            >
              <video
                src="/other/ApprovedSeiya.webm"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>
            <h4 className="text-lg font-serif font-normal text-[#2a2b2f]">Dual-Key Signature Confirmed!</h4>
            <p className="text-xs text-[#515151] max-w-xs mx-auto leading-relaxed">
              &quot;{approvedCelebration.title}&quot; successfully authorized and executed via Dual-Key Gateway.
            </p>
            <div className="pt-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => setApprovedCelebration(null)}
                className="text-xs"
              >
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}
