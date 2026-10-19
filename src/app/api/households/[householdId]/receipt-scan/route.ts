import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consumeAgentRequestAllowance } from "@/backend/agents/request-limiter";
import { hasReceiptReader, scanReceipt } from "@/backend/services/receipt-scan.service";
import { extractPdfText } from "@/backend/services/statement-parser.service";
import { parseReceiptText } from "@/lib/receipt-text";

type RouteContext = { params: Promise<{ householdId: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Reads a receipt into a draft expense (merchant, total, date, category).
 * - PDF e-receipts: text via unpdf + rules, no AI tokens.
 * - Photos: the browser already tried on-device OCR (tesseract.js); this
 *   vision-model path is only the fallback when OCR could not find a total.
 * Nothing is recorded here: the user confirms the draft in the chat.
 */
export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;
  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ success: false, message: "Active household membership required." }, { status: 403 });
    }

    const allowance = consumeAgentRequestAllowance(user.id);
    if (!allowance.allowed) {
      return NextResponse.json(
        { success: false, message: `Too many requests. Try again in ${allowance.retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(allowance.retryAfterSeconds) } }
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ success: false, message: "Send the photo as multipart form data." }, { status: 400 });
    }
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "No receipt photo provided." }, { status: 400 });
    }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf && !IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, message: "Use a JPG, PNG or WebP photo, or a PDF e-receipt." }, { status: 415 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, message: "The file is too large (max 4 MB)." }, { status: 413 });
    }

    if (isPdf) {
      const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
      const receipt = text ? parseReceiptText(text) : null;
      if (!receipt || receipt.total === null) {
        return NextResponse.json(
          { success: false, message: "I couldn't find a total in this PDF. If it's a bank statement, use 📎 instead." },
          { status: 422 }
        );
      }
      return NextResponse.json({ success: true, receipt, provider: "pdf-text" });
    }

    if (!hasReceiptReader()) {
      return NextResponse.json({ success: false, message: "Receipt reading is not configured yet." }, { status: 503 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const { receipt, provider } = await scanReceipt(`data:${file.type};base64,${base64}`);

    if (receipt.total === null && receipt.merchant === null) {
      return NextResponse.json(
        { success: false, message: "Seiya couldn't read this receipt. Try a sharper, well-lit photo." },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, receipt, provider });
  } catch (error) {
    console.error("[receipt-scan]", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, message: "Seiya couldn't read the receipt right now. Please try again." },
      { status: 502 }
    );
  }
}
