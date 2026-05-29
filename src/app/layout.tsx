import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { Orbitron } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
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
    <html lang="en" suppressHydrationWarning className={`${poppins.variable} ${orbitron.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cognit-theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className="antialiased relative min-h-screen bg-background"
      >
        <ThemeProvider>
          {/* Skip to content link for keyboard users */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
          >
            Skip to content
          </a>

          {/* Grain texture overlay for premium feel */}
          <div className="grain-overlay" aria-hidden="true" />

          {/* Subtle animated gradient background orbs.
             Uses .bg-orb-pulse instead of Tailwind animate-pulse so the
             CSS prefers-reduced-motion guard in globals.css can disable
             them before JS hydration. */}
          <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="bg-orb-pulse absolute -left-40 -top-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl [animation-delay:0s]" />
            <div className="bg-orb-pulse absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-neon/5 blur-3xl [animation-delay:2s]" />
            <div className="bg-orb-pulse absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[3%] blur-3xl [animation-delay:4s]" />
          </div>

          {children}
          <Toaster
            position="top-center"
            richColors
            toastOptions={{
              className: "sonner-toast",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
