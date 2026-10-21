// Generates the README banner and flow diagrams (SVG + 2x PNG).
// Usage: node scripts/tools/generate-readme-images.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(path.join(root, "package.json"));
const sharp = require("sharp");
const out = path.join(root, "docs", "images");
fs.mkdirSync(out, { recursive: true });

const C = {
  bg: "#FEF9EF", card: "#FFFFFF", line: "#E7DCCB", ink: "#2A2B2F", muted: "#6B6F6E",
  terra: "#B45529", amber: "#C98A4F", peach: "#FAEADE",
  holdBg: "#FFF3E2", green: "#2D5232", greenBg: "#EDF3EC", red: "#A34426", redBg: "#FBEAE4",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (x, y, lines, { size = 15, weight = 400, fill = C.ink, family = SANS, anchor = "start", lh = 1.4, style = "" } = {}) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${style ? ` font-style="${style}"` : ""}>` +
  [].concat(lines).map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lh}">${esc(l)}</tspan>`).join("") +
  `</text>`;
const box = (x, y, w, h, { fill = C.card, stroke = C.line, r = 18, dash = "", sw = 1.5 } = {}) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const arrow = (d, color = C.muted) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" marker-end="url(#ah-${color.slice(1)})"/>`;
const markers = (...colors) =>
  colors.map((c) => `<marker id="ah-${c.slice(1)}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join("");
const pill = (x, y, label, { fill = C.peach, color = C.terra, size = 13, w } = {}) => {
  const width = w ?? Math.round(label.length * size * 0.56 + 28);
  return `<rect x="${x}" y="${y}" width="${width}" height="${size + 16}" rx="${(size + 16) / 2}" fill="${fill}"/>` +
    text(x + width / 2, y + size + 4, label, { size, weight: 600, fill: color, anchor: "middle" });
};

// The Seiya mascot (public/seiya-icon.svg), drawn at any position and scale.
const mascot = (x, y, s, id = "m") => `<g transform="translate(${x} ${y}) scale(${s})">
<defs><linearGradient id="${id}" x1="78" y1="39" x2="0" y2="39" gradientUnits="userSpaceOnUse"><stop stop-color="#C98A4F"/><stop offset="0.585611" stop-color="#B45529"/></linearGradient></defs>
<path d="M39 0C49.7321 20.12 58.1747 28.776 78 39C60.7707 49.2804 52.1813 57.8009 39 78C27.0845 56.1032 17.9936 49.4122 0 39C20.5219 28.266 29.2136 19.856 39 0Z" fill="url(#${id})"/>
<ellipse cx="32.5" cy="39" rx="7.5" ry="13" fill="white"/>
<path d="M30.5 32C31.1743 32 31.8135 32.1493 32.3877 32.415L31.9717 32.9053C31.4353 33.5366 31.5122 34.4832 32.1436 35.0195C32.7749 35.5558 33.7215 35.479 34.2578 34.8477L34.5391 34.5156C34.8337 35.1143 35 35.7876 35 36.5C35 38.9853 32.9853 41 30.5 41C28.0147 41 26 38.9853 26 36.5C26 34.0147 28.0147 32 30.5 32Z" fill="black"/>
<ellipse cx="46.5" cy="39" rx="7.5" ry="13" fill="white"/>
<path d="M44.5 32C45.1743 32 45.8135 32.1493 46.3877 32.415L45.9717 32.9053C45.4353 33.5366 45.5122 34.4832 46.1436 35.0195C46.7749 35.5558 47.7215 35.479 48.2578 34.8477L48.5391 34.5156C48.8337 35.1143 49 35.7876 49 36.5C49 38.9853 46.9853 41 44.5 41C42.0147 41 40 38.9853 40 36.5C40 34.0147 42.0147 32 44.5 32Z" fill="black"/>
</g>`;

const svg = (w, h, body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${defs}</defs>
<rect width="${w}" height="${h}" rx="28" fill="${C.bg}"/>
${body}
</svg>
`;

// ---------- Banner ----------
const banner = svg(1280, 400, `
<circle cx="1150" cy="40" r="260" fill="url(#glowA)"/>
<circle cx="160" cy="380" r="240" fill="url(#glowB)"/>
${mascot(96, 92, 2.8, "bm")}
${text(400, 168, "Seiya", { size: 92, family: SERIF, fill: C.ink })}
${text(404, 222, "Money decisions, made together.", { size: 32, family: SERIF, fill: C.terra, style: "italic" })}
${text(404, 268, "An AI co-pilot for couples: agree on your money rules once, and Seiya keeps the promise.", { size: 19, fill: C.muted })}
${pill(404, 300, "Seiya's Promise", { size: 15 })}
${pill(568, 300, "Dual-key approvals", { size: 15 })}
${pill(756, 300, "Cooling-off holds", { size: 15 })}
${pill(936, 300, "Ask Seiya AI", { size: 15 })}
`, `<radialGradient id="glowA"><stop stop-color="${C.amber}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
<radialGradient id="glowB"><stop stop-color="${C.terra}" stop-opacity="0.14"/><stop offset="1" stop-color="${C.terra}" stop-opacity="0"/></radialGradient>`);

// ---------- Flow 1: getting started ----------
const steps = [
  ["Sign up", ["Full name and", "password. No", "email needed."]],
  ["Create or join", ["One partner creates", "the shared space and", "sends a private invite."]],
  ["Get to know you", ["21 short questions", "about each partner's", "money habits."]],
  ["Seiya's Promise", ["AI drafts the rules.", "Both partners sign", "the same clauses."]],
  ["Wallets open", ["Shared + personal", "wallets. Add your", "starting balance."]],
  ["Security PIN", ["A 6-digit PIN to", "approve requests and", "sign rule changes."]],
];
const daily = [
  ["Home", "Balances, monthly overview"],
  ["Ask Seiya", "Chat, receipts, statements"],
  ["Approvals", "Requests waiting for you"],
  ["Bills & Plan", "Due dates, budgets, goals"],
  ["Activity", "History, who owes whom"],
];
const SW = 180, GAP = 24, X0 = (1280 - (6 * SW + 5 * GAP)) / 2;
let f1 = `${text(56, 66, "How a couple starts with Seiya", { size: 30, family: SERIF })}
${text(56, 98, "Done once, together. After step 4 the rules are live and enforced on every shared expense.", { size: 16, fill: C.muted })}`;
steps.forEach(([title, lines], i) => {
  const x = X0 + i * (SW + GAP), y = 132, key = i === 3;
  f1 += box(x, y, SW, 200, { fill: key ? C.peach : C.card, stroke: key ? C.terra : C.line, sw: key ? 2 : 1.5 });
  f1 += `<circle cx="${x + 34}" cy="${y + 38}" r="18" fill="${key ? C.terra : C.ink}"/>`;
  f1 += text(x + 34, y + 44, String(i + 1), { size: 17, weight: 700, fill: "#fff", anchor: "middle" });
  f1 += text(x + 18, y + 92, title, { size: 18, weight: 700 });
  f1 += text(x + 18, y + 122, lines, { size: 14, fill: C.muted });
  if (i < 5) f1 += arrow(`M${x + SW + 3} ${y + 100} L${x + SW + GAP - 3} ${y + 100}`, C.terra);
});
f1 += box(40, 368, 1200, 158, { fill: "#FBF4E8", stroke: C.line, r: 22, dash: "6 6" });
f1 += text(70, 408, "Then, every day", { size: 20, family: SERIF });
const DW = 212, DG = 14, DX = (1280 - (5 * DW + 4 * DG)) / 2;
daily.forEach(([t, d], i) => {
  const x = DX + i * (DW + DG);
  f1 += box(x, 428, DW, 74, { r: 14 });
  f1 += text(x + 16, 458, t, { size: 16, weight: 700, fill: C.terra });
  f1 += text(x + 16, 484, d, { size: 13, fill: C.muted });
});
const flow1 = svg(1280, 560, f1, markers(C.terra));

// ---------- Flow 2: what happens to an expense ----------
let f2 = `${text(56, 66, "What happens when you spend", { size: 30, family: SERIF })}
${text(56, 98, "Every expense passes the Dual-Key Gateway, which checks the limits both partners signed in Seiya's Promise.", { size: 16, fill: C.muted })}`;
const inputs = ["Propose Expense form", "Ask Seiya chat", "Receipt photo (OCR)", "Bank statement import"];
f2 += text(56, 146, "LOG AN EXPENSE", { size: 12, weight: 700, fill: C.muted });
inputs.forEach((label, i) => {
  const y = 160 + i * 58;
  f2 += box(56, y, 250, 46, { r: 12 });
  f2 += text(76, y + 29, label, { size: 15, weight: 600 });
  f2 += arrow(`M306 ${y + 23} C346 ${y + 23} 346 266 384 266`);
});
// Gateway
f2 += box(388, 222, 340, 88, { fill: C.ink, stroke: C.ink, r: 16 });
f2 += mascot(408, 246, 0.52, "gm");
f2 += text(460, 260, "Seiya Gateway", { size: 19, weight: 700, fill: "#fff" });
f2 += text(460, 286, "Reads your active Promise", { size: 14, fill: "#D9D4CC" });
f2 += arrow("M558 310 L558 362");
// Check 1
f2 += box(388, 366, 340, 104, { stroke: C.amber, dash: "7 5", sw: 2 });
f2 += text(410, 398, "CHECK 1 · COOLING-OFF", { size: 12, weight: 700, fill: C.amber });
f2 += text(410, 424, ["Late night (22:00–08:00) or impulse", "buy, and amount ≥ cooling-off limit?"], { size: 15 });
// Hold
f2 += arrow("M728 418 L838 418", C.amber);
f2 += text(783, 408, "Yes", { size: 13, weight: 700, fill: C.amber, anchor: "middle" });
f2 += box(842, 352, 386, 132, { fill: C.holdBg, stroke: C.amber, sw: 2 });
f2 += text(866, 386, "Waiting List", { size: 19, weight: 700, fill: "#8A5A2B" });
f2 += text(866, 412, "Held for the agreed cooling-off hours.", { size: 14, fill: C.muted });
f2 += pill(866, 432, "Continue", { fill: "#fff", color: "#8A5A2B", size: 13, w: 110 });
f2 += pill(988, 432, "Cancel: nothing spent", { fill: "#fff", color: C.red, size: 13, w: 196 });
// Continue goes back through check 2
f2 += arrow("M921 484 L921 512 L668 512 L668 538", C.amber);
f2 += text(800, 504, "Continue: checked again", { size: 13, weight: 600, fill: C.amber, anchor: "middle" });
// Check 2
f2 += arrow("M558 470 L558 538");
f2 += text(572, 512, "No", { size: 13, weight: 700, fill: C.muted });
f2 += box(388, 542, 340, 104, { stroke: C.terra, dash: "7 5", sw: 2 });
f2 += text(410, 574, "CHECK 2 · PARTNER APPROVAL", { size: 12, weight: 700, fill: C.terra });
f2 += text(410, 600, ["Shared wallet, and amount ≥ the", "\"discuss first\" limit?"], { size: 15 });
// Approval
f2 += arrow("M728 594 L838 594", C.terra);
f2 += text(783, 584, "Yes", { size: 13, weight: 700, fill: C.terra, anchor: "middle" });
f2 += box(842, 538, 386, 112, { fill: C.peach, stroke: C.terra, sw: 2 });
f2 += text(866, 572, "Approvals", { size: 19, weight: 700, fill: C.terra });
f2 += text(866, 598, ["Your partner signs with their 6-digit PIN.", "Nobody can approve their own request."], { size: 14, fill: C.muted });
f2 += arrow("M921 650 L921 740 L732 740", C.green);
f2 += text(934, 700, "Approved", { size: 13, weight: 700, fill: C.green });
f2 += arrow("M1140 650 L1140 688", C.red);
f2 += pill(1010, 692, "Declined or cancelled: nothing spent", { fill: C.redBg, color: C.red, size: 12, w: 218 });
// Done
f2 += arrow("M558 646 L558 694");
f2 += text(572, 676, "No", { size: 13, weight: 700, fill: C.muted });
f2 += box(388, 698, 340, 92, { fill: C.greenBg, stroke: C.green, sw: 2 });
f2 += text(410, 732, "Recorded", { size: 19, weight: 700, fill: C.green });
f2 += text(410, 758, ["Wallet balance updated, the cost split", "by your agreed %, logged in Activity."], { size: 14, fill: C.muted });
// Notes
const notes = [
  ["Personal wallet", "No partner approval needed, and it stays private from your partner."],
  ["Not enough money?", "Seiya stops the expense and asks you to Add money first."],
  ["The AI only proposes", "Seiya's AI drafts and explains. It never approves or moves money."],
];
notes.forEach(([t, d], i) => {
  const x = 56 + i * 396;
  f2 += box(x, 826, 376, 92, { fill: "#FBF4E8", r: 14 });
  f2 += text(x + 20, 858, t, { size: 15, weight: 700 });
  // Wrap the description at about 46 characters per line.
  const lines = [""];
  for (const w of d.split(" ")) {
    const next = `${lines[lines.length - 1]} ${w}`.trim();
    if (next.length > 46) lines.push(w);
    else lines[lines.length - 1] = next;
  }
  f2 += text(x + 20, 882, lines, { size: 13.5, fill: C.muted });
});
const flow2 = svg(1280, 950, f2, markers(C.muted, C.amber, C.terra, C.green, C.red));

for (const [name, data] of [["banner", banner], ["flow-getting-started", flow1], ["flow-expense-gateway", flow2]]) {
  fs.writeFileSync(path.join(out, `${name}.svg`), data);
  await sharp(Buffer.from(data), { density: 144 }).png({ compressionLevel: 9, palette: false }).toFile(path.join(out, `${name}.png`));
  console.log(name, fs.statSync(path.join(out, `${name}.png`)).size);
}
