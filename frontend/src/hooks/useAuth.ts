'use client';
import { useEffect, useState } from 'react';
type User = { id:number; username:string; email:string };
export function useAuth() {
  const [user,setUser] = useState<User|null>(null);
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/me',{cache:'no-store',credentials:'same-origin',signal:controller.signal})
      .then(async res => { const data = res.ok ? await res.json() : null; if(!controller.signal.aborted) setUser(data); })
      .catch(() => { if(!controller.signal.aborted) setUser(null); })
      .finally(() => { if(!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[]);
  return {user,loading,setUser,isAuthenticated:!!user};
}
