import {oauthCallback} from "@/lib/oauth";
export const GET=(req:Request)=>oauthCallback(req,"telegram");
