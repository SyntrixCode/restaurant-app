import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import {
  Plus,
  Trash2,
  Save,
  RotateCcw,
  RotateCw,
  Pencil,
  Users as UsersIcon,
  MapPin,
  Info,
  Wine,
  ChefHat,
  Calculator,
  Footprints,
  User,
  DoorOpen,
  DoorClosed,
  Square,
  Circle,
  Type,
  Minus as MinusIcon,
} from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import Modal from '../../components/ui/Modal';
import {
  watchCollection,
  createDoc,
  patchDoc,
  removeDoc,
  orderBy,
  where,
  writeBatch,
  serverTimestamp,
} from '../../firebase/firestore';
import { db } from '../../firebase/config';
import { doc } from 'firebase/firestore';
import { tableSchema } from '../../utils/validators';

const CANVAS_W = 1200;
const CANVAS_H = 700;
const SNAP_THRESHOLD = 8; // px — sürüklerken kenar/merkez hizalama yapışma mesafesi

const ZONE_LABELS = {
  ic: 'İç Salon',
  dis: 'Dış Mekan',
  bahce: 'Bahçe',
  bar: 'Meşrubat',
  kapali: 'Kapalı Alan',
};

const TABLE_H = 70; // tüm masalar için sabit yükseklik (px)

const SIZE_PRESETS = [
  // Yükseklik sabit (TABLE_H); genişlik kapasiteyle sağa doğru artar
  // kapasite 1 → kare/daire (w=h), büyük kapasiteler dikdörtgen/oval
  { kapasite: 1, w: 70, h: TABLE_H },
  { kapasite: 2, w: 80, h: TABLE_H },
  { kapasite: 4, w: 100, h: TABLE_H },
  { kapasite: 6, w: 120, h: TABLE_H },
  { kapasite: 8, w: 140, h: TABLE_H },
];

const DURUM_COLORS = {
  bos: 'bg-emerald-500 border-emerald-700',
  dolu: 'bg-red-500 border-red-700',
  rezerve: 'bg-amber-500 border-amber-700',
};

