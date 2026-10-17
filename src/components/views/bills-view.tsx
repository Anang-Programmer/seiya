"use client";

import React, { useState } from "react";
import { formatMoney, formatMoneyConverted, convertMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp, BillItem } from "@/lib/store";
import { ApprovalDialog } from "@/components/modals/approval-dialog";
import { BillDialog } from "@/components/modals/bill-dialog";

export function BillsView() {
  const {
    bills,
    reportingCurrency,
    locale,
    approvals,
    currentUser,
    partnerAName,
    partnerBName,
    deleteBill,
    requestPayBill,
    sendChatMessage,
  } = useApp();

  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billToEdit, setBillToEdit] = useState<BillItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeMenuBillId, setActiveMenuBillId] = useState<string | null>(null);

  const activePartnerName = currentUser === "partner_a" ? partnerAName : partnerBName;
  const otherPartnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenAddBill = () => {
    setBillToEdit(null);
    setBillModalOpen(true);
  };

  const handleOpenEditBill = (bill: BillItem) => {
    setBillToEdit(bill);
    setBillModalOpen(true);
  };

  const handleDeleteBill = (bill: BillItem) => {
    if (confirm(`Delete recurring bill "${bill.title}"?`)) {
      deleteBill(bill.id);
      showToast(`Bill "${bill.title}" removed.`);
    }
  };

  const handlePayBill = (bill: BillItem) => {
    requestPayBill(bill.id);
    showToast(
      `Marked "${bill.title}" as paid! Dispatched to ${otherPartnerName}'s approval queue for manual ACC.`
    );
  };

  const totalUpcoming = bills.reduce((acc, b) => {
    if (b.status === "paid") return acc;
    const conv = convertMoney(b.amount, b.currency || "USD", reportingCurrency);
    return acc + (conv.available ? conv.convertedAmount : b.amount);
  }, 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-3.5 rounded-[12px] bg-[#edf3ec] text-[#2d5232] text-xs font-semibold flex items-center justify-between border border-[#2d5232]/20 animate-in fade-in-0 shadow-xs">
          <div className="flex items-center gap-2">
            <SolarIcon name="check-circle" size={16} className="shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs text-[#2d5232]/70 hover:text-[#2d5232] cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-serif font-normal text-[#2a2b2f]">
            Monthly Bills & Reminders
          </h2>
          <p className="text-xs text-[#515151]">
            Recurring shared obligations. Settling requires manual dual-key ACC confirmation.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenAddBill}
            className="text-xs border-[#B45529]/40 hover:bg-[#faeade] text-[#B45529] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <SolarIcon name="plus" size={14} className="text-[#B45529]" />
            <span>Add Bill Manually</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              sendChatMessage("I want to add a recurring monthly bill reminder for our shared electricity & water.")
            }
            className="text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <SeiyaIcon size={14} color="#fef9ef" />
            <span>Add via Seiya</span>
          </Button>
        </div>
      </div>

      {/* Total Due Banner */}
      <div className="p-4 sm:p-5 rounded-[12px] bg-[#f5eee1] shadow-xs flex items-center justify-between">
        <div>
          <span className="text-xs text-[#808988] font-medium block">Total Upcoming Obligations</span>
          <span className="text-xs text-[#515151]">September 2026 Billing Cycle</span>
        </div>
        <div className="text-right">
          <span className="text-xl sm:text-2xl font-bold font-serif text-[#2a2b2f]">
            {formatMoney(totalUpcoming, reportingCurrency, locale)}
          </span>
        </div>
      </div>

      {/* Dual-Key Payment ACC Notice */}
      <div className="p-4 rounded-[12px] bg-[#fef9ef] border border-[#d1c9bf]/60 flex items-start gap-3 shadow-2xs">
        <div className="p-2 rounded-full bg-[#fbf0eb] text-[#B45529] shrink-0">
          <SolarIcon name="shield-check" size={18} />
        </div>
        <div className="text-xs text-[#2a2b2f]">
          <h4 className="font-semibold text-xs text-[#B45529] mb-0.5">
            Dual-Key Bill Settlement Rule
          </h4>
          <p className="text-[#515151] leading-relaxed">
            When either partner marks a bill as paid, it enters <strong>Waiting Partner Confirmation</strong>. An approval request is dispatched to your partner’s dashboard for manual review and PIN authorization before closing.
          </p>
        </div>
      </div>

      {/* Bill Anomalies Banner */}
      <div className="space-y-3">
        {/* Anomaly 1: Duplicate streaming */}
        <div className="p-5 rounded-[12px] bg-[#fcf5e8] shadow-xs flex items-start gap-3.5">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#C98A4F] shrink-0">
            <SolarIcon name="danger-triangle" size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#C98A4F]">Anomaly Detected: Duplicate Streaming</h4>
              <Badge variant="hold">Review Suggested</Badge>
            </div>
            <p className="text-xs text-[#515151] mt-1 leading-relaxed">
              Netflix Premium is scheduled on the shared wallet, but an individual subscription is already active on a personal card.
            </p>
          </div>
        </div>

        {/* Anomaly 2: Price increase 15% */}
        <div className="p-5 rounded-[12px] bg-[#fbf0eb] shadow-xs flex items-start gap-3.5">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#B45529] shrink-0">
            <SolarIcon name="info-circle" size={20} />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-[#B45529]">Price Increase: Home Internet Fiber +15%</h4>
              <Badge variant="neutral">Price Spike</Badge>
            </div>
            <p className="text-xs text-[#515151] mt-1 leading-relaxed">
              Bill increased by 15% compared to last month due to expired promotional discount bundle.
            </p>
          </div>
        </div>
      </div>

      {/* Bills List */}
      <div className="space-y-3">
        {bills.map((bill) => {
          const isDueSoon = bill.daysRemaining <= 3 && bill.status !== "paid";
          const isPending = bill.status === "pending_approval";
          const isPaid = bill.status === "paid";
          const billCurrency = bill.currency || reportingCurrency;

          // Find associated approval request if in pending_approval
          const associatedApproval = approvals.find(
            (a) => a.targetId === bill.id || a.title.includes(bill.title)
          );

          return (
            <div
              key={bill.id}
              className={`p-5 sm:p-6 rounded-[12px] bg-[#f5eee1] transition-all shadow-xs hover:shadow-sm ${
                isDueSoon ? "ring-2 ring-[#a34426]/20" : ""
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`p-3 rounded-full shrink-0 ${
                      isPaid
                        ? "bg-[#edf3ec] text-[#2d5232]"
                        : isPending
                        ? "bg-[#fcf5e8] text-[#C98A4F]"
                        : isDueSoon
                        ? "bg-[#fcf0ee] text-[#a34426]"
                        : "bg-[#fef9ef] text-[#2a2b2f]"
                    }`}
                  >
                    <SolarIcon name={isPending ? "clock-circle" : "calendar"} size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h4 className="text-sm font-serif font-normal text-[#2a2b2f]">{bill.title}</h4>
                      {isDueSoon && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#fcf0ee] text-[#a34426]">
                          Due in 3 days
                        </span>
                      )}
                      {isPaid && <Badge variant="allow">PAID & SETTLED</Badge>}
                      {isPending && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#fcf5e8] text-[#C98A4F] flex items-center gap-1">
                          <SolarIcon name="clock-circle" size={11} />
                          WAITING PARTNER CONFIRMATION
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[#515151] block">
                      Due: <strong>{bill.dueDate}</strong> • Wallet: {bill.wallet.replace("_", " ")}
                      {bill.category && ` • ${bill.category}`}
                    </span>
                    {bill.notes && (
                      <span className="text-[11px] text-[#808988] block mt-0.5">
                        {bill.notes}
                      </span>
                    )}
                    {bill.anomaly && (
                      <span className="text-[11px] text-[#C98A4F] font-medium flex items-center gap-1 mt-1">
                        <SolarIcon name="danger-triangle" size={12} />
                        {bill.anomaly.message}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Column: Amount ABOVE the Action Button, with 3-Dots Menu */}
                <div className="flex flex-col sm:items-end justify-between gap-2 shrink-0 sm:pl-4">
                  {/* Top row: Amount + 3 Dots Menu Button */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 relative w-full sm:w-auto">
                    <div className="text-left sm:text-right">
                      <span className="text-base sm:text-lg font-bold font-serif text-[#2a2b2f]">
                        {formatMoney(bill.amount, billCurrency, locale)}
                      </span>
                      {billCurrency !== reportingCurrency && (
                        <span className="text-[11px] text-[#808988] font-serif block">
                          ≈ {formatMoneyConverted(bill.amount, billCurrency, reportingCurrency, locale)}
                        </span>
                      )}
                    </div>

                    {/* 3 Dots Menu Button (Solar Streamline) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuBillId(activeMenuBillId === bill.id ? null : bill.id);
                        }}
                        className={`p-1.5 rounded-full text-[#808988] hover:text-[#2a2b2f] hover:bg-[#ece3d3] transition-colors cursor-pointer ${
                          activeMenuBillId === bill.id ? "bg-[#ece3d3] text-[#2a2b2f]" : ""
                        }`}
                        title="Bill options"
                        aria-label="Bill options"
                      >
                        <SolarIcon name="dots-menu" size={16} />
                      </button>

                      {/* Dropdown Menu */}
                      {activeMenuBillId === bill.id && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuBillId(null);
                            }}
                          />
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full mt-1 w-36 bg-[#fef9ef] rounded-[10px] shadow-lg border border-[#d1c9bf]/70 py-1 z-50 animate-in fade-in-0 zoom-in-95 text-xs text-[#2a2b2f]"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuBillId(null);
                                handleOpenEditBill(bill);
                              }}
                              className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#f5eee1] transition-colors text-left cursor-pointer font-medium"
                            >
                              <SolarIcon name="edit" size={14} className="text-[#808988]" />
                              <span>Edit Bill</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveMenuBillId(null);
                                handleDeleteBill(bill);
                              }}
                              className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[#fcf0ee] text-[#ba3c2a] transition-colors text-left cursor-pointer font-medium"
                            >
                              <SolarIcon name="trash" size={14} className="text-[#ba3c2a]" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bottom row: Action Button (Pay Bill / Status) */}
                  <div className="w-full sm:w-auto flex sm:justify-end">
                    {isPaid ? (
                      <span className="text-xs text-[#2d5232] font-semibold flex items-center gap-1.5 bg-[#edf3ec] px-3.5 py-1.5 rounded-full border border-[#2d5232]/20">
                        <SolarIcon name="check-circle" size={14} /> Confirmed
                      </span>
                    ) : isPending ? (
                      associatedApproval?.approver === currentUser ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedApproval(associatedApproval);
                            setApprovalModalOpen(true);
                          }}
                          className="text-xs shadow-2xs w-full sm:w-auto"
                        >
                          Confirm & Approve (PIN)
                        </Button>
                      ) : (
                        <span className="text-xs text-[#808988] bg-[#ece3d3]/80 px-3 py-1.5 rounded-full font-medium text-center w-full sm:w-auto">
                          Awaiting {otherPartnerName}&apos;s Approval
                        </span>
                      )
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handlePayBill(bill)}
                        className="text-xs shadow-2xs px-4 w-full sm:w-auto"
                      >
                        Pay Bill
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bill Add / Edit Modal */}
      <BillDialog
        open={billModalOpen}
        onOpenChange={setBillModalOpen}
        billToEdit={billToEdit}
      />

      {/* Approval Dialog */}
      <ApprovalDialog
        request={selectedApproval}
        open={approvalModalOpen}
        onOpenChange={setApprovalModalOpen}
      />
    </div>
  );
}
