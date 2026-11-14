import Link from 'next/link';
import AuthPanel, { AuthNotice, AuthStack } from '@/components/auth/AuthSurface';
import { downloadReturn } from '@/lib/download-links';

export const metadata = { title: 'Скачивание — ThemesPhone', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function DownloadErrorPage({ searchParams }: {
  searchParams: Promise<{ reason?: string; wallpaper?: string; from?: string }>;
}) {
  const params = await searchParams;
  const message = params.reason === 'payment_required'
    ? 'Этот оригинал доступен после покупки. Оплата пока готовится к запуску.'
    : params.reason === 'file_unavailable'
      ? 'Оригинал пока недоступен. Вернитесь к обоям или выберите другой файл.'
      : 'Не удалось начать скачивание. Пожалуйста, попробуйте немного позже.';
  return <div className="min-h-[70dvh] grid place-items-center p-4">
    <AuthPanel title="Скачивание обоев"><AuthStack>
      <AuthNotice kind="error">{message}</AuthNotice>
      <Link className="auth-button auth-button--primary" href={downloadReturn(params.wallpaper, params.from)}>Вернуться к обоям</Link>
    </AuthStack></AuthPanel>
  </div>;
}
