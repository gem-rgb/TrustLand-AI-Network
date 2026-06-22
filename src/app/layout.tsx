import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "TrustLand AI Network - Trusted Autonomous Property Transactions",
  description: "Enterprise-grade platform for trusted autonomous property transactions using Terminal 3 Agent Auth SDK. Multi-agent ecosystem with verified identities, cryptographic signatures, and zero-trust architecture.",
  keywords: ["TrustLand", "Terminal 3", "Agent Auth", "Property Transactions", "AI Agents", "Trust Ledger", "Zero-Trust", "Verifiable Credentials"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
