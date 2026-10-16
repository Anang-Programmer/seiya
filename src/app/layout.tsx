import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Seiya — Money Decisions, Made Together",
  description: "Personal Finance Co-Pilot for Couples with Dual-Key Mutual Agreements",
  icons: {
    icon: "/seiya-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="font-sans antialiased bg-[#fef9ef] text-[#2a2b2f] min-h-screen selection:bg-[#B45529]/20 selection:text-[#B45529]"
      >
        {children}
      </body>
    </html>
  );
}
