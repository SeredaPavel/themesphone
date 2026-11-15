'use strict';
const ORDER='api::shop-order.shop-order',PAYMENT='api::shop-payment.shop-payment',FILE='api::wallpaper-file.wallpaper-file';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function downloadDaysSetting(value=process.env.ORDER_DOWNLOAD_DAYS){
  if(value===undefined||value==='')return 0;
  if(typeof value!=='string'||!/^(0|[1-9]\d{0,3})$/.test(value)||Number(value)>3650)throw Error('Invalid download period');
  return Number(value);
}
function access(row,payment,item,file,now=Date.now()){
  const denied=status=>({status,expiresAt:null});
  const mode=row.state==='test_paid'?'test':row.state==='paid'?'live':null;
  if(!mode||!payment||payment.state!=='succeeded'||payment.mode!==mode||!payment.providerId||
    payment.requestBody?.metadata?.order_id!==row.reference||payment.requestBody?.metadata?.attempt_id!==payment.attemptId||
    payment.requestBody?.amount?.currency!=='RUB'||payment.requestBody?.amount?.value!==require('./yookassa').amount(Number(row.totalKopecks)))return denied('payment_required');
  if(payment.refunded===true)return denied('access_revoked');
  if(!file||file.ready!==true||file.documentId!==item.originalFileId||file.wallpaperDocumentId!==item.documentId)return denied('file_unavailable');
  // Test payments may unlock only an original explicitly marked as a test file by the admin.
  if((mode==='test')!==(file.testOnly===true))return denied('test_purchase');
  const days=row.downloadDays==null?0:Number(row.downloadDays);
  const paidAt=new Date(row.paidAt||payment.checkedAt).getTime();
  if(!Number.isInteger(days)||days<0||days>3650||(days>0&&!Number.isFinite(paidAt)))return denied('file_unavailable');
  const expiresAt=days>0?new Date(paidAt+days*86400000).toISOString():null;
  if(expiresAt&&Date.parse(expiresAt)<=now)return {status:'download_expired',expiresAt};
  return {status:'available',expiresAt,fileId:file.documentId};
}
async function presentOrders(strapi,rows){
  const {publicOrder}=require('./shop-orders');
  if(!rows.length)return [];
  const references=rows.map(row=>row.reference);
  const fileIds=Array.from(new Set(rows.flatMap(row=>row.items.map(item=>item.originalFileId).filter(Boolean))));
  const [payments,files]=await Promise.all([
    strapi.db.query(PAYMENT).findMany({where:{orderReference:{$in:references}}}),
    fileIds.length?strapi.db.query(FILE).findMany({where:{documentId:{$in:fileIds}}}):[],
  ]);
  return rows.map(row=>{
    const dto=publicOrder(row),payment=payments.find(p=>p.orderReference===row.reference);
    return {...dto,items:dto.items.map((item,index)=>({...item,download:access(row,payment,row.items[index],files.find(file=>file.documentId===row.items[index].originalFileId))}))};
  });
}
async function purchasedFile(strapi,userId,reference,file){
  if(!Number.isInteger(userId)||userId<=0||typeof reference!=='string'||!UUID.test(reference))return {status:'payment_required'};
  const user=await strapi.db.query('plugin::users-permissions.user').findOne({where:{id:userId},select:['id','confirmed','blocked','mergedIntoUserId']});
  if(!user||user.confirmed!==true||user.blocked||user.mergedIntoUserId)return {status:'payment_required'};
  const row=await strapi.db.query(ORDER).findOne({where:{reference,owner:{id:userId}}});
  const item=row?.items?.find(item=>item.originalFileId===file.documentId&&item.documentId===file.wallpaperDocumentId);
  if(!item)return {status:'payment_required'};
  const payment=await strapi.db.query(PAYMENT).findOne({where:{orderReference:reference}});
  return {...access(row,payment,item,file),title:item.title};
}
module.exports={downloadDaysSetting,access,presentOrders,purchasedFile};
