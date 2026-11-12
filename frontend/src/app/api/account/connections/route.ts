import {oauthAction} from '@/lib/oauth';
export const GET=(req:Request)=>oauthAction(req,'connections');
export const POST=(req:Request)=>oauthAction(req,'account');
