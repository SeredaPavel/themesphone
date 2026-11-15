// src/app/layout.tsx
import './globals.css'
import Header from '@/components/Header'
import SocialButtons from '@/components/SocialButtons'
import { CartProvider } from '@/context/CartContext'
import { AuthProvider } from '@/context/AuthContext'
import { Suspense } from 'react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <AuthProvider>
          <CartProvider>
            <Suspense fallback={null}>
              <Header />
            </Suspense>
            <main>{children}</main>
            <SocialButtons />
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
