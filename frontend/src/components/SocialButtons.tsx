'use client'
import { Instagram, MessageCircleMore, Send } from 'lucide-react'

export default function SocialButtons() {
  const channels = [
    { name: 'Telegram', href: 'https://t.me/ingasereda', Icon: Send },
    { name: 'WhatsApp', href: null, Icon: MessageCircleMore },
    { name: 'Instagram', href: null, Icon: Instagram },
  ];
  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 flex flex-col gap-3 z-50">
      {channels.map(({ name, href, Icon }) => href && <a
        key={name}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Связаться в ${name}`}
        title={`Связаться в ${name}`}
        className="liquid-pill !p-3 !bg-[#0a4249e8] hover:!bg-[#285e65]"
      >
        <Icon size={20} aria-hidden="true" />
      </a>)}
    </div>
  )
}
