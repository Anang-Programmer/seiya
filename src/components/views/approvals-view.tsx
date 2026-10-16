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
  const { currentUser, approvals, declineRequest, reportingCurrency, locale, partnerAName, partnerBName } = useApp();
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
    { key: "waiting_me", label: "Waiting for me", badge: waitingForMe.length },
    { key: "waiting_partner", label: "Waiting for partner", badge: waitingForPartner.length },
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
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-serif font-normal text-[#2a2b2f] text-sm">{req.title}</span>
                      <Badge
                        variant={
                          req.status === "pending"
                            ? "pending"
                            : req.status === "approved"
                            ? "allow"
                            : "deny"
                        }
                      >
                        {req.status.toUpperCase()}
                      </Badge>
                    </div>
                    <span className="text-[11px] text-[#515151]">
                      Requested by <strong>{requesterDisplayName}</strong> • Wallet: {req.wallet.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold font-serif text-[#2a2b2f] block">
                      {formatMoney(req.amount, reqCurrency, locale)}
                    </span>
                    {reqCurrency !== reportingCurrency && req.amount > 0 && (
                      <span className="text-[11px] text-[#808988] font-serif block">
                        ≈ {formatMoneyConverted(req.amount, reqCurrency, reportingCurrency, locale)}
                      </span>
                    )}
                    <span className="text-[10px] text-[#C98A4F] font-medium font-serif">
                      Expires in ~{req.expiresInHours}h
                    </span>
                  </div>
                </div>

                {/* Explanation */}
                <div className="p-3.5 rounded-[12px] bg-[#fef9ef] text-xs text-[#515151] space-y-1">
                  <span className="font-semibold text-[#2a2b2f] block text-[11px]">Reason for approval:</span>
                  <p className="leading-relaxed">{req.reason}</p>
                </div>

                {/* Action controls */}
                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-[#808988] flex items-center gap-1.5 font-mono">
                    <SolarIcon name="lock-keyhole" size={13} />
                    <span>Idempotent • Server-enforced safety boundary</span>
                  </div>

                  {req.status === "pending" && (
                    <div className="flex items-center gap-2">
                      {isRequester ? (
                        <div className="flex items-center gap-1.5 text-xs text-[#C98A4F] font-medium">
                          <SolarIcon name="clock-circle" size={14} />
                          <span>Waiting for partner signature (Self-approval blocked)</span>
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
                            className="text-xs"
                          >
                            <SolarIcon name="check-circle" size={14} />
                            Sign & Approve
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => declineRequest(req.id)}
                            className="text-xs text-[#a34426] hover:bg-[#fcf0ee]"
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
