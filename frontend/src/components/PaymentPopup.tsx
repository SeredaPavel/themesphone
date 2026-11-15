'use client';

import AuthPanel,{AuthScreen,AuthStack} from './auth/AuthSurface';

export function PaymentMethods({onPay,enabled=false,pending=false}:{onPay?:()=>void;enabled?:boolean;pending?:boolean}) {
  return <div className="space-y-3" aria-label="Способ оплаты">
    <button type="button" className="auth-button auth-button--primary" disabled={!enabled||pending} onClick={onPay}>
      {pending?'Переходим к оплате…':'ЮKassa'}
    </button>
    <button type="button" className="auth-button" disabled>SberPay (в разработке)</button>
    <button type="button" className="auth-button" disabled>Apple Pay (в разработке)</button>
  </div>;
}

export default function PaymentPopup({isOpen,onClose,onPay,enabled=false}:{isOpen:boolean;onClose:()=>void;onPay:()=>void;enabled?:boolean}) {
  if(!isOpen)return null;
  return <AuthScreen><AuthPanel title="Способ оплаты" dialog onClose={onClose} closeLabel="Закрыть выбор оплаты">
    <AuthStack><PaymentMethods onPay={onPay} enabled={enabled}/><button type="button" className="auth-link" onClick={onClose}>Отмена</button></AuthStack>
  </AuthPanel></AuthScreen>;
}
