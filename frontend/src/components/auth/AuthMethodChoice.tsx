'use client';

import { FaApple, FaEnvelope } from 'react-icons/fa6';
import SocialButtons from './SocialButtons';

export default function AuthMethodChoice({ onEmail }: { onEmail: () => void }) {
  return <div className="auth-choice-list">
      <div className="auth-choice-row">
        <div className="auth-choice-row__content"><div className="auth-choice-row__slot">
          <button type="button" onClick={onEmail} className="auth-choice-button">
            <FaEnvelope aria-hidden="true" className="auth-choice-icon" />
            <span>Войти через Email</span>
          </button>
        </div></div>
      </div>
      <SocialButtons variant="glass" />
      <div className="auth-choice-row">
        <div className="auth-choice-row__content"><div className="auth-choice-row__slot">
          <button type="button" disabled className="auth-choice-button" aria-label="Войти через Apple — в разработке">
            <FaApple aria-hidden="true" className="auth-choice-icon" />
            <span className="auth-choice-button__label">Войти через Apple <span className="auth-choice-badge">Скоро</span></span>
          </button>
        </div></div>
      </div>
    </div>;
}
