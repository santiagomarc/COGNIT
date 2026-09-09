import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { MotionProvider } from "@/components/MotionProvider";
import { Toaster } from "sonner";
import "./globals.css";

/*
 * Design system §3.1. Three faces with hard role assignments (§3.2):
 *
 *   Geist Sans       — all UI chrome, headings, body, buttons, labels
 *   Geist Mono       — every number the user reads as data, and micro-labels
 *   Instrument Serif — the card prompt and answer, and nothing else, ever
 *
 * The serif is the single editorial gesture in an otherwise technical system;
 * its whole job is to make the thing being studied feel unlike the chrome
 * around it. Using it for a page heading destroys that.
 *
 * Orbitron and Poppins are gone: a sci-fi display face was doing the work that
 * weight and tracking should do.
 */
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Cognit - The Universal Active Recall Engine",
  description: "AI-powered study platform that transforms any source material into interactive flashcards with smart grading.",
  keywords: ["flashcards", "spaced repetition", "AI flashcards", "study", "active recall", "PDF to flashcards"],
  authors: [{ name: "Cognit" }],
  creator: "Cognit",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://cognit.app",
    title: "Cognit - The Universal Active Recall Engine",
    description: "AI-powered study platform that transforms any source material into interactive flashcards with smart grading.",
    siteName: "Cognit",
    images: [{
      url: "https://cognit.app/og-image.png",
      width: 1200,
      height: 630,
      alt: "Cognit Dashboard Preview",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Cognit - The Universal Active Recall Engine",
    description: "AI-powered study platform that transforms any source material into interactive flashcards with smart grading.",
    images: ["https://cognit.app/og-image.png"],
    creator: "@cognit",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            /*
             * Runs before first paint to prevent a theme flash (F-10).
             * An explicit stored choice always wins; with no stored value we
             * follow the OS, because light is a first-class theme now and a
             * light-OS visitor was previously shown the wrong one.
             */
            __html: `(function(){try{var t=localStorage.getItem('cognit-theme');var d=t==='dark'||(t!=='light'&&!window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){document.documentElement.classList.add('dark')}})()`,
          }}
        />
      </head>
      <body
        className="antialiased relative min-h-screen bg-background"
      >
        <ThemeProvider>
          <MotionProvider>
            {/* Skip to content link for keyboard users */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-skip)] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
            >
              Skip to content
            </a>

            {children}
            <Toaster
              position="top-center"
              richColors
              toastOptions={{
                className: "sonner-toast",
              }}
            />
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
