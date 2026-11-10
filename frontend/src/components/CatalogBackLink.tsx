'use client';

import Link from 'next/link';
import { requestCatalogScroll } from '@/lib/catalog-scroll';

export default function CatalogBackLink({ href, restoreScroll = false, className, children = 'Назад', onNavigate }: {
  href: string; restoreScroll?: boolean; className?: string; children?: React.ReactNode; onNavigate?: () => void;
}) {
  return <Link href={href} scroll={!restoreScroll} className={className} onClick={() => {
    if (restoreScroll) requestCatalogScroll(href);
    onNavigate?.();
  }}>{children}</Link>;
}
