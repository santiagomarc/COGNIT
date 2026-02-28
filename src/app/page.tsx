import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { HeroSection } from '@/components/landing/HeroSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { SocialProof } from '@/components/landing/SocialProof';
import { FeatureGrid } from '@/components/landing/FeatureGrid';
import { Footer } from '@/components/landing/Footer';

// This is the LANDING PAGE (root route: /)
// If user is logged in -> send them to dashboard
// If not -> show the marketing/welcome page
export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // If already logged in, skip the landing page
  if (user) {
    redirect('/dashboard');
  }

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