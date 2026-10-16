'use client'
import { Instagram, MessageCircleMore, Send } from 'lucide-react'

export default function SocialButtons() {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
      <a
        href="https://t.me/ingasereda"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-xl transition"
      >
        <Send size={20} />
      </a>
      <a
        href="https://wa.me/YOUR_PHONE"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-green-500 hover:bg-green-600 text-white p-3 rounded-full shadow-xl transition"
      >
        <MessageCircleMore size={20} />
      </a>
      <a
        href="https://instagram.com/YOUR_USERNAME"
        target="_blank"
        rel="noopener noreferrer"
        className="bg-pink-500 hover:bg-pink-600 text-white p-3 rounded-full shadow-xl transition"
      >
        <Instagram size={20} />
      </a>
    </div>
  )
}
