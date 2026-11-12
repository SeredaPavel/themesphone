'use client';

import { Children, isValidElement, useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export function AuthScreen({ children }: { children: ReactNode }) {
  return <div className="auth-screen">{children}</div>;
}

export default function AuthPanel({ title, children, variant = 'form', dialog = false, onClose, closeLabel = 'Закрыть вход' }: {
  title: string;
  children: ReactNode;
  variant?: 'choice' | 'form';
  dialog?: boolean;
  onClose?: () => void;
  closeLabel?: string;
}) {
  const titleId = useId();
  const Heading = dialog ? 'h2' : 'h1';
  return <section className={`auth-surface auth-surface--${variant}${variant === 'choice' ? ' auth-choice-panel' : ''}`}
    role={dialog ? 'dialog' : undefined} aria-modal={dialog || undefined} aria-labelledby={titleId}>
    {onClose && <button type="button" onClick={onClose} aria-label={closeLabel} className="auth-close">✕</button>}
    <Heading id={titleId} className="auth-title">{title}</Heading>
    {children}
  </section>;
}

export function AuthStack({ children }: { children: ReactNode }) {
  return <div className="auth-stack">{Children.toArray(children).filter(child => child !== '').map((child, index) => (
    <div key={isValidElement(child) ? child.key ?? index : index} className="auth-reveal"
      style={{ '--auth-choice-order': index } as CSSProperties}>
      <div className="auth-reveal__content"><div className="auth-reveal__slot">{child}</div></div>
    </div>
  ))}</div>;
}

export function AuthNotice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'success' | 'error' }) {
  return <p role={kind === 'error' ? 'alert' : 'status'} className={`auth-notice auth-notice--${kind}`}>{children}</p>;
}
