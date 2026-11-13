import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { scriptTema } from "@/components/botao-tema";
import { AnalyticsAxis } from "@/components/analytics";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "AXIS", template: "%s · AXIS" },
  description: "AXIS: diagnósticos e financeiro das empresas atendidas pela assessoria",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="min-h-full font-sans">
        {children}
        <AnalyticsAxis />
      </body>
    </html>
  );
}
