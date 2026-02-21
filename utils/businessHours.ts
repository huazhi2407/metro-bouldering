const DAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

/**
 * 從營業時間多行字串中取出「當天」的營業時間（如 "10:00–22:00" 或 "休息"），無則回傳 null
 */
export function getTodayBusinessHours(businessHours: string | undefined): string | null {
  if (!businessHours || typeof businessHours !== 'string') return null;
  const today = DAY_NAMES[new Date().getDay()];
  const lines = businessHours.trim().split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith(today)) {
      const rest = t.slice(today.length).trim();
      return rest || null;
    }
  }
  return null;
}
