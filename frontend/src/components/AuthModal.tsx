// src/components/AuthModal.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  FaApple,
  FaEnvelope,
  FaEye,
  FaEyeSlash,
  FaWandMagicSparkles,
} from 'react-icons/fa6'
import SocialButtons from './auth/SocialButtons'
import FormField from './FormField'
import Link from 'next/link'

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
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

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
    setMessage('')
  }

  const isFormValid =
    email &&
    password &&
    !emailError &&
    (!isRegistering || (confirmPassword && !passwordMismatch && !passwordTooShort))

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    const gen = Array.from(crypto.getRandomValues(new Uint32Array(15)), value => chars[value % chars.length]).join('')
    setPassword(gen)
    setConfirmPassword(gen)
  }

  const handleRegister = async () => {
    try {
      setLoading(true)
      setMessage('')
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setMessageError(true)
        setMessage(data?.error || 'Ошибка регистрации')
        return
      }

      setMessageError(false)
      setMessage('Письмо для подтверждения отправлено. Откройте ссылку в письме, затем войдите в аккаунт.')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setMessageError(true)
      setMessage('Сервис регистрации временно недоступен')
    } finally {
      setLoading(false)
    }
  }

  const buttonStyle =
    'liquid-pill !justify-start w-full'

  const inactiveStyle = 'opacity-60 cursor-not-allowed'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#002b35]/50 backdrop-blur-sm p-4">
      <div role="dialog" aria-modal="true" aria-label={mode === 'select' ? 'Вход в аккаунт' : isRegistering ? 'Регистрация' : 'Вход по Email'} className="form-panel w-full max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto relative">
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
          aria-label={mode === 'email' ? 'Вернуться к способам входа' : 'Закрыть вход'}
          className="absolute top-4 right-4 text-sm hover:opacity-70"
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
              <SocialButtons />
              <button disabled className={`${buttonStyle} ${inactiveStyle}`}>
                <FaApple className="text-xl" />
                Войти через Apple (в разработке)
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
                   setMessage('');
                   const { loginUser } = await import('@/lib/auth');
                   await loginUser(email, password);
                   onClose();
                   const nextUrl = new URL(window.location.href);
                   nextUrl.searchParams.delete('auth');
                   window.location.replace(nextUrl.pathname + nextUrl.search);
                } catch (err: any) {
                  setMessageError(true);
                  setMessage(err.message || 'Не удалось войти');
                } finally {
                  setLoading(false);
                }
               }
            }}

              className="flex flex-col gap-4"
            >
              <FormField
                label="Email"
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              {emailError && <span className="text-sm text-red-500 -mt-3">Некорректный email</span>}

                <FormField
                  label="Пароль"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegistering ? 'new-password' : 'current-password'}
                  required
                  adornment={<>
                {isRegistering && (
                  <button
                    type="button"
                    onClick={generatePassword}
                    aria-label="Сгенерировать пароль"
                    title="Сгенерировать пароль"
                  >
                    <FaWandMagicSparkles size={12} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  {showPassword ? <FaEyeSlash size={12} /> : <FaEye size={12} />}
                </button>
                </>}
                />

              {isRegistering && (
                <>
                  <FormField
                    label="Подтверждение пароля"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Подтверждение пароля"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
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
                {message && <p role="status" className={`form-message ${messageError ? 'form-message--error' : ''}`}>{message}</p>}
                <button type="button" className="text-sm underline self-start" disabled={loading || !email || emailError} onClick={async()=>{
                  setLoading(true); setMessage('');
                  try {
                    const res=await fetch('/api/auth/resend-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
                    const data=await res.json();
                    setMessageError(!res.ok);
                    setMessage(res.ok ? 'Если адрес зарегистрирован и ещё не подтверждён, мы отправили письмо. Проверьте также папку «Спам».' : data.error || 'Не удалось отправить письмо');
                  } catch { setMessageError(true); setMessage('Сервис отправки временно недоступен'); }
                  finally { setLoading(false); }
                }}>Отправить подтверждение повторно</button>
                {!isRegistering && <Link href="/auth/forgot-password" onClick={onClose} className="text-sm underline form-muted mb-2 self-start">Забыли пароль?</Link>}
                <button
                  type="submit"
                  disabled={!isFormValid || loading}
                  className={`liquid-pill liquid-pill--accent ${
                    isFormValid
                      ? ''
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
                    setMessage('')
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
