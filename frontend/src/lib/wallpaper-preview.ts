type PreviewCard = { id: string; top: number; bottom: number };

// Cards can be taller than the available screen, particularly with Safari's bars open.
// Compare visibility with the smaller of the card and viewport rather than requiring
// the entire phone to fit before its controls can appear.
export function centeredWallpaper(cards: PreviewCard[], viewportTop: number, viewportBottom: number): string | null {
  const viewportHeight = viewportBottom - viewportTop;
  if (viewportHeight <= 0) return null;
  const viewportCenter = (viewportTop + viewportBottom) / 2;
  let selected: string | null = null;
  let nearest = Infinity;

  for (const card of cards) {
    const height = card.bottom - card.top;
    const visible = Math.min(card.bottom, viewportBottom) - Math.max(card.top, viewportTop);
    if (height <= 0 || visible < Math.min(height, viewportHeight) * 0.55) continue;
    const distance = Math.abs((card.top + card.bottom) / 2 - viewportCenter);
    if (distance < nearest) {
      selected = card.id;
      nearest = distance;
    }
  }
  return selected;
}
