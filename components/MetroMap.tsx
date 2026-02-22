'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import gymsData from '@/data/gyms.json';
import { stationBindings } from '@/data/stationBindings';
import gymLabelAreasData from '@/data/gymLabelAreas.json';
import availableMapAssetsData from '@/data/availableMapAssets.json';
import mapLayersData from '@/data/mapLayers.json';
import { METRO_MAP_VIEWBOX } from '@/types';
import type { Gym, GymsByStation } from '@/types';
import type { MapLayerImage, MapLayerText, AvailableMapAsset } from '@/types';
import { getTodayBusinessHours } from '@/utils/businessHours';
import GymModal from './GymModal';

const availableAssets = (availableMapAssetsData as { assets?: AvailableMapAsset[] }).assets ?? [];
const initialMapLayers = mapLayersData as { images?: MapLayerImage[]; texts?: MapLayerText[] };

const ADMIN_STORAGE_KEY = 'metroAdmin';
const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? '';

const gymsByStation = gymsData.stations as GymsByStation;
const R = 120;
const W = METRO_MAP_VIEWBOX.width;
const H = METRO_MAP_VIEWBOX.height;

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** 可編輯的車站位置（比例 0–1，便於拖曳與匯出） */
interface EditablePosition {
  id: string;
  name: string;
  xRatio: number;
  yRatio: number;
}

