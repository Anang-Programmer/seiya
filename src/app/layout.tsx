import type { Metadata, Viewport } from "next";
import { Inter, Lora, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"],
});

// Button font from the Figma design system ("Button Font/Large").
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plus-jakarta",
});

export const metadata: Metadata = {
  title: "Seiya — Money Decisions, Made Together",
  description: "Personal Finance Co-Pilot for Couples with Dual-Key Mutual Agreements",
  icons: {
    icon: "/seiya-icon.svg",
  },
};

// viewportFit "cover" lets the fixed bottom navigation use the safe-area inset
// on phones with a home indicator; themeColor tints the mobile browser bar.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fef9ef",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable} ${plusJakarta.variable}`} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="font-sans antialiased bg-[#fef9ef] text-[#2a2b2f] min-h-screen selection:bg-[#B45529]/20 selection:text-[#B45529]"
      >
        {children}
      </body>
    </html>
  );
}
