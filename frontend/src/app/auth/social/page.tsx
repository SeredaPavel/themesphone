import {Suspense} from 'react';
import SocialRegistration from '@/components/auth/SocialRegistration';
export default function SocialPage() {return <main className="px-4 py-10"><Suspense fallback={<p>Загрузка…</p>}><SocialRegistration/></Suspense></main>;}