/** 店名點擊區：可調整位置與大小以對齊圖上的店名 */
export interface GymLabelArea {
  stationId: string;
  gymName: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function toEditable(b: (typeof stationBindings)[number]): EditablePosition {
  return {
    id: b.id,
    name: b.name,
    xRatio: b.x / W,
    yRatio: b.y / H,
  };
}

function getDefaultGymLabelAreas(): GymLabelArea[] {
  const areas: GymLabelArea[] = [];
  stationBindings.forEach((p) => {
    (gymsByStation[p.id] ?? []).forEach((gym, idx) => {
      areas.push({
        stationId: p.id,
        gymName: gym.name,
        x: p.x - 280,
        y: p.y + 75 + idx * 48,
        w: 560,
        h: 40,
      });
    });
  });
  return areas;
}

const loadedAreas = (gymLabelAreasData as { areas?: GymLabelArea[] }).areas ?? [];
const initialGymLabelAreas = loadedAreas.length > 0 ? loadedAreas : getDefaultGymLabelAreas();

export default function MetroMap() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminInput, setAdminInput] = useState('');
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [adminHelpOpen, setAdminHelpOpen] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedGym, setSelectedGym] = useState<Gym | null>(null);
  const [modalStationId, setModalStationId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const FAVORITES_STORAGE_KEY = 'metroBoulderingFavorites';
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      const arr = raw ? (JSON.parse(raw) as string[]) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  const [gymTags, setGymTags] = useState<Record<string, string[]>>({});
  const [gymTagsLoaded, setGymTagsLoaded] = useState(false);
  const [newGymTagInputs, setNewGymTagInputs] = useState<Record<string, string>>({});
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<EditablePosition[]>(() =>
    stationBindings.map(toEditable)
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [gymLabelAreas, setGymLabelAreas] = useState<GymLabelArea[]>(initialGymLabelAreas);
  const [editAreaMode, setEditAreaMode] = useState(false);
  const [areaDrag, setAreaDrag] = useState<{ key: string; startX: number; startY: number; startArea: GymLabelArea } | null>(null);
  const [areaResize, setAreaResize] = useState<{ key: string; startX: number; startY: number; startArea: GymLabelArea } | null>(null);
  const [layerEditMode, setLayerEditMode] = useState(false);
  const [layerImages, setLayerImages] = useState<MapLayerImage[]>(initialMapLayers.images ?? []);
  const [layerTexts, setLayerTexts] = useState<MapLayerText[]>(initialMapLayers.texts ?? []);
  const [layerDrag, setLayerDrag] = useState<{ type: 'image' | 'text'; id: string; startX: number; startY: number; startItem: MapLayerImage | MapLayerText } | null>(null);
  const [layerResize, setLayerResize] = useState<{ id: string; startSvgX: number; startSvgY: number; startWidth: number; startHeight: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ initialDistance: number; initialZoom: number } | null>(null);
  /** 地圖在 zoom=1 時的尺寸（px），用於放大時讓容器可捲動、不裁切 */
  const [baseMapSize, setBaseMapSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(ADMIN_STORAGE_KEY) === '1') {
      setIsAdmin(true);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setEditMode(false);
      setEditAreaMode(false);
      setLayerEditMode(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favoriteKeys)));
    } catch (_) {}
  }, [favoriteKeys]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    fetch('/api/gym-tags')
      .then((res) => res.json())
      .then((data) => {
        if (data?.tags && typeof data.tags === 'object') {
          setGymTags(data.tags);
        }
      })
      .catch(() => {})
      .finally(() => setGymTagsLoaded(true));
  }, []);

  const favoriteKey = (stationId: string, gym: Gym) => `${stationId}|${gym.name}`;

  const addGymTag = async (stationId: string, gym: Gym, tag: string) => {
    const t = tag.trim();
    if (!t) return;
    const key = favoriteKey(stationId, gym);
    try {
      const res = await fetch('/api/gym-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymKey: key, tag: t }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.tags)) {
        setGymTags((prev) => ({ ...prev, [key]: data.tags }));
        setNewGymTagInputs((prev) => ({ ...prev, [key]: '' }));
      }
    } catch (_) {}
  };
  const removeGymTag = async (stationId: string, gym: Gym, index: number) => {
    const key = favoriteKey(stationId, gym);
    try {
      const res = await fetch('/api/gym-tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymKey: key, index }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.tags)) {
        setGymTags((prev) => (data.tags.length === 0 ? (() => { const { [key]: _, ...rest } = prev; return rest; })() : { ...prev, [key]: data.tags }));
      }
    } catch (_) {}
  };
  const getGymTags = (stationId: string, gym: Gym) => gymTags[favoriteKey(stationId, gym)] ?? [];
  const toggleFavorite = (key: string) => {
    setFavoriteKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isFavorite = (stationId: string, gym: Gym) => favoriteKeys.has(favoriteKey(stationId, gym));

  const favoriteList: { stationId: string; stationName: string; gym: Gym }[] = [];
  stationBindings.forEach((s) => {
    (gymsByStation[s.id] ?? []).forEach((gym) => {
      if (favoriteKeys.has(favoriteKey(s.id, gym))) favoriteList.push({ stationId: s.id, stationName: s.name, gym });
    });
  });

  const handleAdminLogin = () => {
    if (adminPassword && adminInput === adminPassword) {
      if (typeof window !== 'undefined') window.sessionStorage.setItem(ADMIN_STORAGE_KEY, '1');
      setIsAdmin(true);
      setAdminInput('');
      setAdminLoginOpen(false);
    } else {
      alert('密碼錯誤');
    }
  };

  const handleAdminLogout = () => {
    if (typeof window !== 'undefined') window.sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    setIsAdmin(false);
  };

  const areaKey = (a: GymLabelArea) => `${a.stationId}|${a.gymName}`;
  const getGymByArea = useCallback(
    (a: GymLabelArea): { gym: Gym; stationId: string } | null => {
      const gyms = gymsByStation[a.stationId] ?? [];
      const gym = gyms.find((g) => g.name === a.gymName);
      return gym ? { gym, stationId: a.stationId } : null;
    },
    []
  );

  // 所有抱石館 + 所屬站名，供搜尋用
  const allGymsWithStation: { gym: Gym; stationId: string; stationName: string }[] = [];
  positions.forEach((p) => {
    (gymsByStation[p.id] ?? []).forEach((gym) => {
      allGymsWithStation.push({ gym, stationId: p.id, stationName: p.name });
    });
  });
  const searchQueryLower = searchQuery.trim().toLowerCase();
  const searchResults = searchQueryLower
    ? allGymsWithStation.filter(
        (item) =>
          item.gym.name.toLowerCase().includes(searchQueryLower) ||
          item.stationName.includes(searchQuery.trim())
      )
    : [];

  const handleStationSelect = (stationId: string) => {
    if (editMode || editAreaMode) return;
    setSelectedStationId(stationId);
    setSelectedGym(null);
    setIsModalOpen(false);
  };

  const handleGymClick = (gym: Gym, stationId?: string) => {
    setZoom(1);
    if (stationId) setSelectedStationId(stationId);
    setModalStationId(stationId ?? null);
    setSelectedGym(gym);
    setIsModalOpen(true);
  };

  const handleSearchSelect = (item: { gym: Gym; stationId: string }) => {
    setZoom(1);
    setSelectedStationId(item.stationId);
    setModalStationId(item.stationId);
    setSelectedGym(item.gym);
    setIsModalOpen(true);
    setSearchQuery('');
    setSearchFocused(false);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedGym(null);
    setModalStationId(null);
  };

  const getSVGCoords = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      return { x: svgP.x, y: svgP.y };
    },
    []
  );

  const handleDragStart = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!editMode) return;
    setDraggingId(id);
  };

  const handleDragMove = useCallback(
    (e: MouseEvent) => {
      if (!draggingId) return;
      const { x, y } = getSVGCoords(e);
      const xRatio = Math.max(0, Math.min(1, x / W));
      const yRatio = Math.max(0, Math.min(1, y / H));
      setPositions((prev) =>
        prev.map((p) =>
          p.id === draggingId ? { ...p, xRatio, yRatio } : p
        )
      );
    },
    [draggingId, getSVGCoords]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  useEffect(() => {
    if (!draggingId) return;
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [draggingId, handleDragMove, handleDragEnd]);

  const getSVGCoordsForArea = useCallback((e: MouseEvent) => getSVGCoords(e), [getSVGCoords]);

  const handleAreaMove = useCallback(
    (e: MouseEvent) => {
      if (!areaDrag) return;
      const { x, y } = getSVGCoordsForArea(e);
      const dx = x - areaDrag.startX;
      const dy = y - areaDrag.startY;
      setGymLabelAreas((prev) =>
        prev.map((a) =>
          areaKey(a) === areaDrag.key
            ? { ...a, x: areaDrag.startArea.x + dx, y: areaDrag.startArea.y + dy }
            : a
        )
      );
    },
    [areaDrag, areaKey, getSVGCoordsForArea]
  );
  const handleAreaResize = useCallback(
    (e: MouseEvent) => {
      if (!areaResize) return;
      const { x, y } = getSVGCoordsForArea(e);
      const dw = Math.max(60, x - areaResize.startArea.x);
      const dh = Math.max(24, y - areaResize.startArea.y);
      setGymLabelAreas((prev) =>
        prev.map((a) =>
          areaKey(a) === areaResize.key ? { ...a, w: dw, h: dh } : a
        )
      );
    },
    [areaResize, areaKey, getSVGCoordsForArea]
  );
  const handleAreaDragEnd = useCallback(() => setAreaDrag(null), []);
  const handleAreaResizeEnd = useCallback(() => setAreaResize(null), []);

  useEffect(() => {
    if (areaDrag) {
      window.addEventListener('mousemove', handleAreaMove);
      window.addEventListener('mouseup', handleAreaDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleAreaMove);
        window.removeEventListener('mouseup', handleAreaDragEnd);
      };
    }
  }, [areaDrag, handleAreaMove, handleAreaDragEnd]);

  useEffect(() => {
    if (areaResize) {
      window.addEventListener('mousemove', handleAreaResize);
      window.addEventListener('mouseup', handleAreaResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleAreaResize);
        window.removeEventListener('mouseup', handleAreaResizeEnd);
      };
    }
  }, [areaResize, handleAreaResize, handleAreaResizeEnd]);

  const handleCopyGymAreas = () => {
    const json = JSON.stringify({ areas: gymLabelAreas }, null, 2);
    navigator.clipboard.writeText(json);
    alert('已複製店名點擊區到剪貼簿，可貼到 data/gymLabelAreas.json');
  };

  const handleAddLayerImage = (assetId: string) => {
    const asset = availableAssets.find((a) => a.id === assetId);
    if (!asset) return;
    const newId = `img-${Date.now()}`;
    setLayerImages((prev) => [
      ...prev,
      { id: newId, assetId, x: W / 2 - 150, y: H / 2 - 75, width: 300, height: 150 },
    ]);
  };

  const handleAddLayerText = () => {
    const content = window.prompt('輸入文字', '新站名');
    if (content == null || content.trim() === '') return;
    const newId = `txt-${Date.now()}`;
    setLayerTexts((prev) => [
      ...prev,
      { id: newId, content: content.trim(), x: W / 2, y: H / 2, fontSize: 48 },
    ]);
  };

  const handleLayerDragMove = useCallback(
    (e: MouseEvent) => {
      if (!layerDrag) return;
      const { x, y } = getSVGCoords(e);
      const dx = x - layerDrag.startX;
      const dy = y - layerDrag.startY;
      if (layerDrag.type === 'image') {
        const start = layerDrag.startItem as MapLayerImage;
        setLayerImages((prev) =>
          prev.map((img) =>
            img.id === layerDrag.id ? { ...img, x: start.x + dx, y: start.y + dy } : img
          )
        );
      } else {
        const start = layerDrag.startItem as MapLayerText;
        setLayerTexts((prev) =>
          prev.map((t) =>
            t.id === layerDrag.id ? { ...t, x: start.x + dx, y: start.y + dy } : t
          )
        );
      }
    },
    [layerDrag, getSVGCoords]
  );
  const handleLayerDragEnd = useCallback(() => setLayerDrag(null), []);

  useEffect(() => {
    if (!layerDrag) return;
    window.addEventListener('mousemove', handleLayerDragMove);
    window.addEventListener('mouseup', handleLayerDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleLayerDragMove);
      window.removeEventListener('mouseup', handleLayerDragEnd);
    };
  }, [layerDrag, handleLayerDragMove, handleLayerDragEnd]);

  const handleLayerResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!layerResize) return;
      const { x: svgX, y: svgY } = getSVGCoords(e);
      const dw = svgX - layerResize.startSvgX;
      const dh = svgY - layerResize.startSvgY;
      const minSize = 20;
      setLayerImages((prev) =>
        prev.map((img) =>
          img.id === layerResize.id
            ? {
                ...img,
                width: Math.max(minSize, layerResize.startWidth + dw),
                height: Math.max(minSize, layerResize.startHeight + dh),
              }
            : img
        )
      );
    },
    [layerResize, getSVGCoords]
  );
  const handleLayerResizeEnd = useCallback(() => setLayerResize(null), []);

  useEffect(() => {
    if (!layerResize) return;
    window.addEventListener('mousemove', handleLayerResizeMove);
    window.addEventListener('mouseup', handleLayerResizeEnd);
    return () => {
      window.removeEventListener('mousemove', handleLayerResizeMove);
      window.removeEventListener('mouseup', handleLayerResizeEnd);
    };
  }, [layerResize, handleLayerResizeMove, handleLayerResizeEnd]);

  const handleCopyMapLayers = () => {
    const json = JSON.stringify({ images: layerImages, texts: layerTexts }, null, 2);
    navigator.clipboard.writeText(json);
    alert('已複製圖層到剪貼簿，可貼到 data/mapLayers.json');
  };

  const updateLayerTextFontSize = (id: string, fontSize: number) => {
    setLayerTexts((prev) => prev.map((t) => (t.id === id ? { ...t, fontSize } : t)));
  };

  const removeLayerImage = (id: string) => setLayerImages((prev) => prev.filter((img) => img.id !== id));
  const removeLayerText = (id: string) => setLayerTexts((prev) => prev.filter((t) => t.id !== id));

  const updateLayerImageSize = (id: string, width: number, height: number) => {
    const minSize = 20;
    setLayerImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, width: Math.max(minSize, width), height: Math.max(minSize, height) } : img))
    );
  };

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP));
  const zoomReset = () => {
    setZoom(1);
    requestAnimationFrame(() => {
      mapContainerRef.current?.scrollTo({ left: 0, top: 0 });
      if (typeof window !== 'undefined') window.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
    });
  };

  const handleCopyPositions = () => {
    const lines = positions.map(
      (p) =>
        `  { id: '${p.id}', name: '${p.name}', x: ${Math.round(p.xRatio * W)}, y: ${Math.round(p.yRatio * H)}, r: ${R} },`
    );
    const code = `export const stationBindings: StationBinding[] = [\n${lines.join('\n')}\n];`;
    navigator.clipboard.writeText(code);
    alert('已複製座標到剪貼簿，可貼到 data/stationBindings.ts');
  };

  const selectedGyms = selectedStationId ? (gymsByStation[selectedStationId] ?? []) : [];
  const viewBox = `0 0 ${W} ${H}`;

  const getTouchDistance = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const handleMapTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = {
        initialDistance: getTouchDistance(e.touches[0], e.touches[1]),
        initialZoom: zoom,
      };
    }
  };
  const pendingZoomRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const handleMapTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches[0], e.touches[1]);
      const scale = currentDistance / pinchRef.current.initialDistance;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchRef.current.initialZoom * scale));
      pendingZoomRef.current = newZoom;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          if (pendingZoomRef.current != null) {
            setZoom(pendingZoomRef.current);
            pendingZoomRef.current = null;
          }
        });
      }
    }
  };
  const handleMapTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  };

  const mapContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) e.preventDefault();
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) e.preventDefault();
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
    };
  }, []);

  // 在 zoom=1 時測量地圖尺寸，供放大後捲動區域使用
  useEffect(() => {
    if (zoom !== 1) return;
    const el = mapWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBaseMapSize({ width: rect.width, height: rect.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [zoom]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 bg-gray-50 min-h-screen">
      <div className="flex-1 min-w-0 bg-white rounded-lg shadow-lg p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-2xl font-bold text-gray-800">台北捷運路線圖</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-gray-50 p-1">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                className="h-8 w-8 rounded flex items-center justify-center text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="縮小"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
              </button>
              <span className="min-w-[3rem] text-center text-sm font-medium text-gray-700">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                className="h-8 w-8 rounded flex items-center justify-center text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                title="放大"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button
                type="button"
                onClick={zoomReset}
                className="h-8 px-2 rounded text-sm text-gray-600 hover:bg-gray-200"
                title="重置縮放"
              >
                重置
              </button>
            </div>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setEditMode((e) => !e)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    editMode
                      ? 'bg-amber-100 border-amber-400 text-amber-800'
                      : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {editMode ? '結束編輯' : '調整車站'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditAreaMode((e) => !e)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    editAreaMode
                      ? 'bg-green-100 border-green-400 text-green-800'
                      : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {editAreaMode ? '結束調整' : '調整店名點擊區'}
                </button>
                {editMode && (
                  <button
                    type="button"
                    onClick={handleCopyPositions}
                    className="px-4 py-2 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
                  >
                    複製座標
                  </button>
                )}
                {editAreaMode && (
                  <button
                    type="button"
                    onClick={handleCopyGymAreas}
                    className="px-4 py-2 rounded-lg border border-green-300 bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100"
                  >
                    複製店名點擊區
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLayerEditMode((e) => !e)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    layerEditMode
                      ? 'bg-purple-100 border-purple-400 text-purple-800'
                      : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {layerEditMode ? '結束圖層' : '圖層管理'}
                </button>
                {layerEditMode && (
                  <>
                    <select
                      className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-900 bg-white"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v) {
                          handleAddLayerImage(v);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">新增圖片…</option>
                      {availableAssets.map((a) => (
                        <option key={a.id} value={a.id}>{a.label ?? a.id}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddLayerText}
                      className="px-4 py-2 rounded-lg border border-purple-300 bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100"
                    >
                      新增文字
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyMapLayers}
                      className="px-4 py-2 rounded-lg border border-purple-300 bg-purple-50 text-purple-700 text-sm font-medium hover:bg-purple-100"
                    >
                      複製圖層
                    </button>
                  </>
                )}
              </>
            )}
            <div className="relative">
              {isAdmin ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAdminHelpOpen((o) => !o)}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm hover:bg-gray-100"
                    title="如何更新地圖／新增站點與店鋪"
                  >
                    新增資料說明
                  </button>
                  <button
                    type="button"
                    onClick={handleAdminLogout}
                    className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm hover:bg-red-100"
                  >
                    管理員登出
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAdminLoginOpen((o) => !o)}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-gray-500 text-sm hover:bg-gray-100"
                  >
                    管理員登入
                  </button>
                  {adminLoginOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setAdminLoginOpen(false)} />
                      <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border bg-white p-3 shadow-lg">
                        <label className="block text-sm text-gray-600 mb-1">密碼</label>
                        <input
                          type="password"
                          value={adminInput}
                          onChange={(e) => setAdminInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                          className="w-full border rounded px-2 py-1.5 text-sm mb-2"
                          placeholder="輸入管理員密碼"
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={handleAdminLogin} className="flex-1 py-1.5 rounded bg-blue-600 text-white text-sm">登入</button>
                          <button type="button" onClick={() => setAdminLoginOpen(false)} className="py-1.5 rounded border text-sm">取消</button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        {isAdmin && adminHelpOpen && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <h4 className="font-semibold text-gray-800 mb-2">如何更新地圖／新增站點與店鋪</h4>
            <ul className="list-disc list-inside space-y-1 mb-3">
              <li><strong>更新地圖圖檔</strong>：將新圖（如新路線圖）覆蓋專案中的 <code className="bg-white px-1 rounded">public/R 18.svg</code>，重新建置或部署後即生效。</li>
              <li><strong>新增捷運站</strong>：編輯 <code className="bg-white px-1 rounded">data/stationBindings.ts</code>，在 <code className="bg-white px-1 rounded">stationBindings</code> 陣列中新增一筆 <code className="bg-white px-1 rounded">{`{ id: '站名', name: '站名', x, y, r: 120 }`}</code>（x, y 可先用「調整車站」對齊後複製）。</li>
              <li><strong>新增抱石館</strong>：編輯 <code className="bg-white px-1 rounded">data/gyms.json</code>，在對應的 <code className="bg-white px-1 rounded">stations["站名"]</code> 陣列中新增一筆含 name, address, bestExit, walkingTime, website, googleMapLink, phone。</li>
              <li><strong>新增店名點擊區</strong>：先新增抱石館後，到畫面上「調整店名點擊區」把綠色方框拖到新店名上，按「複製店名點擊區」，將產生的 JSON 貼到 <code className="bg-white px-1 rounded">data/gymLabelAreas.json</code> 的 <code className="bg-white px-1 rounded">areas</code> 陣列中。</li>
            </ul>
            <button type="button" onClick={() => setAdminHelpOpen(false)} className="text-gray-500 hover:text-gray-700">關閉說明</button>
          </div>
        )}
        <div
          ref={mapContainerRef}
          className={`overflow-auto border-2 border-gray-200 rounded-lg bg-white max-h-[70vh] flex items-start ${zoom !== 1 ? 'justify-start' : 'justify-center'}`}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setZoom((z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, e.deltaY > 0 ? z - 0.1 : z + 0.1)));
            }
          }}
          onTouchStart={handleMapTouchStart}
          onTouchMove={handleMapTouchMove}
          onTouchEnd={handleMapTouchEnd}
        >
          <div
            className="transition-transform duration-150"
            style={
              baseMapSize && zoom !== 1
                ? {
                    width: baseMapSize.width * zoom,
                    height: baseMapSize.height * zoom,
                    minWidth: baseMapSize.width * zoom,
                    minHeight: baseMapSize.height * zoom,
                  }
                : undefined
            }
          >
            <div
              ref={mapWrapRef}
              className="relative inline-block max-w-full origin-center transition-transform duration-150"
              style={{
                width: baseMapSize && zoom !== 1 ? baseMapSize.width : undefined,
                height: baseMapSize && zoom !== 1 ? baseMapSize.height : undefined,
                transform: `scale(${zoom})`,
                transformOrigin: 'left top',
              }}
            >
            <img
              src="/R%2018.svg"
              alt="台北捷運路線圖"
              className="w-full h-auto block max-w-full object-contain"
              style={{ maxHeight: '65vh' }}
            />
            <svg
              ref={svgRef}
              className={`absolute top-0 left-0 w-full h-full ${editMode ? 'cursor-grab' : 'cursor-pointer'}`}
              viewBox={viewBox}
              preserveAspectRatio="xMidYMid meet"
            >
              <g style={{ pointerEvents: 'auto' }}>
                {positions.map((p) => {
                  const x = p.xRatio * W;
                  const y = p.yRatio * H;
                  const isSelected = selectedStationId === p.id && !editMode;
                  const isDragging = draggingId === p.id;
                  return (
                    <g
                      key={p.id}
                      onClick={() => { if (!layerEditMode) handleStationSelect(p.id); }}
                      onMouseDown={(e) => {
                        if (layerEditMode || editAreaMode) e.stopPropagation();
                        else handleDragStart(e, p.id);
                      }}
                      style={{ cursor: layerEditMode ? 'default' : editMode ? 'grab' : editAreaMode ? 'default' : 'pointer' }}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={R}
                        fill={
                          editMode
                            ? isDragging
                              ? 'rgba(251, 191, 36, 0.5)'
                              : 'rgba(59, 130, 246, 0.2)'
                            : isSelected
                              ? 'rgba(59, 130, 246, 0.25)'
                              : 'transparent'
                        }
                        stroke={editMode ? 'rgb(59, 130, 246)' : isSelected ? 'rgb(59, 130, 246)' : 'transparent'}
                        strokeWidth={editMode || isSelected ? 8 : 0}
                      />
                      {editMode && (
                        <text
                          x={x}
                          y={y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#1f2937"
                          fontSize="80"
                          style={{ pointerEvents: 'none', userSelect: 'none' }}
                        >
                          {p.name.replace('站', '')}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* 圖層：圖片與文字，管理員可拖曳位置、文字可調字級 */}
                {layerImages.map((img) => {
                  const asset = availableAssets.find((a) => a.id === img.assetId);
                  const src = asset?.src ?? '';
                  const handleSize = 24;
                  return (
                    <g key={img.id} style={{ pointerEvents: layerEditMode ? 'auto' : 'none' }}>
                      <image
                        href={src}
                        x={img.x}
                        y={img.y}
                        width={img.width}
                        height={img.height}
                        style={{ cursor: layerEditMode ? 'move' : 'default' }}
                        onMouseDown={(e) => {
                          if (!layerEditMode) return;
                          e.stopPropagation();
                          const { x, y } = getSVGCoords(e);
                          setLayerDrag({ type: 'image', id: img.id, startX: x, startY: y, startItem: { ...img } });
                        }}
                      />
                      {layerEditMode && (
                        <circle
                          cx={img.x + img.width}
                          cy={img.y + img.height}
                          r={handleSize / 2}
                          fill="rgba(147, 51, 234, 0.9)"
                          stroke="white"
                          strokeWidth="2"
                          style={{ cursor: 'nwse-resize' }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const { x, y } = getSVGCoords(e);
                            setLayerResize({ id: img.id, startSvgX: x, startSvgY: y, startWidth: img.width, startHeight: img.height });
                          }}
                        />
                      )}
                    </g>
                  );
                })}
                {layerTexts.map((t) => (
                  <g key={t.id} style={{ pointerEvents: layerEditMode ? 'auto' : 'none' }}>
                    <text
                      x={t.x}
                      y={t.y}
                      fontSize={t.fontSize}
                      fill="#000"
                      stroke="#fff"
                      strokeWidth={Math.max(2, t.fontSize / 24)}
                      paintOrder="stroke"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ cursor: layerEditMode ? 'move' : 'default', userSelect: 'none' }}
                      onMouseDown={(e) => {
                        if (!layerEditMode) return;
                        e.stopPropagation();
                        const { x, y } = getSVGCoords(e);
                        setLayerDrag({ type: 'text', id: t.id, startX: x, startY: y, startItem: { ...t } });
                      }}
                    >
                      {t.content}
                    </text>
                  </g>
                ))}
                {/* 店名點擊區：可調整大小覆蓋圖上店名，點擊開啟該店詳情 */}
                {gymLabelAreas.map((area) => {
                  const key = areaKey(area);
                  const info = getGymByArea(area);
                  if (!info) return null;
                  if (editAreaMode) {
                    return (
                      <g key={key} style={{ pointerEvents: 'auto' }}>
                        <rect
                          x={area.x}
                          y={area.y}
                          width={area.w}
                          height={area.h}
                          fill="rgba(34, 197, 94, 0.15)"
                          stroke="rgb(34, 197, 94)"
                          strokeWidth="3"
                          style={{ cursor: 'move' }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const { x, y } = getSVGCoords(e);
                            setAreaDrag({ key, startX: x, startY: y, startArea: { ...area } });
                          }}
                        />
                        <rect
                          x={area.x + area.w - 14}
                          y={area.y + area.h - 14}
                          width={14}
                          height={14}
                          fill="rgb(34, 197, 94)"
                          style={{ cursor: 'nwse-resize' }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            const { x, y } = getSVGCoords(e);
                            setAreaResize({ key, startX: x, startY: y, startArea: { ...area } });
                          }}
                        />
                      </g>
                    );
                  }
                  return (
                    <g
                      key={key}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGymClick(info.gym, info.stationId);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <title>{area.gymName}</title>
                      <rect
                        x={area.x}
                        y={area.y}
                        width={area.w}
                        height={area.h}
                        fill="transparent"
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-600">
          {editMode
            ? '拖曳車站圓點調整位置，完成後按「複製座標」貼到 data/stationBindings.ts'
            : editAreaMode
              ? '拖曳綠色方框移動、拖曳右下角調整大小以覆蓋圖上店名，完成後按「複製店名點擊區」貼到 data/gymLabelAreas.json'
              : layerEditMode
                ? '拖曳圖層移動；圖片可拖曳右下角紫點或於列表輸入寬高縮放；文字可調字級。完成後按「複製圖層」貼到 data/mapLayers.json'
                : '點擊地圖上的車站或店名，或從右側列表選擇。Ctrl + 滾輪可縮放地圖。'}
        </p>
        {isAdmin && layerEditMode && (layerImages.length > 0 || layerTexts.length > 0) && (
          <div className="mt-3 p-3 rounded-lg border border-purple-200 bg-purple-50/50 text-sm">
            <h4 className="font-medium text-purple-900 mb-2">圖層列表</h4>
            {layerImages.length > 0 && (
              <div className="mb-2">
                <span className="text-purple-700 font-medium">圖片</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {layerImages.map((img) => (
                    <li key={img.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-700">{img.assetId}</span>
                      <label className="flex items-center gap-1 text-xs text-gray-900">
                        寬
                        <input
                          type="number"
                          min={20}
                          value={Math.round(img.width)}
                          onChange={(e) => updateLayerImageSize(img.id, Number(e.target.value) || 20, img.height)}
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-gray-900 bg-white"
                        />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-900">
                        高
                        <input
                          type="number"
                          min={20}
                          value={Math.round(img.height)}
                          onChange={(e) => updateLayerImageSize(img.id, img.width, Number(e.target.value) || 20)}
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-gray-900 bg-white"
                        />
                      </label>
                      <button type="button" onClick={() => removeLayerImage(img.id)} className="text-red-600 hover:underline text-xs">刪除</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {layerTexts.length > 0 && (
              <div>
                <span className="text-purple-700 font-medium">文字</span>
                <ul className="mt-1 space-y-1">
                  {layerTexts.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-700 truncate max-w-[8rem]" title={t.content}>{t.content}</span>
                      <label className="flex items-center gap-1 text-gray-900">
                        字級
                        <input
                          type="number"
                          min={8}
                          max={200}
                          value={t.fontSize}
                          onChange={(e) => updateLayerTextFontSize(t.id, Math.max(8, Math.min(200, Number(e.target.value) || 48)))}
                          className="w-14 px-1 py-0.5 border border-gray-300 rounded text-xs text-gray-900 bg-white"
                        />
                      </label>
                      <button type="button" onClick={() => removeLayerText(t.id)} className="text-red-600 hover:underline text-xs">刪除</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="lg:w-96 bg-white rounded-lg shadow-lg p-6">
        {/* 搜尋店名／站名 */}
        <div className="mb-6 relative">
          <label className="block text-sm text-gray-600 mb-2">搜尋店名或捷運站</label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            placeholder="輸入抱石館名稱或站名..."
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
          />
          {searchFocused && (searchQuery.trim() || searchResults.length > 0) && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="px-4 py-3 text-gray-500 text-sm">無符合的結果</div>
              ) : (
                <ul className="py-1">
                  {searchResults.slice(0, 20).map((item, idx) => (
                    <li key={`${item.stationId}-${item.gym.name}-${idx}`}>
                      <button
                        type="button"
                        onClick={() => handleSearchSelect(item)}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex flex-col gap-0.5"
                      >
                        <span className="font-medium text-gray-900">{item.gym.name}</span>
                        <span className="text-sm text-gray-500">{item.stationName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {favoriteList.length > 0 && (
          <div className="mb-6 border-t border-gray-200 pt-6">
            <h3 className="text-lg font-bold mb-3 text-gray-800">收藏</h3>
            <ul className="space-y-2">
              {favoriteList.map(({ stationId, stationName, gym }) => (
                <li key={favoriteKey(stationId, gym)}>
                  <button
                    type="button"
                    onClick={() => handleGymClick(gym, stationId)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-red-200 hover:bg-red-50/50 flex items-center gap-2"
                  >
                    <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900 block truncate">{gym.name}</span>
                      <span className="text-sm text-gray-500">{stationName}</span>
                      {getTodayBusinessHours(gym.businessHours) && (
                        <span className="text-sm text-amber-700 block">今日 {getTodayBusinessHours(gym.businessHours)}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-xl font-bold mb-4 text-gray-800">
            {selectedStationId ? `${selectedStationId}附近的攀岩場` : '攀岩場'}
          </h3>
          {selectedStationId ? (
            selectedGyms.length > 0 ? (
              <div className="space-y-4">
                {selectedGyms.map((gym, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all cursor-pointer hover:border-blue-300 relative"
                    onClick={() => handleGymClick(gym, selectedStationId ?? undefined)}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(favoriteKey(selectedStationId ?? '', gym));
                      }}
                      className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-500"
                      aria-label={isFavorite(selectedStationId ?? '', gym) ? '取消收藏' : '加入收藏'}
                    >
                      <svg
                        className="w-5 h-5"
                        fill={isFavorite(selectedStationId ?? '', gym) ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2 pr-8">{gym.name}</h3>
                    <p className="text-sm text-gray-600 mb-1">📍 {gym.address}</p>
                    <p className="text-sm text-blue-600 font-medium">🚶 {gym.walkingTime}</p>
                    {getTodayBusinessHours(gym.businessHours) && (
                      <p className="text-sm text-amber-700 font-medium mt-1">
                        今日 {getTodayBusinessHours(gym.businessHours)}
                      </p>
                    )}
                    <div className="mt-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {getGymTags(selectedStationId ?? '', gym).map((tag, idx) => (
                          <span
                            key={`${tag}-${idx}`}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs"
                          >
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeGymTag(selectedStationId ?? '', gym, idx)}
                              className="p-0.5 rounded-full hover:bg-gray-300 text-gray-500"
                              aria-label="移除標籤"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newGymTagInputs[favoriteKey(selectedStationId ?? '', gym)] ?? ''}
                          onChange={(e) => setNewGymTagInputs((prev) => ({ ...prev, [favoriteKey(selectedStationId ?? '', gym)]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGymTag(selectedStationId ?? '', gym, (newGymTagInputs[favoriteKey(selectedStationId ?? '', gym)] ?? '').trim()))}
                          placeholder="新增標籤…"
                          className="flex-1 min-w-0 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-900 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => addGymTag(selectedStationId ?? '', gym, newGymTagInputs[favoriteKey(selectedStationId ?? '', gym)] ?? '')}
                          className="px-2 py-1.5 rounded bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200"
                        >
                          新增
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>此車站附近暫無攀岩場資料</p>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>請點擊地圖上的車站或店名，或使用上方搜尋</p>
            </div>
          )}
        </div>
      </div>

      <GymModal
        gym={selectedGym}
        stationId={modalStationId ?? undefined}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        isFavorite={selectedGym && modalStationId ? favoriteKeys.has(favoriteKey(modalStationId, selectedGym)) : false}
        onToggleFavorite={
          selectedGym && modalStationId
            ? () => toggleFavorite(favoriteKey(modalStationId, selectedGym))
            : undefined
        }
        gymTags={selectedGym && modalStationId ? getGymTags(modalStationId, selectedGym) : []}
        onAddGymTag={selectedGym && modalStationId ? (tag) => addGymTag(modalStationId, selectedGym, tag) : undefined}
        onRemoveGymTag={selectedGym && modalStationId ? (index) => removeGymTag(modalStationId, selectedGym, index) : undefined}
      />
    </div>
  );
}
