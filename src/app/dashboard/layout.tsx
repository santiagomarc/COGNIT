import { DockNav } from '@/components/ui/shared/DockNav';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard - Cognit',
  description: 'Manage your study decks and track your progress.',
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main id="main-content" className="pb-28">
        {children}
      </main>
      <DockNav />
    </>
  );
}
