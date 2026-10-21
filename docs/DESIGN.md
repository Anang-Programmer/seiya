# Seiya Design System & Brand Guidelines

This document outlines the visual identity, design tokens, color hierarchy, typography, and UX copy standards for **Seiya** — the personal finance journal and co-pilot for couples.

---

## 1. Brand Philosophy

Seiya replaces cold, transactional spreadsheet tools with a warm, editorial, and collaborative aesthetic. It is built to foster open conversations around shared finances without judgment, friction, or awkwardness.

- **Warm Editorial Elegance:** Inspired by tactile paper, Japanese stationery, warm terracotta clay, and refined serif typography.
- **Mutual Trust over Surveillance:** Privacy is server-enforced, and shared decisions require mutual consent.
- **Natural Language:** Friendly, human terminology instead of complex cryptographic or blockchain jargon.

---

## 2. Color Palette & Hierarchy

### Primary Brand Colors

| Role | Color Name | Hex Code | Visual Swatch | Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Primary** | Warm Terracotta | `#B45529` | ![#B45529](https://dummyimage.com/16x16/B45529/B45529.png) | Main brand identity, primary CTA buttons, active navigation, key balance highlights, Partner A identifier |
| **Secondary** | Deep Espresso | `#3B1D17` | ![#3B1D17](https://dummyimage.com/16x16/3B1D17/3B1D17.png) | Wordmark typography, high-contrast dark accents, secondary actions, Partner B identifier |
| **Tertiary** | Golden Amber / Tan | `#C98A4F` | ![#C98A4F](https://dummyimage.com/16x16/C98A4F/C98A4F.png) | Mascot gradient highlight, cooling-off safeguards, waiting list badges, anomaly alerts, tertiary accents |

### Official Gradient & Card Gradients
- **Signature Terracotta Gradient:** `linear-gradient(135deg, #C98A4F 0%, #B45529 100%)`
  - Used in the Seiya diamond mascot emblem, central floating action button in mobile navigation, and hero accents.
- **Your Savings (Personal A):** `linear-gradient(145deg, #fefbf4 0%, #f7e8ce 55%, #f0dcb8 100%)` · Border: `#e5d0ad` · Warm Honey Amber / Golden Sand representing personal liquidity and autonomy.
- **Partner Savings (Personal B):** `linear-gradient(145deg, #f4f8f4 0%, #dceddd 55%, #cde1ce 100%)` · Border: `#bcd7be` · Botanical Forest Sage Wash representing calm trust and privacy-protected savings.
- **Shared Savings (Joint):** `linear-gradient(145deg, #fdf4ee 0%, #f9ded0 55%, #f4cdbb 100%)` · Border: `#e8baa3` · Warm Terracotta Blush representing the couple's shared treasury.

---

### Neutrals & Background Surfaces

| Token | Hex Code | Description | Usage |
| :--- | :--- | :--- | :--- |
| **Parchment White** | `#fefcf6` | Soft warm cream canvas | Main application background, card inner surfaces, pill inputs |
| **Aged Paper** | `#f5eee1` | Gentle parchment tint | Standard cards, sidebar background, dialogue headers, table rows |
| **Warm Taupe** | `#d1c9bf` / `#e5dcd0` | Muted paper border | Card borders, dividers, subtle separators |
| **Deep Ink** | `#2a2b2f` | Rich dark charcoal | Primary headlines, major financial amounts, active labels |
| **Graphite** | `#515151` | Neutral mid-tone | Body copy, secondary descriptions, metadata timestamps |
| **Muted Ash** | `#808988` | Muted gray | Placeholder text, inactive tab icons, helper footnotes |

---

### Semantic & Transaction Outcomes

| Natural UI Label | Internal Key | Background | Text / Border | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Approved** | `ALLOW` | `#edf3ec` | `#2d5232` (Forest Sage) | Transaction permitted under couple contract rules |
| **Needs Approval** | `NEED_APPROVAL` | `#fbf0eb` | `#B45529` (Primary Terracotta) | Requires the second partner's explicit signature |
| **On Hold** | `HOLD` | `#fcf5e8` | `#C98A4F` (Tertiary Amber) | Temporary hold for late-night impulse purchases |
| **Declined** | `DENY` | `#fcf0ee` | `#9e382b` / `#a34426` | Hard rule violation (e.g. unauthorized private wallet access) |

---

## 3. Typography

- **Serif (Editorial Display):** `Lora` (imported via Google Fonts / `next/font/google`), `Georgia`, serif
  - Used for editorial greetings (e.g. "Good morning, [Name]"), page headings (`h1`, `h2`, `h3`), section titles, and brand marks.
- **Sans-Serif (Body & UI):** `Inter` (imported via Google Fonts / `next/font/google`), ui-sans-serif, system-ui
- **Numbers & Financial Currency (MANDATORY RULE):** `Lora` (`font-serif`, imported via Google Fonts / `next/font/google`), serif
  - **MANDATORY DESIGN STANDARD:** Whenever creating UI that contains numbers, monetary amounts, wallet balances, currency values, percentages, statistical metrics, transaction figures, or numeric inputs, **ALWAYS directly use `Lora` (`font-serif` / `font-mono`)**.
  - Numbers in Seiya must never use generic sans-serif fonts. Lora gives numeric figures an exquisite, editorial, journal-like elegance reminiscent of high-end stationery and timeless Japanese book typography.
  - Tabular figure alignment (`font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1;`) is applied to preserve strict vertical column digit alignment.

---

## 4. Logo & Mascot Assets

The official Seiya brand mark consists of two core elements:
1. **Mascot Emblem (`SeiyaIcon`):**
   - Curved 4-pointed diamond filled with the `#C98A4F` to `#B45529` gradient.
   - Dual friendly white oval eyes (`rx=7.5`, `ry=13`).
   - Expressive black pupils with top-right reflection highlight cutouts looking upward and left.
2. **Wordmark (`SeiyaLogo`):**
   - Elegant serif lettering "*Seiya*" in deep espresso `#3B1D17` / `#B45529`.

Static SVG files are maintained in:
- `public/seiya-icon.svg` — 78x78 standalone mascot emblem
- `public/seiya-logo.svg` — 222x78 full emblem + wordmark

---

## 5. Terminology & UX Copy Standards

To maintain an inviting, non-intimidating experience, **all cryptographic and blockchain terminology is avoided** in user-facing copy:

| Avoid (Technical / Crypto Jargon) | Preferred Seiya Terminology | Context |
| :--- | :--- | :--- |
| ~~Cryptographic signature~~ | **Partner signature** / **Mutual agreement** | Signing proposals and approvals |
| ~~Cryptographic passkey~~ | **Biometric confirmation** / **Passkey** / **Partner approval** | Dual-key authorization |
| ~~Cryptographic security~~ | **Account security** / **Mutual protection** | Settings and privacy pages |
| ~~Cryptographically enforced~~ | **Server-enforced** / **Contract-backed** | Rule guarantees |
| ~~Zero-knowledge proof~~ | **Total-only privacy lock** | Hiding partner personal itemization |
| ~~Smart contract~~ | **Couple contract** / **Mutual agreement** | The shared spending rule framework |

---

## 6. UI Component Layout Standards

- **Tab Bars & Segmented Controls:** All tab bars, filter pill bars, and navigation tab bars use **Hug Contents** width (`w-fit` / `inline-flex`) instead of stretching to full width (`w-full`). This preserves a refined, floating pill aesthetic that gracefully wraps its items across all screen sizes.

