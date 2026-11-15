'use strict';
const ORDER='api::shop-order.shop-order',PAYMENT='api::shop-payment.shop-payment',FILE='api::wallpaper-file.wallpaper-file';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function downloadDaysSetting(value=process.env.ORDER_DOWNLOAD_DAYS){
  if(value===undefined||value==='')return 0;
  if(typeof value!=='string'||!/^(0|[1-9]\d{0,3})$/.test(value)||Number(value)>3650)throw Error('Invalid download period');
  return Number(value);
}
function verifiedPaymentMode(row,payment){
  const mode=row.state==='test_paid'?'test':row.state==='paid'?'live':null;
  if(!mode||!payment||payment.state!=='succeeded'||payment.mode!==mode||!payment.providerId||
    payment.requestBody?.metadata?.order_id!==row.reference||payment.requestBody?.metadata?.attempt_id!==payment.attemptId||
    payment.requestBody?.amount?.currency!=='RUB'||payment.requestBody?.amount?.value!==require('./yookassa').amount(Number(row.totalKopecks)))return null;
  return mode;
}
function access(row,payment,item,file,now=Date.now()){
  const denied=status=>({status,expiresAt:null});
  const mode=verifiedPaymentMode(row,payment);
  if(!mode)return denied('payment_required');
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
async function purchasesForUser(strapi,userId,documentIds,trx,{exceptOrder}={}){
  if(!documentIds.length)return [];
  const meta=strapi.db.metadata.get(ORDER),owner=meta.attributes.owner.joinTable;
  const connection=trx||strapi.db.connection,found=new Map();
  // Filter JSON snapshots in PostgreSQL, including purchases beyond the first history page.
  for(let offset=0;;offset+=100){
    const lookup=connection(meta.tableName+' as o')
      .join(owner.name+' as ownership','ownership.'+owner.joinColumn.name,'o.id')
      .where('ownership.'+owner.inverseJoinColumn.name,userId)
      .whereIn('o.'+meta.attributes.state.columnName,['paid','test_paid'])
      .where(function(){for(const id of documentIds)this.orWhereRaw('?? @> ?::jsonb',['o.'+meta.attributes.items.columnName,JSON.stringify([{documentId:id}])]);})
      .orderBy('o.'+meta.attributes.createdAt.columnName,'desc').orderBy('o.id','desc')
      .select('o.id').offset(offset).limit(100);
    if(exceptOrder)lookup.whereNot('o.'+meta.attributes.reference.columnName,exceptOrder);
    const ids=(await lookup).map(row=>row.id);
    if(!ids.length)break;
    const rows=await strapi.db.query(ORDER).findMany({where:{id:{$in:ids},owner:{id:userId}},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    const payments=await strapi.db.query(PAYMENT).findMany({where:{orderReference:{$in:rows.map(row=>row.reference)}}});
    const presented=await presentOrders(strapi,rows);
    for(let index=0;index<rows.length;index++){
      const row=rows[index],payment=payments.find(p=>p.orderReference===row.reference),mode=verifiedPaymentMode(row,payment);
      if(!mode||payment.refunded===true||(mode==='test'&&process.env.YOOKASSA_MODE!=='test'))continue;
      for(const item of presented[index].items){
        if(!documentIds.includes(item.documentId))continue;
        const previous=found.get(item.documentId);
        if(!previous||(previous.download.status!=='available'&&item.download.status==='available'))found.set(item.documentId,{documentId:item.documentId,orderId:row.reference,download:item.download});
      }
    }
    if(ids.length<100||documentIds.every(id=>found.get(id)?.download.status==='available'))break;
  }
  return [...found.values()];
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
module.exports={downloadDaysSetting,verifiedPaymentMode,access,presentOrders,purchasedFile,purchasesForUser};
