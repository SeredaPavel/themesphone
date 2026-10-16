// ✅ src/lib/api.ts

const API_URL = 'http://127.0.0.1:1337/api';

type WallpaperFilters = {
  category?: string;
  device?: string;
};

export async function getWallpapers(filters: WallpaperFilters = {}) {
  const query = new URLSearchParams();
  query.append('populate', '*');

  // фильтрация по категориям (массив, relation many-to-many)
  if (filters.category) {
    query.append('filters[categories][slug][$eq]', filters.category);
  }

  // фильтрация по устройству (один объект, relation many-to-one)
  if (filters.device) {
    query.append('filters[device][slug][$eq]', filters.device);
  }

  const res = await fetch(`${API_URL}/wallpapers?${query.toString()}`);
  if (!res.ok) throw new Error('Ошибка загрузки данных с API');
  const json = await res.json();
  return json.data;
}

export async function getCategories() {
  const res = await fetch(`${API_URL}/categories`);
  if (!res.ok) throw new Error('Ошибка загрузки категорий');
  const json = await res.json();
  return json.data;
}

export async function getDevices() {
  const res = await fetch(`${API_URL}/devices`);
  if (!res.ok) throw new Error('Ошибка загрузки устройств');
  const json = await res.json();
  return json.data;
}
