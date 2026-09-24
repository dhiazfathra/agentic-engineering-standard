import type { Metadata } from "next";
import type { ReactNode } from "react";
import { fontVariables } from "@/styles/fonts";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "@/styles/tokens.css";

export const metadata: Metadata = {
  title: "Rewind",
  description: "Bug reports with screen recordings, console and network logs.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body suppressHydrationWarning>
        {/* Fixed constant string, no user input: sets dark mode before paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
