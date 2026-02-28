'use client';

import { PageTransition } from '@/components/motion';
import type { ReactNode } from 'react';

export default function DashboardTemplate({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
