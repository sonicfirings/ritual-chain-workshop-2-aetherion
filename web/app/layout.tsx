import type { Metadata } from "next";
import { Archivo, Barlow, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const archivo = Archivo({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700", "800"] });
const barlow = Barlow({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Ritual Predict",
  description: "A plush-chic self-resolving prediction market on Ritual Chain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${barlow.variable} ${jetbrains.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
