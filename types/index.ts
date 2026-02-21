/**
 * 架構：SVG 地圖結構 → Station ID 綁定 → JSON 抱石館資料 → React 狀態
 */

/** 抱石館資料（與 gyms.json 結構一致） */
export interface Gym {
  name: string;
  address: string;
  bestExit: string;
  walkingTime: string;
  website: string;
  googleMapLink: string;
  phone?: string;
  /** 營業時間（多行字串） */
  businessHours?: string;
}

/** 抱石館 JSON：以 stationId 為 key */
export interface GymsByStation {
  [stationId: string]: Gym[];
}

/** 車站綁定：對應 SVG 地圖上的座標，用於點擊層 */
export interface StationBinding {
  id: string;
  name: string;
  x: number;
  y: number;
  r?: number;
}

/** 台北捷運 SVG 地圖的 viewBox（與 public/R 18.svg 一致） */
export const METRO_MAP_VIEWBOX = {
  width: 5669.29,
  height: 8589.84,
} as const;

/** 可選用的圖檔（放在 public/map-assets/，在此註冊） */
export interface AvailableMapAsset {
  id: string;
  src: string;
  label: string;
}

/** 放置在地圖上的圖片層 */
export interface MapLayerImage {
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 放置在地圖上的文字層（可移動、可調字級） */
export interface MapLayerText {
  id: string;
  content: string;
  x: number;
  y: number;
  fontSize: number;
}
