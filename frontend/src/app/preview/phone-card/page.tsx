import {notFound} from 'next/navigation';
import Link from 'next/link';
import {getWallpaperPage} from '@/lib/api';
import {getWallpaperImageUrl} from '@/lib/wallpaper.server';
import PhoneCardPrototype from './PhoneCardPrototype';
import styles from './phone-card.module.css';

export const dynamic='force-dynamic';
export const metadata={title:'Примерка обоев · ThemesPhone',robots:{index:false,follow:false}};

export default async function PhoneCardPreview() {
  if(process.env.NODE_ENV!=='development')notFound();
  let product;
  try {
    const catalogue=await getWallpaperPage({category:'',device:'iphone',q:'',sort:'default',page:1});
    product=catalogue.data.find(item=>item.image?.some(image=>getWallpaperImageUrl(image.url)));
  } catch { /* The isolated preview keeps a readable state when the local CMS is offline. */ }
  const image=product?.image?.map(item=>getWallpaperImageUrl(item.url)).find(Boolean);
  if(!product || !image)return <section className={styles.unavailable}>
    <h1>Примерка обоев</h1>
    <p>Для прототипа нужны обои с изображением в категории iPhone. Проверьте доступность локального каталога.</p>
    <Link className="liquid-pill" href="/">Открыть каталог</Link>
  </section>;
  return <PhoneCardPrototype product={{
    title:product.title,imageUrl:image,
    category:product.categories?.[0]?.title || 'Обои',
    price:product.isFree?'Бесплатно':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(Number(product.price) || 0),
  }} />;
}
