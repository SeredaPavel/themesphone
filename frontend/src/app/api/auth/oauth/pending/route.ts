import {oauthAction} from '@/lib/oauth';
export const GET=(req:Request)=>oauthAction(req,'pending');
