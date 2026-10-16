// src/app/layout.tsx
import './globals.css'
import Header from '@/components/Header'
import SocialButtons from '@/components/SocialButtons'
import { CartProvider } from '@/context/CartContext'
import { AuthProvider } from '@/context/AuthContext'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <CartProvider>
          <AuthProvider>
            <Header />
            <main>{children}</main>
            <SocialButtons />
          </AuthProvider>
        </CartProvider>
      </body>
    </html>
  )
}
