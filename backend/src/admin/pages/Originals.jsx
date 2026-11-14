import { useEffect, useState } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import './Originals.css';

const errors = {
  original_already_exists: 'Оригинал уже загружен. Для другого файла создайте новый товар.',
  classification_required: 'Сначала укажите в товаре, бесплатный он или платный, и сохраните.',
  classification_mismatch: 'Бесплатность в черновике и опубликованной версии различается. Сначала опубликуйте выбранную настройку товара, затем загрузите оригинал.',
  unsupported_image: 'Нужен корректный JPEG, PNG или WebP: один кадр, до 40 миллионов пикселей.',
  one_image_required: 'Выберите один JPEG, PNG или WebP размером до 50 МиБ.',
  upload_in_progress: 'Сейчас обрабатывается другой файл. Повторите через несколько секунд.',
  wallpaper_not_found: 'Товар не найден. Обновите список.',
  storage_not_configured: 'Хранилище оригиналов ещё не подключено.',
};
const size = bytes => `${(Number(bytes) / 1024 / 1024).toFixed(2)} МиБ`;

export default function Originals() {
  const { get, post } = useFetchClient();
  const [list, setList] = useState(null), [page, setPage] = useState(1);
  const [search, setSearch] = useState(''), [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null), [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null), [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true; setLoading(true);
    get('/wallpaper-originals', { params: { page, search: query } }).then(response => {
      if (active) setList(response.data);
    }).catch(() => { if (active) setNotice({ error: true, text: 'Не удалось загрузить список. Проверьте доступ и повторите.' }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [get, page, query, revision]);

  function choose(item) { setSelected(item); setFile(null); setNotice(null); }
  async function upload(event) {
    event.preventDefault();
    if (!selected || !file || busy) return;
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) { setNotice({ error: true, text: errors.one_image_required }); return; }
    setBusy(true); setNotice(null);
    try {
      const form = new FormData(); form.append('files', file);
      await post('/wallpaper-originals/' + selected.documentId, form);
      setNotice({ text: 'Оригинал сохранён в закрытом хранилище, превью создано и привязано к товару.' });
      setSelected(null); setFile(null); setRevision(value => value + 1);
    } catch (error) {
      const status = error.response?.status;
      setNotice({ error: true, text: errors[error.response?.data?.error?.code] ||
        (status === 413 ? errors.one_image_required : status === 403 ? 'Нет разрешения на загрузку оригиналов.' :
          'Загрузка не завершена. Проверьте список перед повторной попыткой; если файл уже появился, повторять загрузку не нужно.') });
      setRevision(value => value + 1);
    } finally { setBusy(false); }
  }

  return <main className="tp-originals">
    <header><span className="tp-originals__eyebrow">THEMESPHONE · МАТЕРИАЛЫ</span><h1>Оригиналы обоев</h1>
      <p>Выберите сохранённый товар и загрузите один оригинальный файл. Уменьшенное превью появится автоматически.</p></header>
    <section className="tp-originals__panel">
      <p className="tp-originals__hint">JPEG, PNG или WebP · до 50 МиБ · до 40 миллионов пикселей.<br/>
        Оригиналы загружайте здесь. Обычная медиатека предназначена для публичных изображений.</p>
      {list && !list.storageReady && <p role="status" className="tp-originals__notice tp-originals__notice--error">Хранилище пока не подключено. Загрузка недоступна.</p>}
      <form className="tp-originals__search" onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}>
        <label>Найти товар<input value={search} maxLength={80} onChange={event => setSearch(event.target.value)} placeholder="Название обоев" disabled={busy}/></label>
        <button type="submit" disabled={busy}>Найти</button><button type="button" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}>Обновить</button>
      </form>
      {notice && <p role={notice.error ? 'alert' : 'status'} className={'tp-originals__notice' + (notice.error ? ' tp-originals__notice--error' : '')}>{notice.text}</p>}
      {loading ? <p role="status">Загружаем товары…</p> : <div className="tp-originals__items">{list?.data.map(item => <article key={item.documentId} className={'tp-originals__item' + (selected?.documentId === item.documentId ? ' tp-originals__item--selected' : '')}>
        <div><strong>{item.title}</strong><p>{item.published ? 'Опубликован' : 'Черновик'} · {item.isFree === true ? 'Бесплатный' : item.isFree === false ? 'Платный' : 'Не указана бесплатность'}</p>
          <small>{item.original ? `${item.original.width} × ${item.original.height} · ${size(item.original.bytes)} · ${item.original.mime.replace('image/', '').toUpperCase()}` : item.hasOriginal ? 'Оригинал зарегистрирован; проверьте его состояние' : 'Оригинал ещё не загружен'}</small></div>
        <button type="button" disabled={busy || item.hasOriginal || !list.storageReady || typeof item.isFree !== 'boolean'} onClick={() => choose(item)}>{item.hasOriginal ? 'Загружен' : selected?.documentId === item.documentId ? 'Выбран' : 'Выбрать'}</button>
      </article>)}{list?.data.length === 0 && <p>Товары не найдены. Сначала создайте и сохраните товар в Content Manager.</p>}</div>}
      {list && list.pages > 1 && <nav className="tp-originals__pagination" aria-label="Страницы товаров"><button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>Назад</button><span>{page} / {list.pages}</span><button disabled={busy || page >= list.pages} onClick={() => setPage(page + 1)}>Далее</button></nav>}
    </section>
    {selected && <form className="tp-originals__panel tp-originals__upload" onSubmit={upload}>
      <h2>{selected.title}</h2><p>Оригинал хранится закрыто. Загрузка не публикует черновик и не меняет цену товара.</p>
      <label className="tp-originals__file">Оригинальный файл<input key={selected.documentId} type="file" accept=".jpg,.jpeg,.png,.webp" required disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)}/></label>
      {file && <p>{file.name} · {size(file.size)}</p>}
      <div className="tp-originals__actions"><button type="submit" disabled={busy || !file}>{busy ? 'Сохраняем и создаём превью…' : 'Загрузить оригинал'}</button><button type="button" disabled={busy} onClick={() => setSelected(null)}>Отмена</button></div>
      <p className="tp-originals__hint">Один товар — один оригинал. Для другого оригинала создайте новый товар.</p>
    </form>}
  </main>;
}
