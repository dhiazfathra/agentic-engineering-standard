import { Inter, Instrument_Serif, Poppins } from "next/font/google";

// The design's three families. next/font self-hosts them at build time,
// so the browser never calls Google.
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const fontVariables = [inter, poppins, instrumentSerif]
  .map((f) => f.variable)
  .join(" ");
