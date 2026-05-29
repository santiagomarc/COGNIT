import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { SocialProof } from '@/components/landing/SocialProof';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { Footer } from '@/components/landing/Footer';

export default async function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero is always in the initial viewport — no content-visibility skip */}
      <HeroSection />
      {/* Below-the-fold sections: skip paint/layout until near viewport (CWV improvement) */}
      <section className="cv-auto">
        <HowItWorks />
      </section>
      <section className="cv-auto">
        <SocialProof />
      </section>
      <section id="features" className="cv-auto">
        <FeatureGrid />
      </section>
      <Footer />
    </div>
  );
}