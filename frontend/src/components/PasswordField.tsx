'use client';
import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import FormField from './FormField';

export default function PasswordField({label,...input}:InputHTMLAttributes<HTMLInputElement>&{label:string}) {
  const [visible,setVisible]=useState(false);
  return <FormField {...input} label={label} type={visible?'text':'password'} adornment={
    <button type="button" aria-label={`${visible?'Скрыть':'Показать'}: ${label}`} aria-pressed={visible} onClick={()=>setVisible(!visible)}>
      {visible?<EyeOff size={16}/>:<Eye size={16}/>}
    </button>
  }/>;
}
