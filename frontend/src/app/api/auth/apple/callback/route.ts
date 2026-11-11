// Legacy token injection is deliberately disabled.
const gone=()=>Response.json({error:"Этот способ входа больше не поддерживается"},{status:410,headers:{"Cache-Control":"no-store"}});
export {gone as GET,gone as POST};
