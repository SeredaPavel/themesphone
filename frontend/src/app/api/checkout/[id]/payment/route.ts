import {checkoutPayment} from '@/lib/checkout';
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,ctx:Context){return checkoutPayment(req,(await ctx.params).id);}
export async function GET(req:Request,ctx:Context){return checkoutPayment(req,(await ctx.params).id);}
