// src/components/AuthModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import {
  FaApple,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaWandMagicSparkles,
} from 'react-icons/fa6'
import { FaTelegramPlane } from 'react-icons/fa'

export default function AuthModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'select' | 'email'>('select')
  const [isRegistering, setIsRegistering] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailError, setEmailError] = useState(false)
  const [passwordMismatch, setPasswordMismatch] = useState(false)
  const [passwordTooShort, setPasswordTooShort] = useState(false)

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        reset()
        if (mode === 'email') {
          setMode('select')
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [mode, onClose])

  useEffect(() => {
    setEmailError(email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  }, [email])

  useEffect(() => {
    setPasswordMismatch(isRegistering && confirmPassword.length > 0 && password !== confirmPassword)
    setPasswordTooShort(isRegistering && password.length > 0 && password.length < 10)
  }, [password, confirmPassword, isRegistering])

  const reset = () => {
    setIsRegistering(false)
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setPasswordMismatch(false)
    setPasswordTooShort(false)
    setEmailError(false)
  }

  const isFormValid =
    email &&
    password &&
    !emailError &&
    (!isRegistering || (confirmPassword && !passwordMismatch && !passwordTooShort))

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    const gen = Array.from({ length: 15 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    setPassword(gen)
    setConfirmPassword(gen)
  }

  const handleRegister = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        alert(data?.error || 'Ошибка регистрации')
        return
      }

      alert('Письмо для подтверждения отправлено на вашу почту. Пожалуйста подтвердите регистрацию.')
      reset()
      onClose()
    } catch (err) {
      console.error(err)
      alert('Произошла ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  const buttonStyle =
    'flex items-center gap-3 px-4 py-2 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition text-sm'

  const inactiveStyle = 'opacity-60 cursor-not-allowed'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--background)] text-[var(--foreground)] rounded-2xl p-6 w-full max-w-sm shadow-xl relative">
        <button
          onClick={() => {
            if (mode === 'email') {
              setMode('select')
              reset()
            } else {
              onClose()
              reset()
            }
          }}
          className="absolute top-3 right-3 text-sm hover:opacity-70"
        >
          ✕
        </button>

        {mode === 'select' ? (
          <>
            <h2 className="text-xl font-bold mb-4 text-center">Вход в аккаунт</h2>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setMode('email')
                  setIsRegistering(false)
                }}
                className={buttonStyle}
              >
                <FaEnvelope className="text-xl text-gray-500" />
                Войти через Email
              </button>
              <button onClick={() => (window.location.href = '/api/connect/google')} className={buttonStyle}>
                <FcGoogle className="text-xl bg-white rounded-full p-0.5" />
                Войти через Google
              </button>
              <button onClick={() => (window.location.href = '/api/connect/yandex')} className={buttonStyle}>
                <span className="w-6 h-6 flex items-center justify-center rounded-full bg-[#fc3f1d] text-white font-bold text-xs">
                  Y
                </span>
                Войти через Яндекс
              </button>
              <button onClick={() => alert('Авторизация через Apple в разработке')} className={`${buttonStyle} ${inactiveStyle}`}>
                <FaApple className="text-xl" />
                Войти через Apple (в разработке)
              </button>
              <button onClick={() => alert('Авторизация через Telegram в разработке')} className={`${buttonStyle} ${inactiveStyle}`}>
                <FaTelegramPlane className="text-xl text-[#229ED9]" />
                Войти через Telegram (в разработке)
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold mb-4 text-center">{isRegistering ? 'Регистрация' : 'Вход по Email'}</h2>
            <form
              onSubmit={async (e) => {
               e.preventDefault();
               if (isRegistering) {
                await handleRegister();
               } else {
                 try {
                   setLoading(true);
                   const { loginUser } = await import('@/lib/auth');
                   const user = await loginUser(email, password);
                   console.log('✅ Вход выполнен:', user);
                   onClose();
                   window.location.reload();
                } catch (err: any) {
                  alert(err.message);
                } finally {
                  setLoading(false);
                }
               }
            }}

              className="flex flex-col gap-4"
            >
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-4 py-2 border border-[var(--foreground)] rounded-full bg-transparent outline-none"
                required
              />
              {emailError && <span className="text-sm text-red-500 -mt-3">Некорректный email</span>}

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-[var(--foreground)] rounded-full bg-transparent outline-none pr-20"
                  required
                />
                {isRegistering && (
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="absolute right-10 top-1/2 -translate-y-1/2 p-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                    title="Сгенерировать пароль"
                  >
                    <FaWandMagicSparkles size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full border border-[var(--foreground)] hover:bg-[var(--foreground)] hover:text-[var(--background)] transition"
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
                </button>
              </div>

              {isRegistering && (
                <>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Подтверждение пароля"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="px-4 py-2 border border-[var(--foreground)] rounded-full bg-transparent outline-none"
                    required
                  />
                  {passwordMismatch && (
                    <span className="text-sm text-red-500 -mt-3">Пароли не совпадают</span>
                  )}
                  {passwordTooShort && (
                    <span className="text-sm text-red-500 -mt-3">
                      Пароль должен содержать минимум 10 символов
                    </span>
                  )}
                </>
              )}

              <div className="flex flex-col gap-2 mt-2">
                <button
                  type="submit"
                  disabled={!isFormValid || loading}
                  className={`px-4 py-2 rounded-full border border-[var(--foreground)] transition text-sm ${
                    isFormValid
                      ? 'hover:bg-[var(--foreground)] hover:text-[var(--background)]'
                      : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {isRegistering ? (loading ? 'Регистрация...' : 'Зарегистрироваться') : 'Войти'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegistering(!isRegistering)
                    setPassword('')
                    setConfirmPassword('')
                    setPasswordMismatch(false)
                    setPasswordTooShort(false)
                  }}
                  className="text-sm text-center text-gray-500 hover:underline"
                >
                  {isRegistering ? 'Уже есть аккаунт?' : 'Создать аккаунт'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
