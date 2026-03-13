import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { SocialProof } from '@/components/landing/SocialProof';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { Footer } from '@/components/landing/Footer';

export default async function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <HeroSection />
      <HowItWorks />
      <SocialProof />
      <FeatureGrid />
      <Footer />
    </div>
  );
}