import {Download} from 'lucide-react';
import type {OrderDownload as DownloadInfo} from '@/lib/checkout';
const messages:Record<string,string>={payment_required:'Скачивание после оплаты',test_purchase:'Тестовая покупка — оригинал закрыт',download_expired:'Срок скачивания истёк',file_unavailable:'Файл временно недоступен',access_revoked:'Доступ к файлу прекращён'};
export default function OrderDownload({order,wallpaper,download}:{order:string;wallpaper:string;download?:DownloadInfo}){
  if(!download)return null;
  return <div className="mt-2 space-y-1">
    {download.status==='available'&&download.fileId?<a className="liquid-pill inline-flex gap-2 text-sm" href={'/api/download?'+new URLSearchParams({file:download.fileId,order,wallpaper})}><Download size={15} aria-hidden="true"/>Скачать оригинал</a>:<p className="text-xs opacity-75">{messages[download.status]}</p>}
    {download.expiresAt&&<p className="text-xs opacity-75">{download.status==='download_expired'?'Срок закончился':'Повторная загрузка до'} {new Date(download.expiresAt).toLocaleString('ru-RU')}</p>}
    {download.status==='available'&&!download.expiresAt&&<p className="text-xs opacity-75">Повторная загрузка без ограничения срока</p>}
  </div>;
}
