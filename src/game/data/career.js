/**
 * 12 career cups across 8 tracks.
 * Unlock next by finishing top-N (needPlace).
 */
export const CAREER_CUPS = [
  { id: 'cup01', name: 'Кубок Новичка', trackId: 'city', laps: 2, ai: 3, difficulty: 0.55, needPlace: 3, reward: 'Городской овал — разминка' },
  { id: 'cup02', name: 'Пустынный кубок', trackId: 'desert', laps: 3, ai: 4, difficulty: 0.6, needPlace: 3, reward: 'Жара, масло и баррели' },
  { id: 'cup03', name: 'Снежный спринт', trackId: 'snow', laps: 3, ai: 4, difficulty: 0.65, needPlace: 3, reward: 'Скользко — держи руль' },
  { id: 'cup04', name: 'Заводской хаос', trackId: 'factory', laps: 3, ai: 5, difficulty: 0.7, needPlace: 3, reward: 'Восьмёрка среди цехов' },
  { id: 'cup05', name: 'Стадионный гром', trackId: 'stadium', laps: 3, ai: 5, difficulty: 0.72, needPlace: 2, reward: 'Широкая арена под рев трибун' },
  { id: 'cup06', name: 'Лесная петля', trackId: 'forest', laps: 3, ai: 5, difficulty: 0.75, needPlace: 2, reward: 'Узкая трасса между ёлками' },
  { id: 'cup07', name: 'Доки и краны', trackId: 'docks', laps: 3, ai: 5, difficulty: 0.78, needPlace: 2, reward: 'Прямоугольный порт' },
  { id: 'cup08', name: 'Лавовый кубок', trackId: 'volcano', laps: 3, ai: 6, difficulty: 0.82, needPlace: 2, reward: 'Вулкан — не упади в лаву!' },
  { id: 'cup09', name: 'Город ночью', trackId: 'city', laps: 4, ai: 6, difficulty: 0.85, needPlace: 2, desc: 'Повтор города на хардкоре' },
  { id: 'cup10', name: 'Двойная пустыня', trackId: 'desert', laps: 4, ai: 6, difficulty: 0.88, needPlace: 2, desc: 'Длинная жара' },
  { id: 'cup11', name: 'Фабрика смерти', trackId: 'factory', laps: 4, ai: 6, difficulty: 0.92, needPlace: 2, desc: 'Восьмёрка без жалости' },
  { id: 'cup12', name: 'Король вулкана', trackId: 'volcano', laps: 4, ai: 7, difficulty: 1.0, needPlace: 1, desc: 'Финал карьеры — только золото' },
];

export const DERBY_ARENAS = [
  { id: 'derby_stadium', name: 'Дерби: Стадион', trackId: 'derby_stadium', ai: 6, difficulty: 0.8 },
  { id: 'derby_pit', name: 'Дерби: Яма', trackId: 'derby_pit', ai: 7, difficulty: 0.9 },
];

/** Medal from place + destruction score (0..100+). */
export function calcMedal(place, destructionScore, needPlace) {
  if (place > needPlace) return null;
  const destBonus = destructionScore >= 80 ? 1 : destructionScore >= 40 ? 0 : -1;
  if (place === 1 && destBonus >= 0) return 'gold';
  if (place === 1) return 'silver';
  if (place <= 2 && destBonus >= 0) return 'silver';
  if (place <= needPlace) return 'bronze';
  return null;
}

export function medalRank(m) {
  return m === 'gold' ? 3 : m === 'silver' ? 2 : m === 'bronze' ? 1 : 0;
}

export function medalLabel(m) {
  return m === 'gold' ? '🥇 Золото' : m === 'silver' ? '🥈 Серебро' : m === 'bronze' ? '🥉 Бронза' : '—';
}
