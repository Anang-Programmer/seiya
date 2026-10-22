"use client";

import React, { useState } from "react";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/input";
import { useApp, ApprovalRequest } from "@/lib/store";
import { ApprovalDialog } from "@/components/modals/approval-dialog";
import { ProposeExpenseDialog } from "@/components/modals/propose-expense-dialog";
import { PageHeader } from "@/components/ui/page-header";

export function ApprovalsView() {
  const { currentUser, approvals, declineRequest, cancelApprovalRequest, reportingCurrency, locale, partnerAName, partnerBName } = useApp();
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"waiting_me" | "waiting_partner" | "history">("waiting_me");
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proposeExpenseOpen, setProposeExpenseOpen] = useState(false);

  // Categorize requests
  const waitingForMe = approvals.filter(
    (a) => a.status === "pending" && a.approver === currentUser
  );

  const waitingForPartner = approvals.filter(
    (a) => a.status === "pending" && a.requester === currentUser
  );

  const history = approvals.filter(
    (a) => a.status !== "pending"
  );

  const currentList =
    activeTab === "waiting_me"
      ? waitingForMe
      : activeTab === "waiting_partner"
      ? waitingForPartner
      : history;

  const tabItems = [
    { key: "waiting_me", label: "Waiting for me", shortLabel: "For me", badge: waitingForMe.length },
    { key: "waiting_partner", label: "Waiting for partner", shortLabel: "For partner", badge: waitingForPartner.length },
    { key: "history", label: "History", badge: history.length },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">

      {/* Tabs & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Tabs
          items={tabItems}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as any)}
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => setProposeExpenseOpen(true)}
          className="rounded-full gap-1.5 self-start sm:self-auto shrink-0 text-xs shadow-2xs"
        >
          <SolarIcon name="plus" size={14} />
          <span>Propose Expense</span>
        </Button>
      </div>

      {/* Requests List */}
      <div className="space-y-3.5">
        {currentList.length === 0 ? (
          <div className="text-center py-12 bg-[#f5eee1] rounded-[12px] shadow-xs p-8 space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#fef9ef] text-[#808988] flex items-center justify-center mx-auto">
              <SolarIcon name="check-circle" size={24} />
            </div>
            <h4 className="text-sm font-serif font-normal text-[#2a2b2f]">No requests in this view</h4>
            <p className="text-xs text-[#515151] max-w-sm mx-auto">
              {activeTab === "waiting_me"
                ? "You're all caught up! No requests require your signature right now."
                : activeTab === "waiting_partner"
                ? "You have no outgoing requests waiting for partner signature."
                : "No past approval records yet."}
            </p>
          </div>
        ) : (
          currentList.map((req) => {
            const isRequester = req.requester === currentUser;
            const reqCurrency = req.currency || reportingCurrency;
            const requesterDisplayName = req.requester === "partner_a" ? partnerAName : partnerBName;

            return (
              <div
                key={req.id}
                className="p-5 sm:p-6 rounded-[12px] bg-[#f5eee1] shadow-xs hover:shadow-sm transition-all space-y-4"
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 sm:gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-base sm:text-lg font-medium font-serif text-[#2a2b2f] leading-snug">
                        {req.title}
                      </span>
                      <Badge
                        variant={
                          req.status === "pending"
                            ? "pending"
                            : req.status === "approved"
                            ? "allow"
                            : "deny"
                        }
                        className="text-xs font-semibold px-2.5 py-0.5"
                      >
                        {req.status.toUpperCase()}
                      </Badge>
                    </div>
                    <span className="text-xs sm:text-[13px] text-[#515151] block">
                      Requested by <strong className="text-[#2a2b2f]">{requesterDisplayName}</strong> • Wallet: {req.wallet === "shared" ? "Shared" : req.wallet === "personal_a" ? partnerAName : partnerBName}
                    </span>
                  </div>
                  <div className="sm:text-right shrink-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:block">
                    <span className="text-xl sm:text-2xl font-bold font-serif text-[#2a2b2f] block leading-none">
                      {formatMoney(req.amount, reqCurrency, locale)}
                    </span>
                    {reqCurrency !== reportingCurrency && req.amount > 0 && (
                      <span className="text-xs sm:text-[13px] text-[#808988] font-serif block mt-1">
                        ≈ {formatMoneyConverted(req.amount, reqCurrency, reportingCurrency, locale)}
                      </span>
                    )}
                    <span className="text-xs text-[#C98A4F] font-medium font-serif block sm:mt-1">
                      Expires in ~{req.expiresInHours}h
                    </span>
                  </div>
                </div>

                {/* Explanation */}
                <div className="p-4 rounded-[12px] bg-[#fef9ef] text-sm text-[#333333] space-y-1.5 border border-[#d1c9bf]/30">
                  <span className="font-semibold text-[#2a2b2f] block text-xs">Reason for approval:</span>
                  <p className="leading-relaxed text-xs sm:text-sm">{req.reason}</p>
                  {req.notes && (
                    <>
                      <span className="font-semibold text-[#2a2b2f] block text-xs pt-1.5">Notes from the requester:</span>
                      <p className="leading-relaxed text-xs sm:text-sm whitespace-pre-line">{req.notes}</p>
                    </>
                  )}
                </div>

                {/* Action controls */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 sm:pt-2">
                  <div className="hidden sm:flex text-xs text-[#808988] items-center gap-1.5 font-mono">
                    <SolarIcon name="lock-keyhole" size={14} />
                    <span>Idempotent • Server-enforced safety boundary</span>
                  </div>

                  {req.status === "pending" && (
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                      {isRequester ? (
                        <div className="col-span-2 flex items-center gap-3 flex-wrap justify-between sm:justify-end">
                          <div className="flex items-center gap-1.5 text-xs text-[#C98A4F] font-medium">
                            <SolarIcon name="clock-circle" size={14} />
                            <span>Waiting for your partner</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={cancellingId === req.id}
                            onClick={async () => {
                              setCancellingId(req.id);
                              await cancelApprovalRequest(req.id);
                              setCancellingId(null);
                            }}
                            className="text-xs"
                          >
                            {cancellingId === req.id ? "Cancelling..." : "Cancel request"}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedApproval(req);
                              setDialogOpen(true);
                            }}
                            className="h-10 sm:h-auto text-xs justify-center"
                          >
                            <SolarIcon name="check-circle" size={14} />
                            Sign & Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => declineRequest(req.id)}
                            className="h-10 sm:h-auto text-xs justify-center text-[#a34426] hover:bg-[#fcf0ee] border border-[#a34426]/25 sm:border-0"
                          >
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {req.status === "approved" && (
                    <span className="text-xs text-[#2d5232] font-semibold flex items-center gap-1">
                      <SolarIcon name="check-circle" size={14} /> Signed & Executed
                    </span>
                  )}

                  {req.status === "declined" && (
                    <span className="text-xs text-[#a34426] font-semibold flex items-center gap-1">
                      <SolarIcon name="close-circle" size={14} /> Declined
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Approval Dialog */}
      <ApprovalDialog
        request={selectedApproval}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      {/* Propose Expense Modal */}
      <ProposeExpenseDialog
        open={proposeExpenseOpen}
        onOpenChange={setProposeExpenseOpen}
      />
    </div>
  );
}
