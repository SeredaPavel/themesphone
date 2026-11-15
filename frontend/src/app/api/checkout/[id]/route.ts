import {getCheckout,cancelCheckout} from '@/lib/checkout';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){return getCheckout(req,(await context.params).id);}
export async function POST(req:Request,context:Context){return cancelCheckout(req,(await context.params).id);}
