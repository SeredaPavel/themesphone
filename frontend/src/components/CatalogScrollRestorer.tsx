'use client';

import { useEffect } from 'react';
import { restoreCatalogScroll } from '@/lib/catalog-scroll';

export default function CatalogScrollRestorer({ href }: { href: string }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => restoreCatalogScroll(href));
    return () => cancelAnimationFrame(frame);
  }, [href]);
  return null;
}
