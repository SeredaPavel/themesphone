import {oauthStart} from "@/lib/oauth";
export const POST=(req:Request)=>oauthStart(req,"yandex");