const DECOR_PRESETS = {
  bar: {
    label: 'MEŞRUBAT',
    icon: Wine,
    w: 220,
    h: 50,
    iconColor: 'text-amber-100',
    // counter look: amber gradient with dark top "trim"
    className:
      'bg-gradient-to-b from-amber-900 to-amber-700 text-amber-50 border-amber-950 tracking-widest font-bold uppercase',
  },
  kasa: {
    label: 'KASA',
    icon: Calculator,
    w: 130,
    h: 60,
    iconColor: 'text-slate-100',
    className:
      'bg-gradient-to-b from-slate-700 to-slate-600 text-slate-50 border-slate-900 tracking-widest font-bold uppercase',
  },
  mutfak: {
    label: 'MUTFAK',
    icon: ChefHat,
    w: 130,
    h: 90,
    iconColor: 'text-orange-600',
    // sign style: white bg, colored border + colored text
    className:
      'bg-white text-orange-700 border-orange-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  wc: {
    label: 'WC',
    icon: User,
    w: 60,
    h: 60,
    iconColor: 'text-blue-700',
    className:
      'bg-white text-blue-700 border-blue-500 border-[3px] font-bold text-xl',
  },
  cikis: {
    label: 'ÇIKIŞ',
    icon: DoorOpen,
    w: 90,
    h: 60,
    iconColor: 'text-emerald-700',
    className:
      'bg-white text-emerald-700 border-emerald-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  kapi: {
    label: 'KAPI',
    icon: DoorClosed,
    w: 90,
    h: 60,
    iconColor: 'text-amber-700',
    className:
      'bg-white text-amber-700 border-amber-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  duvar: {
    label: '',
    icon: null,
    w: 240,
    h: 8,
    iconColor: '',
    // solid dark line, no rounded corners, no label
    className: 'bg-slate-700 border-slate-900',
    noRounded: true,
  },
  merdiven: {
    label: 'MERDİVEN',
    icon: Footprints,
    w: 80,
    h: 120,
    iconColor: 'text-slate-500',
    className:
      'bg-slate-200 text-slate-600 border-slate-400 border-[2px] font-semibold tracking-wide uppercase text-xs',
  },
  etiket: {
    label: 'Yazı',
    icon: null,
    w: 100,
    h: 32,
    iconColor: '',
    // text only, no fill, no border — just italic
    className:
      'bg-transparent text-slate-500 border-transparent italic text-xs',
    noRounded: true,
  },
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function sizeFor(kapasite) {
  const preset = SIZE_PRESETS.find((p) => p.kapasite >= kapasite);
  return preset ? { w: preset.w, h: preset.h } : { w: 240, h: TABLE_H };
}

// Yuvarlak masa çapı (w=h, kare oranlı)
function roundSizeFor(kapasite) {
  if (kapasite >= 8) return 100;
  if (kapasite >= 6) return 90;
  if (kapasite >= 4) return 80;
  return 70; // 1-2 kişilik
}

// Şekle göre varsayılan boyut: yuvarlak → kare oranlı (w=h), kare → sabit yükseklik
function defaultSize(kapasite, sekil) {
  if (sekil === 'yuvarlak') {
    const d = roundSizeFor(kapasite);
    return { w: d, h: d };
  }
  return sizeFor(kapasite);
}

export default function AdminTables() {
  const [scale, setScale] = useState(1);
  const canvasWrapperRef = useRef(null);
  const [tables, setTables] = useState([]);
  const [decorations, setDecorations] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [zone, setZone] = useState(null);
  const [selected, setSelected] = useState(null); // { kind: 'table'|'decor', id }
  const [localTablePos, setLocalTablePos] = useState({});
  const [localTableSize, setLocalTableSize] = useState({});
  const [localDecorPos, setLocalDecorPos] = useState({});
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [guides, setGuides] = useState(null); // { v: [x...], h: [y...] }
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const canvasRef = useRef(null);

  // Sürüklenenin GÜNCEL pozisyonu (lokal değişiklikler dahil)
  const effectivePosTable = (t) => {
    const lp = localTablePos[t.id];
    return { x: lp?.x ?? t.x ?? 0, y: lp?.y ?? t.y ?? 0 };
  };
  const effectivePosDecor = (d) => {
    const lp = localDecorPos[d.id];
    return { x: lp?.x ?? d.x ?? 0, y: lp?.y ?? d.y ?? 0 };
  };
  // Masanın GÜNCEL boyutu: yerel resize > özel boyut (customW/H) > kapasite varsayılanı
  const effectiveSizeTable = (t) => {
    const ls = localTableSize[t.id];
    const def = defaultSize(t.kapasite, t.sekil);
    return {
      w: ls?.w ?? t.customW ?? def.w,
      h: ls?.h ?? t.customH ?? def.h,
    };
  };

  // Sürüklenenle aynı bölgedeki diğer masa+dekor kutularını topla — hizalama referansı olarak
  function alignmentAnchors(excludeKind, excludeId) {
    const out = [];
    for (const t of tablesInZone) {
      if (excludeKind === 'table' && t.id === excludeId) continue;
      const p = effectivePosTable(t);
      const { w, h } = effectiveSizeTable(t);
      out.push({ x: p.x, y: p.y, w, h });
    }
    for (const d of decorsInZone) {
      if (excludeKind === 'decor' && d.id === excludeId) continue;
      const p = effectivePosDecor(d);
      out.push({ x: p.x, y: p.y, w: d.w || 100, h: d.h || 60 });
    }
    return out;
  }

  // px,py boyutlu sürüklenenin (w,h) en yakın hiza çizgisine yapışmasını hesaplar.
  // Garson ekranındaki computeAlignment'ın admin paneli adaptasyonu.
  function computeAlignment(anchors, px, py, w, h) {
    let bestX = { delta: SNAP_THRESHOLD + 1, x: px, line: null };
    let bestY = { delta: SNAP_THRESHOLD + 1, y: py, line: null };
    for (const r of anchors) {
      // [sürüklenen kenar, hedef hiza çizgisi, yapışınca yeni x]
      const xPairs = [
        [px, r.x, r.x], // sol-sol
        [px + w, r.x + r.w, r.x + r.w - w], // sağ-sağ
        [px + w / 2, r.x + r.w / 2, r.x + r.w / 2 - w / 2], // merkez-merkez
        [px, r.x + r.w, r.x + r.w], // sol kenar → hedef sağ (bitişik sağ)
        [px + w, r.x, r.x - w], // sağ kenar → hedef sol (bitişik sol)
      ];
      for (const [edge, line, snapX] of xPairs) {
        const d = Math.abs(edge - line);
        if (d < bestX.delta) bestX = { delta: d, x: snapX, line };
      }
      const yPairs = [
        [py, r.y, r.y],
        [py + h, r.y + r.h, r.y + r.h - h],
        [py + h / 2, r.y + r.h / 2, r.y + r.h / 2 - h / 2],
        [py, r.y + r.h, r.y + r.h],
        [py + h, r.y, r.y - h],
      ];
      for (const [edge, line, snapY] of yPairs) {
        const d = Math.abs(edge - line);
        if (d < bestY.delta) bestY = { delta: d, y: snapY, line };
      }
    }
    const g = { v: [], h: [] };
    let nx = px;
    let ny = py;
    if (bestX.delta <= SNAP_THRESHOLD) {
      nx = Math.round(bestX.x);
      g.v.push(Math.round(bestX.line));
    }
    if (bestY.delta <= SNAP_THRESHOLD) {
      ny = Math.round(bestY.y);
      g.h.push(Math.round(bestY.line));
    }
    return { x: nx, y: ny, guides: g };
  }

  useEffect(() => {
    function updateScale() {
      if (!canvasWrapperRef.current) return;
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      const availableW = rect.width - 16;
      const availableH = rect.height - 16;
      if (availableW <= 0 || availableH <= 0) return;
      const sW = availableW / CANVAS_W;
      const sH = availableH / CANVAS_H;
      setScale(Math.min(1, sW, sH));
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    const t1 = setTimeout(updateScale, 50);
    const t2 = setTimeout(updateScale, 250);
    return () => {
      window.removeEventListener('resize', updateScale);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  useEffect(() => watchCollection('tables', setTables, orderBy('siraNo', 'asc')), []);
  useEffect(() => watchCollection('decorations', setDecorations), []);
  useEffect(
    () =>
      watchCollection(
        'orders',
        setActiveOrders,
        where('durum', 'in', ['aktif', 'hazirlandi', 'masayaGitti']),
      ),
    [],
  );

  const zones = useMemo(() => {
    // Her zaman görünmesini istediğimiz bölgeler (henüz masası olmasa bile)
    const ALWAYS = ['ic', 'dis'];
    const set = new Set(ALWAYS);
    tables.forEach((t) => set.add(t.zone || 'ic'));
    decorations.forEach((d) => set.add(d.zone || 'ic'));
    return [...set];
  }, [tables, decorations]);

  useEffect(() => {
    if (zones.length === 0) return;
    if (!zone || !zones.includes(zone)) setZone(zones[0]);
  }, [zones, zone]);

  const ordersByTable = useMemo(() => {
    const map = {};
    for (const o of activeOrders) if (o.masaId) map[o.masaId] = o;
    return map;
  }, [activeOrders]);

  const tablesInZone = tables.filter((t) => (t.zone || 'ic') === zone);
  const decorsInZone = decorations.filter((d) => (d.zone || 'ic') === zone);

  const selectedTable =
    selected?.kind === 'table' ? tables.find((t) => t.id === selected.id) : null;
  const selectedDecor =
    selected?.kind === 'decor' ? decorations.find((d) => d.id === selected.id) : null;

  const dirty =
    Object.keys(localTablePos).length > 0 ||
    Object.keys(localTableSize).length > 0 ||
    Object.keys(localDecorPos).length > 0;

  function handleStartDragTable(e, table) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: 'table', id: table.id });

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = localTablePos[table.id]?.x ?? table.x ?? 0;
    const origY = localTablePos[table.id]?.y ?? table.y ?? 0;
    const { w: tableW, h: tableH } = effectiveSizeTable(table);
    const currentScale = scale || 1;

    const anchors = alignmentAnchors('table', table.id);

    function onMove(ev) {
      const dx = (ev.clientX - startX) / currentScale;
      const dy = (ev.clientY - startY) / currentScale;
      const rawX = clamp(Math.round(origX + dx), 0, CANVAS_W - tableW);
      const rawY = clamp(Math.round(origY + dy), 0, CANVAS_H - tableH);
      const al = computeAlignment(anchors, rawX, rawY, tableW, tableH);
      setLocalTablePos((prev) => ({ ...prev, [table.id]: { x: al.x, y: al.y } }));
      setGuides(al.guides);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setGuides(null);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  // Kenar/köşe tutamacından boyutlandırma. dir: 'n','s','e','w','ne','nw','se','sw'
  // Dönme-duyarlı: ekran hareketi masanın yerel eksenine projekte edilir; döndürme
  // merkez etrafında olduğu için sabit kalması gereken kenar yerinde tutulur.
  function handleStartResizeTable(e, table, dir) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: 'table', id: table.id });

    const MIN = 40;
    const startX = e.clientX;
    const startY = e.clientY;
    const pos = effectivePosTable(table);
    const size = effectiveSizeTable(table);
    const x0 = pos.x;
    const y0 = pos.y;
    const w0 = size.w;
    const h0 = size.h;
    const cx0 = x0 + w0 / 2;
    const cy0 = y0 + h0 / 2;
    const currentScale = scale || 1;
    const theta = ((table.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    // Hangi yerel kenarlar hareket ediyor: +1 sağ/alt, -1 sol/üst, 0 sabit
    const sx = (dir.includes('e') ? 1 : 0) + (dir.includes('w') ? -1 : 0);
    const sy = (dir.includes('s') ? 1 : 0) + (dir.includes('n') ? -1 : 0);

    function onMove(ev) {
      const dx = (ev.clientX - startX) / currentScale;
      const dy = (ev.clientY - startY) / currentScale;
      // Ekran delta'sını masanın yerel eksenlerine projekte et
      const dLocalX = dx * cos + dy * sin;
      const dLocalY = -dx * sin + dy * cos;

      const w1 = clamp(Math.round(w0 + sx * dLocalX), MIN, CANVAS_W);
      const h1 = clamp(Math.round(h0 + sy * dLocalY), MIN, CANVAS_H);

      // Karşı kenarı sabit tutmak için merkezi yerel eksende kaydır, ekran koordinatına çevir
      const shiftLocalX = (sx * (w1 - w0)) / 2;
      const shiftLocalY = (sy * (h1 - h0)) / 2;
      const cx1 = cx0 + shiftLocalX * cos - shiftLocalY * sin;
      const cy1 = cy0 + shiftLocalX * sin + shiftLocalY * cos;
      const nx = Math.round(cx1 - w1 / 2);
      const ny = Math.round(cy1 - h1 / 2);

      setLocalTableSize((prev) => ({ ...prev, [table.id]: { w: w1, h: h1 } }));
      setLocalTablePos((prev) => ({ ...prev, [table.id]: { x: nx, y: ny } }));
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function handleStartDragDecor(e, decor) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: 'decor', id: decor.id });

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = localDecorPos[decor.id]?.x ?? decor.x ?? 0;
    const origY = localDecorPos[decor.id]?.y ?? decor.y ?? 0;
    const decW = decor.w || 100;
    const decH = decor.h || 60;
    const currentScale = scale || 1;

    const anchors = alignmentAnchors('decor', decor.id);

    function onMove(ev) {
      const dx = (ev.clientX - startX) / currentScale;
      const dy = (ev.clientY - startY) / currentScale;
      const rawX = clamp(Math.round(origX + dx), 0, CANVAS_W - decW);
      const rawY = clamp(Math.round(origY + dy), 0, CANVAS_H - decH);
      const al = computeAlignment(anchors, rawX, rawY, decW, decH);
      setLocalDecorPos((prev) => ({ ...prev, [decor.id]: { x: al.x, y: al.y } }));
      setGuides(al.guides);
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setGuides(null);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  async function saveLayout() {
    try {
      const batch = writeBatch(db);
      // Aynı masaya ait pozisyon + boyut değişikliklerini tek update'te birleştir
      const tableIds = new Set([
        ...Object.keys(localTablePos),
        ...Object.keys(localTableSize),
      ]);
      for (const id of tableIds) {
        const update = { updatedAt: serverTimestamp() };
        const pos = localTablePos[id];
        if (pos) {
          update.x = pos.x;
          update.y = pos.y;
        }
        const size = localTableSize[id];
        if (size) {
          update.customW = size.w;
          update.customH = size.h;
        }
        batch.update(doc(db, 'tables', id), update);
      }
      for (const [id, pos] of Object.entries(localDecorPos)) {
        batch.update(doc(db, 'decorations', id), {
          x: pos.x,
          y: pos.y,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setLocalTablePos({});
      setLocalTableSize({});
      setLocalDecorPos({});
      toast.success('Yerleşim kaydedildi');
    } catch (err) {
      console.error(err);
      toast.error('Yerleşim kaydedilemedi');
    }
  }

  async function handleDeleteAll() {
    const activeIds = Object.keys(ordersByTable);
    if (activeIds.length > 0) {
      toast.error(`${activeIds.length} masada aktif sipariş var, önce ödemelerini alın.`);
      return;
    }
    setDeleting(true);
    try {
      const batch = writeBatch(db);
      for (const t of tables) {
        batch.delete(doc(db, 'tables', t.id));
      }
      await batch.commit();
      toast.success(`${tables.length} masa silindi`);
      setDeleteAllOpen(false);
      setDeleteConfirmText('');
      setSelected(null);
      setLocalTablePos({});
    } catch (err) {
      console.error(err);
      toast.error('Silme hatası: ' + (err?.message || err));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteTable(table) {
    if (ordersByTable[table.id]) {
      toast.error(`${table.ad} masasında aktif sipariş var, önce ödemeyi al.`);
      return;
    }
    if (!confirm(`"${table.ad}" silinsin mi?`)) return;
    try {
      await removeDoc('tables', table.id);
      toast.success('Masa silindi');
      setSelected(null);
      setLocalTablePos((prev) => {
        const cp = { ...prev };
        delete cp[table.id];
        return cp;
      });
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  }

  async function handleDeleteDecor(decor) {
    if (!confirm(`"${decor.label || decor.tip}" silinsin mi?`)) return;
    try {
      await removeDoc('decorations', decor.id);
      toast.success('Öğe silindi');
      setSelected(null);
      setLocalDecorPos((prev) => {
        const cp = { ...prev };
        delete cp[decor.id];
        return cp;
      });
    } catch (err) {
      console.error(err);
      toast.error('Silinemedi');
    }
  }

  async function addDecoration(tip) {
    if (!zone) {
      toast.error('Önce bir bölge seç');
      return;
    }
    const preset = DECOR_PRESETS[tip];
    try {
      const id = await createDoc('decorations', {
        tip,
        zone,
        x: Math.round(CANVAS_W / 2 - preset.w / 2),
        y: Math.round(CANVAS_H / 2 - preset.h / 2),
        w: preset.w,
        h: preset.h,
        label: preset.label,
      });
      setSelected({ kind: 'decor', id });
      toast.success(`${preset.label || tip} eklendi`);
    } catch (err) {
      console.error(err);
      toast.error('Öğe eklenemedi');
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 pt-5">
        <PageHeader
          title="Masa Yönetimi"
          subtitle="Salon yerleşimini sürükle-bırak ile düzenle"
          actions={
            <>
              {tables.length > 0 && (
                <button
                  onClick={() => setDeleteAllOpen(true)}
                  className="btn-ghost text-red-600 hover:bg-red-50"
                  title="Tüm masaları sil (yeniden kurulum için)"
                >
                  <Trash2 size={16} /> Tümünü Sil
                </button>
              )}
              {dirty && (
                <>
                  <button
                    onClick={() => {
                      setLocalTablePos({});
                      setLocalTableSize({});
                      setLocalDecorPos({});
                    }}
                    className="btn-secondary"
                  >
                    <RotateCcw size={16} /> İptal
                  </button>
                  <button onClick={saveLayout} className="btn-primary">
                    <Save size={16} /> Yerleşimi Kaydet
                  </button>
                </>
              )}
            </>
          }
        />
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-8 py-2">
        {zones.map((z) => {
          const count = tables.filter((t) => (t.zone || 'ic') === z).length;
          return (
            <button
              key={z}
              onClick={() => {
                setZone(z);
                setSelected(null);
              }}
              className={`rounded-lg px-4 py-1.5 text-sm transition ${
                zone === z
                  ? 'bg-blue-100 font-medium text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {ZONE_LABELS[z] || z}
              <span
                className={`ml-1.5 rounded-full px-1.5 text-xs ${
                  zone === z ? 'bg-white text-blue-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={canvasWrapperRef}
          className="flex flex-1 items-start justify-center overflow-hidden bg-slate-100 p-2"
        >
          <div
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
            }}
          >
          <div
            ref={canvasRef}
            className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white shadow-inner"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            {tablesInZone.length === 0 && decorsInZone.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                <MapPin size={48} />
                <p className="text-sm">Bu bölgede henüz öğe yok.</p>
                <button
                  onClick={() => {
                    setEditing(null);
                    setModal('add');
                  }}
                  className="btn-primary"
                >
                  <Plus size={16} /> İlk Masayı Ekle
                </button>
              </div>
            ) : (
              <>
                {decorsInZone.map((d) => {
                  const pos = localDecorPos[d.id] || { x: d.x ?? 0, y: d.y ?? 0 };
                  return (
                    <CanvasDecoration
                      key={d.id}
                      decor={d}
                      x={pos.x}
                      y={pos.y}
                      selected={selected?.kind === 'decor' && selected.id === d.id}
                      onPointerDown={(e) => handleStartDragDecor(e, d)}
                    />
                  );
                })}
                {tablesInZone.map((t) => {
                  const pos = localTablePos[t.id] || { x: t.x ?? 0, y: t.y ?? 0 };
                  const sz = effectiveSizeTable(t);
                  return (
                    <CanvasTable
                      key={t.id}
                      table={t}
                      x={pos.x}
                      y={pos.y}
                      w={sz.w}
                      h={sz.h}
                      isOccupied={!!ordersByTable[t.id]}
                      selected={selected?.kind === 'table' && selected.id === t.id}
                      onPointerDown={(e) => handleStartDragTable(e, t)}
                      onStartResize={(e, dir) => handleStartResizeTable(e, t, dir)}
                    />
                  );
                })}

                {/* Sürüklerken hizalama çizgileri (mavi) */}
                {guides && (
                  <>
                    {guides.v.map((gx, i) => (
                      <div
                        key={`gv-${i}`}
                        className="pointer-events-none absolute top-0 bottom-0 z-40 w-px bg-blue-500"
                        style={{ left: gx }}
                      />
                    ))}
                    {guides.h.map((gy, i) => (
                      <div
                        key={`gh-${i}`}
                        className="pointer-events-none absolute left-0 right-0 z-40 h-px bg-blue-500"
                        style={{ top: gy }}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
          </div>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Öğe Ekle
          </h3>
          <button
            onClick={() => {
              setEditing(null);
              setModal('add');
            }}
            className="btn-primary mb-3 flex w-full items-center justify-center gap-1.5"
          >
            <Plus size={16} /> Yeni Masa
          </button>
          <div className="mb-6 grid grid-cols-3 gap-2">
            <DecorButton tip="bar" onClick={() => addDecoration('bar')} />
            <DecorButton tip="mutfak" onClick={() => addDecoration('mutfak')} />
            <DecorButton tip="kasa" onClick={() => addDecoration('kasa')} />
            <DecorButton tip="wc" onClick={() => addDecoration('wc')} />
            <DecorButton tip="cikis" onClick={() => addDecoration('cikis')} />
            <DecorButton tip="kapi" onClick={() => addDecoration('kapi')} />
            <DecorButton tip="duvar" onClick={() => addDecoration('duvar')} />
            <DecorButton tip="merdiven" onClick={() => addDecoration('merdiven')} />
            <DecorButton tip="etiket" onClick={() => addDecoration('etiket')} />
          </div>

          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Seçili
          </h3>
          {!selectedTable && !selectedDecor ? (
            <p className="text-sm text-slate-400">
              Bir öğeye tıkla veya canvas'a tıklayarak seçimi temizle.
            </p>
          ) : selectedTable ? (
            <SelectedTablePanel
              table={selectedTable}
              order={ordersByTable[selectedTable.id]}
              onEdit={() => {
                setEditing(selectedTable);
                setModal('edit');
              }}
              onDelete={() => handleDeleteTable(selectedTable)}
              onUpdate={(patch) => patchDoc('tables', selectedTable.id, patch)}
              size={effectiveSizeTable(selectedTable)}
              isCustomSize={
                selectedTable.customW != null || localTableSize[selectedTable.id] != null
              }
              onResetSize={() => {
                setLocalTableSize((prev) => {
                  const cp = { ...prev };
                  delete cp[selectedTable.id];
                  return cp;
                });
                patchDoc('tables', selectedTable.id, { customW: null, customH: null });
              }}
            />
          ) : (
            <SelectedDecorPanel
              decor={selectedDecor}
              onDelete={() => handleDeleteDecor(selectedDecor)}
              onUpdate={(patch) => patchDoc('decorations', selectedDecor.id, patch)}
            />
          )}

          <div className="mt-8 rounded-lg bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <Info size={14} />
              <span>İpucu</span>
            </div>
            <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
              <li>• Herhangi bir öğeyi sürükleyerek konumunu değiştir</li>
              <li>• Yeni öğeleri yukarıdaki butonlardan ekle</li>
              <li>• Değişiklikler "Yerleşimi Kaydet" ile uygulanır</li>
              <li>• Dolu masalar silinemez (önce ödemeyi al)</li>
            </ul>
          </div>
        </aside>
      </div>

      <TableModal
        open={modal === 'add' || modal === 'edit'}
        editing={modal === 'edit' ? editing : null}
        zone={zone}
        zones={zones}
        tablesCount={tables.length}
        onClose={() => setModal(null)}
        onSaved={(id) => {
          if (id) setSelected({ kind: 'table', id });
          setModal(null);
        }}
      />

      <Modal
        open={deleteAllOpen}
        onClose={() => {
          if (deleting) return;
          setDeleteAllOpen(false);
          setDeleteConfirmText('');
        }}
        title="Tüm masaları sil"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setDeleteAllOpen(false);
                setDeleteConfirmText('');
              }}
              disabled={deleting}
              className="btn-secondary"
            >
              İptal
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'SİL'}
              className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Siliniyor…' : `${tables.length} masayı sil`}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <strong>{tables.length} masa</strong> kalıcı olarak silinecek. Geri alınamaz.
            Aktif siparişi olan masalar varsa işlem iptal edilir.
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Onaylamak için <strong>SİL</strong> yazın
            </label>
            <input
              autoFocus
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="input font-mono uppercase tracking-widest"
              placeholder="SİL"
              disabled={deleting}
            />
          </div>
          <p className="text-xs text-slate-500">
            Not: Bu işlem dekorları (BAR, MUTFAK, KASA vb.) silmez — sadece masaları siler.
          </p>
        </div>
      </Modal>
    </div>
  );
}

function DecorButton({ tip, onClick }) {
  const preset = DECOR_PRESETS[tip];
  const Icon = preset.icon;
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-700 transition hover:border-blue-400 hover:bg-blue-50"
    >
      {Icon ? (
        <Icon size={18} className="text-slate-600" />
      ) : (
        <Square size={18} className="text-slate-600" />
      )}
      <span className="text-[10px] capitalize">{preset.label || tip}</span>
    </button>
  );
}

// Boyutlandırma tutamaçları — köşeler + kenarlar
const RESIZE_HANDLES = [
  { dir: 'nw', cls: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2' },
  { dir: 'n', cls: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2' },
  { dir: 'ne', cls: 'right-0 top-0 translate-x-1/2 -translate-y-1/2' },
  { dir: 'e', cls: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2' },
  { dir: 'se', cls: 'right-0 bottom-0 translate-x-1/2 translate-y-1/2' },
  { dir: 's', cls: 'left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2' },
  { dir: 'sw', cls: 'left-0 bottom-0 -translate-x-1/2 translate-y-1/2' },
  { dir: 'w', cls: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2' },
];

// Tutamacın boyutlandırma ekseni (0=yatay ew, 90=dikey ns, 45/135=çapraz) — masa
// dönünce ekseni de döner, ekran açısına en yakın cursor'u seç
const RESIZE_AXIS = { e: 0, w: 0, n: 90, s: 90, ne: 135, sw: 135, nw: 45, se: 45 };
function resizeCursor(dir, rotation) {
  const angle = (((RESIZE_AXIS[dir] + rotation) % 180) + 180) % 180;
  const opts = [
    [0, 'ew-resize'],
    [45, 'nwse-resize'],
    [90, 'ns-resize'],
    [135, 'nesw-resize'],
  ];
  let best = 'ew-resize';
  let bestDelta = 999;
  for (const [a, cur] of opts) {
    const d = Math.min(Math.abs(angle - a), 180 - Math.abs(angle - a));
    if (d < bestDelta) {
      bestDelta = d;
      best = cur;
    }
  }
  return best;
}

function CanvasTable({ table, x, y, w, h, isOccupied, selected, onPointerDown, onStartResize }) {
  const durum = isOccupied ? 'dolu' : table.durum || 'bos';
  const color = DURUM_COLORS[durum] || DURUM_COLORS.bos;
  const round = table.sekil === 'yuvarlak' ? 'rounded-full' : 'rounded-lg';
  const rotation = table.rotation || 0;

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute z-10 flex cursor-move select-none flex-col items-center justify-center border-2 text-white shadow-md transition-shadow ${round} ${color} ${
        selected ? 'ring-4 ring-blue-400 ring-offset-2' : ''
      }`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        touchAction: 'none',
        zIndex: selected ? 50 : undefined,
      }}
    >
      <span className="text-sm font-bold leading-tight">{table.ad}</span>
      <span className="mt-0.5 flex items-center gap-0.5 text-xs opacity-90">
        <UsersIcon size={11} />
        {table.kapasite}
      </span>

      {selected &&
        RESIZE_HANDLES.map((handle) => (
          <div
            key={handle.dir}
            onPointerDown={(e) => onStartResize(e, handle.dir)}
            className={`absolute z-50 h-3 w-3 rounded-full border-2 border-blue-500 bg-white shadow ${handle.cls}`}
            style={{ touchAction: 'none', cursor: resizeCursor(handle.dir, rotation) }}
          />
        ))}
    </div>
  );
}

function CanvasDecoration({ decor, x, y, selected, onPointerDown }) {
  const preset = DECOR_PRESETS[decor.tip] || DECOR_PRESETS.etiket;
  const Icon = preset.icon;
  const w = decor.w || preset.w;
  const h = decor.h || preset.h;
  const label = decor.label ?? preset.label;
  const isVertical = h > w * 1.5;
  const showIcon = Icon && Math.min(w, h) >= 30;
  const rounded = preset.noRounded ? '' : 'rounded-md';

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute flex cursor-move select-none items-center justify-center gap-1 border-2 shadow-sm transition-shadow ${rounded} ${preset.className} ${
        selected ? 'ring-4 ring-blue-400 ring-offset-2' : ''
      } ${isVertical ? 'flex-col' : 'flex-row'}`}
      style={{ left: x, top: y, width: w, height: h, touchAction: 'none', zIndex: selected ? 50 : undefined }}
    >
      {showIcon && <Icon size={Math.min(w, h) >= 50 ? 18 : 14} className={preset.iconColor} />}
      {label && (
        <span
          className="px-1 truncate"
          style={isVertical ? { writingMode: 'vertical-rl', textOrientation: 'mixed' } : undefined}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function SelectedTablePanel({ table, order, onEdit, onDelete, onUpdate, size, isCustomSize, onResetSize }) {
  const durum = order ? 'dolu' : table.durum || 'bos';
  const durumLabels = { bos: 'Boş', dolu: 'Dolu', rezerve: 'Rezerve' };
  const rotation = ((table.rotation || 0) % 360 + 360) % 360;
  const rotateBy = (delta) =>
    onUpdate?.({ rotation: ((table.rotation || 0) + delta) % 360 });
  const toggleSekil = () =>
    onUpdate?.({ sekil: table.sekil === 'yuvarlak' ? 'kare' : 'yuvarlak' });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-bold text-slate-900">{table.ad}</p>
        <p className="text-sm text-slate-500">
          Masa · {ZONE_LABELS[table.zone] || table.zone || 'İç Salon'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Kapasite</p>
          <p className="text-lg font-semibold text-slate-900">{table.kapasite}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Durum</p>
          <p
            className={`text-lg font-semibold ${
              durum === 'bos'
                ? 'text-emerald-600'
                : durum === 'dolu'
                  ? 'text-red-600'
                  : 'text-amber-600'
            }`}
          >
            {durumLabels[durum] || durum}
          </p>
        </div>
      </div>

      {order && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">Aktif sipariş var</p>
          <p className="text-xs">Garson: {order.garsonAd}</p>
        </div>
      )}

      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
          <span>Döndür</span>
          <span className="tabular-nums text-slate-400">{rotation}°</span>
        </label>
        <div className="flex gap-2">
          <button onClick={() => rotateBy(-15)} className="btn-secondary flex-1" title="15° sola">
            <RotateCcw size={14} /> -15°
          </button>
          <button onClick={() => rotateBy(15)} className="btn-secondary flex-1" title="15° sağa">
            <RotateCw size={14} /> +15°
          </button>
          <button
            onClick={() => onUpdate?.({ rotation: 0 })}
            disabled={rotation === 0}
            className="btn-secondary shrink-0 disabled:opacity-40"
            title="Sıfırla"
          >
            0°
          </button>
        </div>
      </div>

      <button onClick={toggleSekil} className="btn-secondary w-full">
        {table.sekil === 'yuvarlak' ? <Square size={14} /> : <Circle size={14} />}
        {table.sekil === 'yuvarlak' ? 'Kare yap' : 'Yuvarlak yap'}
      </button>

      <div>
        <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
          <span>Boyut</span>
          <span className="tabular-nums text-slate-400">
            {size ? `${Math.round(size.w)} × ${Math.round(size.h)} px` : '—'}
          </span>
        </label>
        <p className="mb-2 text-xs text-slate-400">
          Masayı seçince kenar/köşelerinden tutup sürükleyerek boyutlandır.
        </p>
        <button
          onClick={onResetSize}
          disabled={!isCustomSize}
          className="btn-secondary w-full disabled:opacity-40"
        >
          <RotateCcw size={14} /> Varsayılan boyuta dön
        </button>
      </div>

      <div className="flex gap-2">
        <button onClick={onEdit} className="btn-secondary flex-1">
          <Pencil size={14} /> Düzenle
        </button>
        <button
          onClick={onDelete}
          disabled={!!order}
          className="btn-danger flex-1 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} /> Sil
        </button>
      </div>
    </div>
  );
}

function SelectedDecorPanel({ decor, onDelete, onUpdate }) {
  const preset = DECOR_PRESETS[decor.tip] || DECOR_PRESETS.etiket;
  const [label, setLabel] = useState(decor.label ?? preset.label ?? '');
  const [w, setW] = useState(decor.w || preset.w);
  const [h, setH] = useState(decor.h || preset.h);

  useEffect(() => {
    setLabel(decor.label ?? preset.label ?? '');
    setW(decor.w || preset.w);
    setH(decor.h || preset.h);
  }, [decor.id]);

  const debouncedSave = useMemo(() => {
    let timer;
    return (patch) => {
      clearTimeout(timer);
      timer = setTimeout(() => onUpdate(patch), 400);
    };
  }, [decor.id]);

  function rotate90() {
    const newW = h;
    const newH = w;
    setW(newW);
    setH(newH);
    onUpdate({ w: newW, h: newH });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-bold text-slate-900 capitalize">
          {preset.label || decor.tip}
        </p>
        <p className="text-sm text-slate-500">Dekoratif öğe</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700">Etiket</label>
        <input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            debouncedSave({ label: e.target.value });
          }}
          className="input"
          placeholder="örn. Bar, Çıkış..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Genişlik</label>
          <input
            type="number"
            value={w}
            min={4}
            max={600}
            onChange={(e) => {
              const newW = Number(e.target.value) || preset.w;
              setW(newW);
              debouncedSave({ w: newW });
            }}
            className="input"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Yükseklik</label>
          <input
            type="number"
            value={h}
            min={4}
            max={500}
            onChange={(e) => {
              const newH = Number(e.target.value) || preset.h;
              setH(newH);
              debouncedSave({ h: newH });
            }}
            className="input"
          />
        </div>
      </div>

      <button onClick={rotate90} className="btn-secondary w-full">
        <RotateCw size={14} /> 90° Çevir (Yatay ⇄ Dikey)
      </button>

      <button onClick={onDelete} className="btn-danger w-full">
        <Trash2 size={14} /> Sil
      </button>
    </div>
  );
}

function TableModal({ open, editing, zone, zones, tablesCount, onClose, onSaved }) {
  const isEdit = !!editing;
  const [isCustomZone, setIsCustomZone] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(tableSchema),
    defaultValues: { ad: '', zone: zone || 'ic', kapasite: 4, sekil: 'kare' },
  });

  useEffect(() => {
    if (open) {
      const defaults = editing
        ? {
            ad: editing.ad,
            zone: editing.zone || 'ic',
            kapasite: editing.kapasite,
            sekil: editing.sekil || 'kare',
          }
        : { ad: '', zone: zone || 'ic', kapasite: 4, sekil: 'kare' };
      reset(defaults);
      setIsCustomZone(false);
    }
  }, [open, editing, zone, reset]);

  const selectedKapasite = Number(watch('kapasite') || 4);
  const selectedSekil = watch('sekil') || 'kare';
  const dims = defaultSize(selectedKapasite, selectedSekil);

  const onSubmit = async (data) => {
    try {
      const { w, h } = defaultSize(data.kapasite, data.sekil);
      if (isEdit) {
        await patchDoc('tables', editing.id, {
          ad: data.ad,
          zone: data.zone,
          kapasite: data.kapasite,
          sekil: data.sekil,
          w,
          h,
        });
        toast.success('Masa güncellendi');
        onSaved(editing.id);
      } else {
        const id = await createDoc('tables', {
          ad: data.ad,
          zone: data.zone,
          kapasite: data.kapasite,
          sekil: data.sekil,
          x: Math.round(CANVAS_W / 2 - w / 2),
          y: Math.round(CANVAS_H / 2 - h / 2),
          w,
          h,
          rotation: 0,
          durum: 'bos',
          grupId: null,
          rezervasyonNotu: null,
          siraNo: tablesCount,
        });
        toast.success('Masa eklendi');
        onSaved(id);
      }
    } catch (err) {
      console.error(err);
      toast.error('Kayıt hatası');
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Masa Düzenle' : 'Yeni Masa'}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="table-form"
            disabled={isSubmitting}
            className="btn-primary"
          >
            {isEdit ? 'Güncelle' : 'Ekle'}
          </button>
        </>
      }
    >
      <form id="table-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Masa Adı</label>
          <input {...register('ad')} className="input" autoFocus placeholder="Masa 1, M-A, Teras-3..." />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Bölge</label>
          {!isCustomZone ? (
            <select
              value={watch('zone')}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setIsCustomZone(true);
                  setValue('zone', '');
                } else {
                  setValue('zone', e.target.value);
                }
              }}
              className="input"
            >
              {Object.entries(ZONE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
              {zones
                .filter((z) => !ZONE_LABELS[z])
                .map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              <option value="__new__">+ Yeni bölge yaz...</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input
                {...register('zone')}
                className="input"
                placeholder="Örn: VIP Salon"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  setIsCustomZone(false);
                  setValue('zone', zone || 'ic');
                }}
                className="btn-secondary shrink-0"
              >
                İptal
              </button>
            </div>
          )}
          {errors.zone && <p className="mt-1 text-xs text-red-600">{errors.zone.message}</p>}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Kapasite (kişi)</label>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 4, 6, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setValue('kapasite', n)}
                className={`rounded-lg border-2 py-3 text-sm font-semibold transition ${
                  selectedKapasite === n
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <input type="hidden" {...register('kapasite', { valueAsNumber: true })} />
          {errors.kapasite && (
            <p className="mt-1 text-xs text-red-600">{errors.kapasite.message}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Masa Tipi</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'kare', label: 'Kare', Icon: Square, round: 'rounded-md' },
              { value: 'yuvarlak', label: 'Yuvarlak', Icon: Circle, round: 'rounded-full' },
            ].map(({ value, label, Icon, round }) => (
              <button
                key={value}
                type="button"
                onClick={() => setValue('sekil', value)}
                className={`flex items-center justify-center gap-2 border-2 py-3 text-sm font-semibold transition ${round} ${
                  selectedSekil === value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>
          <input type="hidden" {...register('sekil')} />
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <p>
            Boyut otomatik: <strong>{dims.w}×{dims.h}px</strong> ({selectedSekil === 'yuvarlak' ? 'yuvarlak' : 'kare'}).
            Konumu ve açısını sonradan canvas'tan ayarlayabilirsiniz.
          </p>
        </div>
      </form>
    </Modal>
  );
}
