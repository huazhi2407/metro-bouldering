# 台北捷運攀岩場地圖

這是一個 Next.js TypeScript 應用程式，顯示台北捷運路線圖，並允許使用者點擊車站查看附近的攀岩場資訊。

## 功能特色

- 🗺️ 互動式台北捷運 SVG 地圖
- 🎯 可點擊的車站標記
- 🧗 顯示每個車站附近的攀岩場資訊
- 🔐 管理員權限：僅管理員可調整車站與店名點擊區，其他人僅能瀏覽與點擊
- 📱 響應式設計，支援桌面和行動裝置
- 🎨 使用 Tailwind CSS 進行樣式設計

## 技術棧

- **Next.js 16** - React 框架
- **TypeScript** - 型別安全
- **Tailwind CSS** - 樣式設計
- **SVG** - 地圖渲染

## 開始使用

### 安裝依賴

```bash
npm install
```

### 管理員密碼（可選）

僅管理員可「調整車站」與「調整店名點擊區」；一般使用者只能看圖、點擊與搜尋。設定方式：

1. 複製 `.env.example` 為 `.env.local`
2. 在 `.env.local` 中設定 `NEXT_PUBLIC_ADMIN_PASSWORD=你的密碼`
3. 重啟 `npm run dev` 後，點「管理員登入」輸入密碼即可

### 開發模式

```bash
npm run dev
```

應用程式將在 [http://localhost:3000](http://localhost:3000) 啟動。

### 建置生產版本

```bash
npm run build
npm start
```

### 網頁版部署

本專案為標準 Next.js 應用，可部署至：

- **Vercel**：連動 GitHub 後一鍵部署，或使用 Vercel CLI
- **其他平台**：執行 `npm run build` 後以 `npm start` 或輸出為靜態站台（依需求設定）

部署後即為網頁版，所有人可透過網址使用；**標籤共用**需依下方設定 Supabase。

### 共用標籤（Supabase）

店家的標籤可改為「大家共用」：所有人看到同一份標籤，新增/刪除會同步。

1. 至 [Supabase](https://supabase.com) 建立專案（免費方案即可）。
2. 在專案 **SQL Editor** 執行 `supabase-gym-tags.sql`（或專案根目錄的該檔案內容），建立 `gym_tags` 表。
3. 在專案 **Settings → API** 取得：
   - **Project URL** → 設為 `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role** 的 **secret** → 設為 `SUPABASE_SERVICE_ROLE_KEY`（勿暴露給前端）
4. 在部署環境或本機 `.env.local` 新增：

```env
NEXT_PUBLIC_SUPABASE_URL=https://你的專案.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的_service_role_secret
```

5. 重新建置並部署後，標籤即改為共用；未設定上述變數時，標籤 API 仍可呼叫但不會寫入資料庫（前端顯示為空）。

## 架構

資料流為四層結構：

```
SVG（地圖結構）
      ↓
Station ID 綁定
      ↓
JSON 抱石館資料
      ↓
React 狀態控制
```

- **SVG**：`public/R 18.svg` 為地圖視覺，viewBox 與綁定層一致。
- **Station ID 綁定**：`data/stationBindings.ts` 定義每個車站的 `id` 與 SVG 座標 `(x, y)`，地圖上的透明可點擊層依此綁定。
- **JSON**：`data/gyms.json` 以車站 ID（與綁定 `id` 相同）為 key，查詢該站抱石館列表。
- **React 狀態**：`selectedStationId`、`selectedGym`、`isModalOpen` 控制選站、選館與模態開關。

## 專案結構

```
metro-bouldering/
├── app/
│   ├── layout.tsx         # 根佈局
│   ├── page.tsx           # 主頁面
│   └── globals.css        # 全域樣式
├── components/
│   ├── MetroMap.tsx       # 捷運地圖（整合四層架構）
│   └── GymModal.tsx       # 抱石館詳情模態
├── data/
│   ├── gyms.json          # 抱石館資料（依 stationId）
│   └── stationBindings.ts # 車站 ID 與 SVG 座標綁定
├── types/
│   └── index.ts           # Gym、StationBinding、viewBox 常數
└── public/
    └── R 18.svg           # 台北捷運路線圖
```

## 使用方式

1. 開啟應用程式後，您會看到台北捷運路線圖
2. 點擊地圖上的任何車站標記
3. 右側面板會顯示該車站附近的攀岩場資訊，包括：
   - 攀岩場名稱
   - 地址
   - 距離車站的步行時間

## 資料格式

- **抱石館**：`data/gyms.json`，key 為車站 ID（須與 `stationBindings` 的 `id` 一致）：

```json
{
  "stations": {
    "台北車站": [
      {
        "name": "攀岩場名稱",
        "address": "地址",
        "bestExit": "最佳出口",
        "walkingTime": "步行時間",
        "website": "https://...",
        "googleMapLink": "https://maps.google.com/..."
      }
    ]
  }
}
```

- **車站綁定**：`data/stationBindings.ts`，定義地圖上可點擊的車站與座標（viewBox 與 `R 18.svg` 一致）。

## 授權

MIT License
