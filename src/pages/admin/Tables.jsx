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
  DoorOpen,
  Square,
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

const ZONE_LABELS = {
  ic: 'İç Salon',
  dis: 'Dış Mekan',
  teras: 'Teras',
  bahce: 'Bahçe',
  bar: 'Bar',
  kapali: 'Kapalı Alan',
};

const SIZE_PRESETS = [
  { kapasite: 2, w: 70, h: 70 },
  { kapasite: 4, w: 90, h: 90 },
  { kapasite: 6, w: 110, h: 110 },
  { kapasite: 8, w: 130, h: 130 },
];

const DURUM_COLORS = {
  bos: 'bg-emerald-500 border-emerald-700',
  dolu: 'bg-red-500 border-red-700',
  rezerve: 'bg-amber-500 border-amber-700',
};

const DECOR_PRESETS = {
  bar: {
    label: 'BAR',
    icon: Wine,
    w: 220,
    h: 50,
    iconColor: 'text-amber-100',
    // counter look: amber gradient with dark top "trim"
    className:
      'bg-gradient-to-b from-amber-900 to-amber-700 text-amber-50 border-amber-950 tracking-widest font-bold uppercase',
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
    icon: null,
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
  return preset ? { w: preset.w, h: preset.h } : { w: 130, h: 130 };
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
  const [localDecorPos, setLocalDecorPos] = useState({});
  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const canvasRef = useRef(null);

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
    const set = new Set();
    tables.forEach((t) => set.add(t.zone || 'ic'));
    decorations.forEach((d) => set.add(d.zone || 'ic'));
    if (set.size === 0) set.add('ic');
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
    Object.keys(localTablePos).length > 0 || Object.keys(localDecorPos).length > 0;

  function handleStartDragTable(e, table) {
    e.preventDefault();
    e.stopPropagation();
    setSelected({ kind: 'table', id: table.id });

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = localTablePos[table.id]?.x ?? table.x ?? 0;
    const origY = localTablePos[table.id]?.y ?? table.y ?? 0;
    const tableW = table.w || sizeFor(table.kapasite).w;
    const tableH = table.h || sizeFor(table.kapasite).h;
    const currentScale = scale || 1;

    function onMove(ev) {
      const dx = (ev.clientX - startX) / currentScale;
      const dy = (ev.clientY - startY) / currentScale;
      const newX = clamp(Math.round(origX + dx), 0, CANVAS_W - tableW);
      const newY = clamp(Math.round(origY + dy), 0, CANVAS_H - tableH);
      setLocalTablePos((prev) => ({ ...prev, [table.id]: { x: newX, y: newY } }));
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

    function onMove(ev) {
      const dx = (ev.clientX - startX) / currentScale;
      const dy = (ev.clientY - startY) / currentScale;
      const newX = clamp(Math.round(origX + dx), 0, CANVAS_W - decW);
      const newY = clamp(Math.round(origY + dy), 0, CANVAS_H - decH);
      setLocalDecorPos((prev) => ({ ...prev, [decor.id]: { x: newX, y: newY } }));
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  async function saveLayout() {
    try {
      const batch = writeBatch(db);
      for (const [id, pos] of Object.entries(localTablePos)) {
        batch.update(doc(db, 'tables', id), {
          x: pos.x,
          y: pos.y,
          updatedAt: serverTimestamp(),
        });
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
      setLocalDecorPos({});
      toast.success('Yerleşim kaydedildi');
    } catch (err) {
      console.error(err);
      toast.error('Yerleşim kaydedilemedi');
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
        x: 60,
        y: 60,
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
              {dirty && (
                <>
                  <button
                    onClick={() => {
                      setLocalTablePos({});
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
              <button
                onClick={() => {
                  setEditing(null);
                  setModal('add');
                }}
                className="btn-primary"
              >
                <Plus size={16} /> Yeni Masa
              </button>
            </>
          }
        />
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 bg-white px-8 py-2">
        {zones.map((z) => {
          const count =
            tables.filter((t) => (t.zone || 'ic') === z).length +
            decorations.filter((d) => (d.zone || 'ic') === z).length;
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
                  return (
                    <CanvasTable
                      key={t.id}
                      table={t}
                      x={pos.x}
                      y={pos.y}
                      isOccupied={!!ordersByTable[t.id]}
                      selected={selected?.kind === 'table' && selected.id === t.id}
                      onPointerDown={(e) => handleStartDragTable(e, t)}
                    />
                  );
                })}
              </>
            )}
          </div>
          </div>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Öğe Ekle
          </h3>
          <div className="mb-6 grid grid-cols-3 gap-2">
            <DecorButton tip="bar" onClick={() => addDecoration('bar')} />
            <DecorButton tip="mutfak" onClick={() => addDecoration('mutfak')} />
            <DecorButton tip="wc" onClick={() => addDecoration('wc')} />
            <DecorButton tip="cikis" onClick={() => addDecoration('cikis')} />
            <DecorButton tip="duvar" onClick={() => addDecoration('duvar')} />
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

function CanvasTable({ table, x, y, isOccupied, selected, onPointerDown }) {
  const w = table.w || sizeFor(table.kapasite).w;
  const h = table.h || sizeFor(table.kapasite).h;
  const durum = isOccupied ? 'dolu' : table.durum || 'bos';
  const color = DURUM_COLORS[durum] || DURUM_COLORS.bos;

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute z-10 flex cursor-move select-none flex-col items-center justify-center rounded-xl border-2 text-white shadow-md transition-shadow ${color} ${
        selected ? 'ring-4 ring-blue-400 ring-offset-2' : ''
      }`}
      style={{ left: x, top: y, width: w, height: h, touchAction: 'none' }}
    >
      <span className="text-sm font-bold leading-tight">{table.ad}</span>
      <span className="mt-0.5 flex items-center gap-0.5 text-xs opacity-90">
        <UsersIcon size={11} />
        {table.kapasite}
      </span>
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
      style={{ left: x, top: y, width: w, height: h, touchAction: 'none' }}
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

function SelectedTablePanel({ table, order, onEdit, onDelete }) {
  const durum = order ? 'dolu' : table.durum || 'bos';
  const durumLabels = { bos: 'Boş', dolu: 'Dolu', rezerve: 'Rezerve' };

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
    defaultValues: { ad: '', zone: zone || 'ic', kapasite: 4 },
  });

  useEffect(() => {
    if (open) {
      const defaults = editing
        ? { ad: editing.ad, zone: editing.zone || 'ic', kapasite: editing.kapasite }
        : { ad: '', zone: zone || 'ic', kapasite: 4 };
      reset(defaults);
      setIsCustomZone(false);
    }
  }, [open, editing, zone, reset]);

  const selectedKapasite = Number(watch('kapasite') || 4);
  const dims = sizeFor(selectedKapasite);

  const onSubmit = async (data) => {
    try {
      const { w, h } = sizeFor(data.kapasite);
      if (isEdit) {
        await patchDoc('tables', editing.id, {
          ad: data.ad,
          zone: data.zone,
          kapasite: data.kapasite,
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
          x: 50,
          y: 50,
          w,
          h,
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
          <div className="grid grid-cols-4 gap-2">
            {[2, 4, 6, 8].map((n) => (
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

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <p>
            Boyut otomatik: <strong>{dims.w}×{dims.h}px</strong>. Konum sonradan canvas'tan ayarlanır.
          </p>
        </div>
      </form>
    </Modal>
  );
}
