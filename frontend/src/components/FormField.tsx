'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export default function FormField({ label, adornment, id, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string; adornment?: ReactNode }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return <div className="outline-field">
    <label htmlFor={inputId} className="outline-field__label">{label}</label>
    <span className="outline-field__body">
      <input {...input} id={inputId} />
      {adornment && <span className="field-adornment">{adornment}</span>}
    </span>
  </div>;
}
