type PublicUser = { id: number; username: string; email: string|null; confirmed: boolean; firstname?:string; lastname?:string; phone?:string; billingAddress?:string };

function json(body: unknown, status = 200, cookie?: string) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}
function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const configured = [process.env.FRONTEND_URL, ...(process.env.AUTH_ALLOWED_ORIGINS || '').split(',')].filter(Boolean);
  return origin === new URL(req.url).origin || configured.some(value => {
    try { return origin === new URL(value!.trim()).origin; } catch { return false; }
  });
}
export function sessionCookie(token: string, clear = false) {
  const local = process.env.FRONTEND_URL && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(process.env.FRONTEND_URL);
  const secure = process.env.NODE_ENV === 'production' && !local;
  return 'token=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (clear ? 0 : 604800) + (secure ? '; Secure' : '');
}
function publicUser(user: any): PublicUser {
  if (!user || !Number.isInteger(user.id) || (user.email!=null && typeof user.email !== 'string') || user.blocked || user.confirmed !== true) throw new Error('Invalid user');
  const result: PublicUser = { id: user.id, username: user.username, email: user.email || null, confirmed: true };
  for (const key of ['firstname','lastname','phone','billingAddress'] as const) if (typeof user[key] === 'string') result[key] = user[key];
  return result;
}
async function body(req: Request) {
  const text = await req.text();
  if (text.length > 16384) throw new Error('Invalid body');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
  return value;
}
async function cms(route: string, options: RequestInit = {}) {
  if (!process.env.STRAPI_API_URL) throw new Error('CMS is not configured');
  return fetch(process.env.STRAPI_API_URL.replace(/\/$/, '') + '/api/' + route, { ...options, cache:'no-store', signal:AbortSignal.timeout(10000), redirect:'manual' });
}
export async function login(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.identifier !== 'string' || !input.identifier.trim() || input.identifier.length > 254 || typeof input.password !== 'string' || !input.password || input.password.length > 256) return json({error:'Введите email и пароль'},400);
  try {
    const res = await cms('auth/local', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:input.identifier.trim(),password:input.password})});
    const data = await res.json();
    if (!res.ok) {
      const unconfirmed = data?.error?.message === 'Your account email is not confirmed';
      return json({error:unconfirmed ? 'Сначала подтвердите email по ссылке в письме' : 'Неверный email или пароль'},res.status >= 500 ? 503 : 401);
    }
    if (typeof data.jwt !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.jwt)) throw new Error('Invalid session');
    return json({user:publicUser(data.user)},200,sessionCookie(data.jwt));
  } catch { return json({error:'Сервис входа временно недоступен'},503); }
}
export async function register(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || typeof input.password !== 'string' || input.password.length < 10 || input.password.length > 256) return json({error:'Укажите корректный email и пароль от 10 до 256 символов'},400);
  const email = input.email.trim().toLowerCase();
  try {
    const res = await cms('auth/local/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:email,email,password:input.password})});
    if (!res.ok) {
      const result = await res.json().catch(()=>null);
      const mailFailed = /error sending confirmation email/i.test(result?.error?.message || '');
      return json({error:mailFailed ? 'Аккаунт создан, но письмо не отправлено. Попробуйте отправить подтверждение повторно.' : res.status >= 500 ? 'Сервис регистрации временно недоступен' : 'Регистрация не выполнена. Если аккаунт уже существует, войдите или повторно запросите подтверждение.',canResend:true},res.status === 429 ? 429 : mailFailed || res.status >= 500 ? 503 : 400);
    }
    return json({success:true});
  } catch { return json({error:'Сервис регистрации временно недоступен'},503); }
}
export async function resendConfirmation(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return json({error:'Укажите корректный email'},400);
  try {
    const res = await cms('auth/send-email-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.email.trim().toLowerCase()})});
    if(res.status === 429) return json({error:'Слишком много попыток. Повторите позже'},429);
    if(res.status >= 500) return json({error:'Не удалось отправить письмо. Повторите позже'},503);
    // Do not reveal whether an account exists or has already been confirmed.
    return json({success:true});
  } catch { return json({error:'Сервис отправки временно недоступен'},503); }
}
export async function confirmEmail(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.confirmation !== 'string' || !/^[a-f0-9]{40}$/.test(input.confirmation)) return json({error:'Некорректная ссылка подтверждения'},400);
  try {
    // Strapi 5 confirms via GET and returns a redirect; never follow it on the server.
    const res = await cms('auth/email-confirmation?confirmation=' + encodeURIComponent(input.confirmation));
    if (res.status !== 302 && res.status !== 303) return json({error:'Ссылка недействительна или уже использована'},res.status >= 500 ? 503 : 400);
    return json({success:true});
  } catch { return json({error:'Сервис подтверждения временно недоступен'},503); }
}
export async function me(req: Request) {
  let token;
  try { token = decodeURIComponent(req.headers.get('cookie')?.match(/(?:^|;\s*)token=([^;]+)/)?.[1] || ''); } catch { return json({error:'Требуется вход'},401); }
  if (!token) return json({error:'Требуется вход'},401);
  try {
    const res = await cms('users/me',{headers:{Authorization:'Bearer '+token}});
    if (!res.ok) return json({error:'Требуется вход'},res.status >= 500 ? 503 : 401);
    return json(publicUser(await res.json()));
  } catch { return json({error:'Не удалось проверить сессию'},503); }
}
export async function logout(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  return json({success:true},200,sessionCookie('',true));
}

