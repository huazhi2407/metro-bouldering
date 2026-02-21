/**
 * Station ID 綁定：SVG 地圖上的車站座標
 * - id 必須與 gyms.json 的 key 一致，供 React 狀態與 JSON 查詢使用
 * - (x, y) 為 SVG viewBox 座標系（0 0 5669.29 8589.84）
 */
import type { StationBinding } from '@/types';

const R = 120; // 可點擊半徑（viewBox 單位）

export const stationBindings: StationBinding[] = [
  { id: '港墘站', name: '港墘站', x: 4160, y: 3185, r: R },
  { id: '明德站', name: '明德站', x: 2307, y: 2431, r: R },
  { id: '芝山站', name: '芝山站', x: 2299, y: 2799, r: R },
  { id: '劍潭站', name: '劍潭站', x: 2290, y: 3325, r: R },
  { id: '雙連站', name: '雙連站', x: 2316, y: 4270, r: R },
  { id: '忠孝新生站', name: '忠孝新生站', x: 2938, y: 4875, r: R },
  { id: '龍山寺站', name: '龍山寺站', x: 1335, y: 5339, r: R },
  { id: '昆陽站', name: '昆陽站', x: 4770, y: 4685, r: R },
  { id: '南港站', name: '南港站', x: 5111, y: 4694, r: R },
  { id: '南港展覽館站', name: '南港展覽館站', x: 5628, y: 4589, r: R },
  { id: '頭前庄站', name: '頭前庄站', x: 914, y: 5015, r: R },
  { id: '中和站', name: '中和站', x: 1677, y: 6750, r: R },
  { id: '七張站', name: '七張站', x: 3157, y: 7321, r: R },
];
