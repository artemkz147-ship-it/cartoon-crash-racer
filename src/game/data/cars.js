/** 8 unlockable cars with distinct looks + stats (0..1 scale, ~0.7 baseline). */
export const CARS = [
  {
    id: 'kartoshka',
    name: 'Картошка',
    desc: 'Стартовый багги. Самый приятный руль для обучения.',
    color: 0xff4d4d,
    accent: 0xffe566,
    style: 'buggy',
    stats: { speed: 0.8, handling: 0.9, armor: 0.78, weapon: 0.72 },
    unlock: { type: 'start' },
  },
  {
    id: 'zhuk',
    name: 'Жук',
    desc: 'Цепкий руль — король крутых поворотов.',
    color: 0x3dcc6e,
    accent: 0xffee88,
    style: 'coupe',
    stats: { speed: 0.72, handling: 0.95, armor: 0.65, weapon: 0.7 },
    unlock: { type: 'medals', count: 3 },
  },
  {
    id: 'tank',
    name: 'Танчик',
    desc: 'Тяжёлый панцирь. Таранит и не замечает.',
    color: 0x6a7a8a,
    accent: 0xffaa44,
    style: 'tank',
    stats: { speed: 0.62, handling: 0.55, armor: 1.0, weapon: 0.8 },
    unlock: { type: 'cups', count: 2 },
  },
  {
    id: 'raketa',
    name: 'Ракета',
    desc: 'Скорость прежде всего. Держись дороги!',
    color: 0x3d8bff,
    accent: 0xffffff,
    style: 'rocket',
    stats: { speed: 1.0, handling: 0.68, armor: 0.55, weapon: 0.75 },
    unlock: { type: 'medals', count: 8 },
  },
  {
    id: 'monster',
    name: 'Монстр',
    desc: 'Оружейная платформа на колёсах.',
    color: 0x9b59b6,
    accent: 0xff66aa,
    style: 'monster',
    stats: { speed: 0.75, handling: 0.7, armor: 0.7, weapon: 1.0 },
    unlock: { type: 'cups', count: 4 },
  },
  {
    id: 'molniya',
    name: 'Молния',
    desc: 'Быстрый и юркий спорткар.',
    color: 0xffe566,
    accent: 0xff8800,
    style: 'sport',
    stats: { speed: 0.92, handling: 0.9, armor: 0.6, weapon: 0.72 },
    unlock: { type: 'medals', count: 15 },
  },
  {
    id: 'bulldozer',
    name: 'Бульдозер',
    desc: 'Ломает всё. Броня + пушки.',
    color: 0xff8c1a,
    accent: 0x333344,
    style: 'truck',
    stats: { speed: 0.7, handling: 0.6, armor: 0.92, weapon: 0.92 },
    unlock: { type: 'cups', count: 7 },
  },
  {
    id: 'korol',
    name: 'Король Краша',
    desc: 'Финал карьеры. Легенда арены.',
    color: 0xff2244,
    accent: 0xffd700,
    style: 'king',
    stats: { speed: 0.95, handling: 0.88, armor: 0.88, weapon: 0.95 },
    unlock: { type: 'cups', count: 11 },
  },
];

export function getCar(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

export function carUnlocked(car, progress) {
  const u = car.unlock;
  if (u.type === 'start') return true;
  if (u.type === 'medals') return (progress.medals || 0) >= u.count;
  if (u.type === 'cups') return (progress.cupsCleared || 0) >= u.count;
  return false;
}
