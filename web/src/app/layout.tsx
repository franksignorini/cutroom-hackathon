import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Big_Shoulders_Stencil, Courier_Prime, Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
// Next has no fallback metrics for Big Shoulders ("Failed to find font override values" on every request): skip the
// size-adjusted fallback and name a narrow system face instead.
const shoulders = Big_Shoulders({ variable: "--font-shoulders", subsets: ["latin"], weight: "variable", adjustFontFallback: false, fallback: ["Arial Narrow", "Impact", "sans-serif"] });
const stencil = Big_Shoulders_Stencil({ variable: "--font-stencil", subsets: ["latin"], weight: "variable", adjustFontFallback: false, fallback: ["Arial Narrow", "Impact", "sans-serif"] });
const courier = Courier_Prime({ variable: "--font-courier", subsets: ["latin"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Cutroom — type a trailer, watch an agent shoot it",
  description:
    "An AI crew writes your trailer as code inside a CreateOS sandbox, watches its own frames, fixes them and renders an MP4. No GPU. Every frame is code.",
};

export const viewport: Viewport = { themeColor: "#0a0a0b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: browser extensions write attributes on <html> before React loads (seen: a password
    // manager's data-mbtss-nonce). It covers this element's attributes only, not the page inside.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geist.variable} ${shoulders.variable} ${stencil.variable} ${courier.variable} h-full antialiased`}
    >
      <body className="min-h-full overflow-x-hidden">
        {children}
        <div className="vignette" aria-hidden />
        <div className="grain-wrap" aria-hidden>
          <div className="grain" />
        </div>
      </body>
    </html>
  );
}
