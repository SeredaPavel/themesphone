import {oauthAction} from '@/lib/oauth';
export const POST=(req:Request)=>oauthAction(req,'register');
