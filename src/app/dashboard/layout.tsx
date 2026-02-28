import { DockNav } from '@/components/ui/shared/DockNav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <main id="main-content">
        {children}
      </main>
      <DockNav />
    </>
  );
}