function tokenFrom(req: Request) {
  try { return decodeURIComponent(req.headers.get('cookie')?.match(/(?:^|;\s*)token=([^;]+)/)?.[1] || ''); } catch { return ''; }
}
function validPassword(value: unknown): value is string { return typeof value === 'string' && value.length >= 10 && value.length <= 256; }
export async function forgotPassword(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return json({error:'Укажите корректный email'},400);
  try {
    const res = await cms('auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:input.email.trim().toLowerCase()})});
    if (res.status === 429) return json({error:'Слишком много попыток. Повторите позже'},429);
    if (!res.ok) return json({error:'Не удалось отправить письмо. Повторите позже'},503);
    // Same response for existing and unknown accounts.
    return json({success:true});
  } catch { return json({error:'Сервис временно недоступен'},503); }
}
export async function resetPassword(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.code !== 'string' || !/^[a-f0-9]{128}$/.test(input.code)) return json({error:'Некорректная ссылка восстановления'},400);
  if (!validPassword(input.password) || input.password !== input.passwordConfirmation) return json({error:'Пароли должны совпадать и содержать от 10 до 256 символов'},400);
  try {
    const res = await cms('auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:input.code,password:input.password,passwordConfirmation:input.passwordConfirmation})});
    if (!res.ok) return json({error:res.status===429?'Слишком много попыток. Повторите позже':'Ссылка недействительна, просрочена или уже использована'},res.status===429?429:res.status>=500?503:400);
    // Never expose Strapi's JWT or sign in automatically after recovery.
    return json({success:true},200,sessionCookie('',true));
  } catch { return json({error:'Сервис временно недоступен'},503); }
}
export async function changePassword(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  const token=tokenFrom(req);
  if (!token) return json({error:'Требуется вход'},401);
  let input;
  try { input = await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  if (typeof input.currentPassword !== 'string' || !input.currentPassword || input.currentPassword.length>256 || !validPassword(input.password) || input.password!==input.passwordConfirmation || input.currentPassword===input.password) return json({error:'Проверьте текущий пароль и повтор нового. Новый пароль должен отличаться и содержать от 10 до 256 символов'},400);
  try {
    const res = await cms('auth/change-password',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({currentPassword:input.currentPassword,password:input.password,passwordConfirmation:input.passwordConfirmation})});
    if (!res.ok) return json({error:res.status===429?'Слишком много попыток. Повторите позже':res.status===401?'Сессия истекла. Войдите снова':'Не удалось сменить пароль. Проверьте текущий пароль'},res.status===429?429:res.status>=500?503:res.status===401?401:400);
    const data=await res.json();
    if (typeof data.jwt!=='string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.jwt)) throw new Error('Invalid session');
    return json({success:true,user:publicUser(data.user)},200,sessionCookie(data.jwt));
  } catch { return json({error:'Сервис временно недоступен'},503); }
}
export async function updateProfile(req: Request) {
  if (!sameOrigin(req)) return json({error:'Недопустимый источник запроса'},403);
  const token=tokenFrom(req);
  if (!token) return json({error:'Требуется вход'},401);
  let input;
  try { input=await body(req); } catch { return json({error:'Некорректный запрос'},400); }
  const limits:Record<string,number>={firstname:80,lastname:80,phone:32,billingAddress:300};
  if (!Object.keys(input).length || Object.keys(input).some(key=>!Object.hasOwn(limits,key))) return json({error:'Недопустимые поля профиля'},400);
  const data:Record<string,string>={};
  for(const [key,value] of Object.entries(input)) {
    if(typeof value!=='string' || value.trim().length>limits[key] || /[\u0000-\u001f\u007f]/.test(value)) return json({error:'Проверьте длину и содержимое полей'},400);
    data[key]=value.trim();
  }
  if(data.phone && (!/^[+\d() .-]{3,32}$/.test(data.phone) || data.phone.replace(/\D/g,'').length<3)) return json({error:'Проверьте номер телефона'},400);
  try {
    const res=await cms('account/profile',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data)});
    if(!res.ok) return json({error:res.status===401?'Сессия истекла. Войдите снова':'Не удалось сохранить профиль'},res.status===401?401:res.status>=500?503:400);
    return json({user:publicUser(await res.json())});
  } catch { return json({error:'Сервис временно недоступен'},503); }
}
