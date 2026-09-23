import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/styles/fonts";
import "@/styles/tokens.css";

export const metadata: Metadata = {
  title: "Rewind",
  description: "Bug reports with screen recordings, console and network logs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
