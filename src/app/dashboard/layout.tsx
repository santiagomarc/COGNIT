import { DockNav } from '@/components/ui/shared/DockNav';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <DockNav />
    </>
  );
}
