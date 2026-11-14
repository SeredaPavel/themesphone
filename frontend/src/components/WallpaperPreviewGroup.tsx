'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { centeredWallpaper } from '@/lib/wallpaper-preview';

const ActivePreview = createContext<string | null>(null);
const PREVIEW_DELAY_MS = 200;

export function useWallpaperPreview(id: string) {
  return useContext(ActivePreview) === id;
}

export default function WallpaperPreviewGroup({ children, className }: { children: ReactNode; className: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const group = root.current;
    if (!group) return;
    const touch = window.matchMedia('(hover: none)');
    const viewport = window.visualViewport;
    const pointers = new Set<number>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    function cancel() {
      clearTimeout(timer);
      timer = undefined;
    }

    function schedule() {
      cancel();
      if (!touch.matches || document.hidden || pointers.size > 0) return;
      timer = setTimeout(() => {
        if (!touch.matches || document.hidden || pointers.size > 0 || (viewport?.scale ?? 1) > 1.05) return;
        if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        const top = viewport?.offsetTop ?? 0;
        const height = viewport?.height ?? window.innerHeight;
        const cards = Array.from(group!.querySelectorAll<HTMLElement>('[data-wallpaper-card][data-preview-id]'), card => {
          const bounds = card.getBoundingClientRect();
          return { id: card.dataset.previewId!, top: bounds.top, bottom: bounds.bottom };
        });
        setActive(centeredWallpaper(cards, top, top + height));
      }, PREVIEW_DELAY_MS);
    }

    function restart() {
      setActive(null);
      schedule();
    }

    function pointerDown(event: PointerEvent) {
      if (event.pointerType === 'mouse') return;
      pointers.add(event.pointerId);
      // Keep an already visible button under the finger until a real scroll occurs.
      cancel();
    }

    function pointerEnd(event: PointerEvent) {
      pointers.delete(event.pointerId);
      schedule();
    }

    function blur() {
      pointers.clear();
      cancel();
      setActive(null);
    }

    function visibility() {
      blur();
      if (!document.hidden) schedule();
    }

    const passive = { passive: true };
    window.addEventListener('scroll', restart, passive);
    window.addEventListener('resize', restart, passive);
    viewport?.addEventListener('resize', restart, passive);
    viewport?.addEventListener('scroll', restart, passive);
    window.addEventListener('pointerdown', pointerDown, passive);
    window.addEventListener('pointerup', pointerEnd, passive);
    window.addEventListener('pointercancel', pointerEnd, passive);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', schedule);
    document.addEventListener('visibilitychange', visibility);
    touch.addEventListener('change', restart);
    schedule();

    return () => {
      cancel();
      window.removeEventListener('scroll', restart);
      window.removeEventListener('resize', restart);
      viewport?.removeEventListener('resize', restart);
      viewport?.removeEventListener('scroll', restart);
      window.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', schedule);
      document.removeEventListener('visibilitychange', visibility);
      touch.removeEventListener('change', restart);
    };
  }, []);

  return <ActivePreview.Provider value={active}>
    <div ref={root} className={className} data-wallpaper-grid>{children}</div>
  </ActivePreview.Provider>;
}
