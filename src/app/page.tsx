import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { Footer } from "@/components/landing/Footer";
import { LandingBackground } from "@/components/landing/LandingBackground";
import { AccountDeletedNotice } from "@/components/landing/AccountDeletedNotice";

export default async function HomePage() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      <LandingBackground />
      {/* The footer is a sibling of <main>, so it stays a contentinfo landmark (A11Y-12). */}
      <main id="main-content" className="flex flex-1 flex-col">
        <AccountDeletedNotice />
        {/* Hero is always in the initial viewport — no content-visibility skip */}
        <HeroSection />
        {/* Below-the-fold sections: skip paint/layout until near viewport (CWV improvement) */}
        <section className="cv-auto">
          <HowItWorks />
        </section>
        <section id="features" className="cv-auto">
          <FeatureGrid />
        </section>
      </main>
      <Footer />
    </div>
  );
}
