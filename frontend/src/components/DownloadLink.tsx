import { Download } from 'lucide-react';
import { downloadHref } from '@/lib/download-links';
import type { OriginalFile } from '@/lib/download-links';

export default function DownloadLink({ file, wallpaper, returnTo, className, tabIndex }: {
  file: OriginalFile; wallpaper: string; returnTo?: string | null; className?: string; tabIndex?: number;
}) {
  const href = downloadHref(file, wallpaper, returnTo);
  if (!href) return null;
  // Content-Disposition starts a native download; errors navigate to a styled page.
  return <a href={href} className={className} tabIndex={tabIndex}><Download size={13} aria-hidden="true" />Загрузить</a>;
}
