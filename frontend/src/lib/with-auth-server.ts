// 📄 src/lib/with-auth-server.ts
import { redirect } from 'next/navigation'
import { getUserFromServerCookies } from './auth-server'

export async function withAuthServer<T = void>(
  handler: (user: any) => Promise<T> | T,
  options?: { popupRedirect?: boolean }
): Promise<T | never> {
  const user = await getUserFromServerCookies()

  if (!user) {
    const redirectTo = options?.popupRedirect
      ? '/?auth=popup' // показать попап
      : '/'

    redirect(redirectTo)
  }

  return handler(user)
}
