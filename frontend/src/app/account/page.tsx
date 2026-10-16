// 📄 src/app/account/page.tsx

import { withAuthServer } from '@/lib/with-auth-server'
import ProfileBlock from './ProfileBlock'
import OrdersBlock from './OrdersBlock'
import PasswordBlock from './PasswordBlock'
import SubscribeBlock from './SubscribeBlock'
import TopWallpapersBanner from './TopWallpapersBanner'

export default async function AccountPage() {
  const user = await withAuthServer(async (user) => user, {
    popupRedirect: true,
  })

  return (
    <main className="p-4 sm:p-6 lg:p-8 max-w-[1440px] mx-auto w-full grid gap-6 grid-cols-1 lg:grid-cols-[1fr_2fr] text-[var(--foreground)]">
      {/* Левая колонка */}
      <div className="flex flex-col gap-6">
        <ProfileBlock user={user} />
        <PasswordBlock />
      </div>

      {/* Правая колонка */}
      <div className="flex flex-col gap-6">
        <OrdersBlock />
        <TopWallpapersBanner />
        <SubscribeBlock />
      </div>
    </main>
  )
}
