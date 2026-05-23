import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Users as UsersIcon,
  Clock,
  AlertCircle,
  Link2,
  Link2Off,
  Wine,
  ChefHat,
  DoorOpen,
  Type,
  CalendarClock,
  Phone,
  User,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { watchCollection, orderBy, where } from '../../firebase/firestore';
import { formatTL, minutesSince } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/ui/Modal';
import { createTableGroup, dissolveTableGroup } from '../../firebase/tableGroups';
import { createReservation, cancelReservation } from '../../firebase/reservations';
import { reservationSchema } from '../../utils/validators';

const ZONE_LABELS = {
  ic: 'İç Salon',
  dis: 'Dış Mekan',
  teras: 'Teras',
  bahce: 'Bahçe',
  bar: 'Bar',
  kapali: 'Kapalı Alan',
};

const CANVAS_W = 1200;
const CANVAS_H = 700;

const DECOR_PRESETS = {
  bar: {
    icon: Wine,
    iconColor: 'text-amber-100',
    className:
      'bg-gradient-to-b from-amber-900 to-amber-700 text-amber-50 border-amber-950 tracking-widest font-bold uppercase',
  },
  mutfak: {
    icon: ChefHat,
    iconColor: 'text-orange-600',
    className:
      'bg-white text-orange-700 border-orange-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  wc: {
    icon: null,
    iconColor: 'text-blue-700',
    className:
      'bg-white text-blue-700 border-blue-500 border-[3px] font-bold text-xl',
  },
  cikis: {
    icon: DoorOpen,
    iconColor: 'text-emerald-700',
    className:
      'bg-white text-emerald-700 border-emerald-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  duvar: {
    icon: null,
    iconColor: '',
    className: 'bg-slate-700 border-slate-900',
    noRounded: true,
  },
  etiket: {
    icon: null,
    iconColor: '',
    className: 'bg-transparent text-slate-500 border-transparent italic text-xs',
    noRounded: true,
  },
};

function sizeFor(kapasite) {
  if (kapasite >= 8) return { w: 130, h: 130 };
  if (kapasite >= 6) return { w: 110, h: 110 };
  if (kapasite >= 4) return { w: 90, h: 90 };
  return { w: 70, h: 70 };
}

export default function PosTables() {
  const navigate = useNavigate();
  const { rol, user, profile } = useAuthStore();
  const [tables, setTables] = useState([]);
  const [groups, setGroups] = useState([]);
  const [decorations, setDecorations] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [zone, setZone] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [kisiPrompt, setKisiPrompt] = useState(null); // { masaId, masaAd, defaultKisi }
  const [reservePrompt, setReservePrompt] = useState(null); // { masaId, masaAd, defaultKisi }
  const [reserveDetail, setReserveDetail] = useState(null); // {table, reservation}
  const [reservations, setReservations] = useState([]);
  const [dragState, setDragState] = useState(null); // { tableId, x, y, draggingNow }
  const [pendingMerge, setPendingMerge] = useState(null); // { dragged, target }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => watchCollection('tables', setTables, orderBy('siraNo', 'asc')), []);
  useEffect(() => watchCollection('tableGroups', setGroups), []);
  useEffect(() => watchCollection('decorations', setDecorations), []);
  useEffect(
    () => watchCollection('reservations', setReservations, where('durum', '==', 'aktif')),
    [],
  );
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
    const set = new Set(tables.map((t) => t.zone || 'ic'));
    if (set.size === 0) set.add('ic');
    return [...set];
  }, [tables]);

  useEffect(() => {
    if (zones.length === 0) return;
    if (!zone || !zones.includes(zone)) setZone(zones[0]);
  }, [zones, zone]);

  const groupsById = useMemo(() => {
    const map = {};
    for (const g of groups) map[g.id] = g;
    return map;
  }, [groups]);

  const ordersByTable = useMemo(() => {
    const map = {};
    for (const o of activeOrders) {
      if (o.masaId) map[o.masaId] = o;
    }
    return map;
  }, [activeOrders]);

  const reservationsByTable = useMemo(() => {
    const map = {};
    for (const r of reservations) {
      if (r.masaId) map[r.masaId] = r;
    }
    return map;
  }, [reservations]);

  const tablesInZone = tables.filter((t) => (t.zone || 'ic') === zone);
  const decorsInZone = decorations.filter((d) => (d.zone || 'ic') === zone);

  function effectivePosition(t) {
    if (dragState?.tableId === t.id) {
      return { x: dragState.x, y: dragState.y };
    }
    if (t.grupId) {
      const g = groupsById[t.grupId];
      if (g?.positions?.[t.id]) {
        return { x: g.positions[t.id].x, y: g.positions[t.id].y };
      }
    }
    return { x: t.x ?? 0, y: t.y ?? 0 };
  }

  const counts = {
    bos: tables.filter((t) => t.durum === 'bos').length,
    dolu: tables.filter((t) => t.durum === 'dolu').length,
    rezerve: tables.filter((t) => t.durum === 'rezerve').length,
  };

  function rectFor(t, posOverride) {
    const w = t.w || sizeFor(t.kapasite).w;
    const h = t.h || sizeFor(t.kapasite).h;
    const x = posOverride?.x ?? t.x ?? 0;
    const y = posOverride?.y ?? t.y ?? 0;
    return { x, y, w, h };
  }

  function overlapsRect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  function findMergeTarget(draggedTable, currentPos) {
    const draggedRect = rectFor(draggedTable, currentPos);
    let best = null;
    let bestOverlap = 0;
    for (const other of tablesInZone) {
      if (other.id === draggedTable.id) continue;
      if (other.durum !== 'bos') continue;
      if (other.grupId) continue;
      const otherRect = rectFor(other);
      if (!overlapsRect(draggedRect, otherRect)) continue;
      // Compute overlap area as proxy for "best target"
      const ox =
        Math.min(draggedRect.x + draggedRect.w, otherRect.x + otherRect.w) -
        Math.max(draggedRect.x, otherRect.x);
      const oy =
        Math.min(draggedRect.y + draggedRect.h, otherRect.y + otherRect.h) -
        Math.max(draggedRect.y, otherRect.y);
      const area = Math.max(0, ox) * Math.max(0, oy);
      if (area > bestOverlap) {
        bestOverlap = area;
        best = other;
      }
    }
    return best;
  }

  function computeSnapPosition(target, dragged) {
    const t = rectFor(target);
    const dW = dragged.w || sizeFor(dragged.kapasite).w;
    const dH = dragged.h || sizeFor(dragged.kapasite).h;
    // Default: place to the right of target
    return { x: t.x + t.w + 4, y: t.y };
  }

  function handleTablePointerDown(e, table) {
    // Sadece boş ve gruplanmamış masalar sürüklenebilir
    const canDrag = table.durum === 'bos' && !table.grupId;
    if (!canDrag) {
      // Drag yok, click davranışı
      handleTableClick(table);
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = table.x ?? 0;
    const origY = table.y ?? 0;
    const tableW = table.w || sizeFor(table.kapasite).w;
    const tableH = table.h || sizeFor(table.kapasite).h;
    let dragged = false;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragged && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      dragged = true;
      const newX = clamp(Math.round(origX + dx), 0, CANVAS_W - tableW);
      const newY = clamp(Math.round(origY + dy), 0, CANVAS_H - tableH);
      setDragState({ tableId: table.id, x: newX, y: newY });
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const finalState = dragState;
      if (!dragged) {
        setDragState(null);
        handleTableClick(table);
        return;
      }
      // Check drop position for merge target
      // We need to read latest dragState — use setDragState callback to get current
      setDragState((latest) => {
        if (!latest) return null;
        const target = findMergeTarget(table, { x: latest.x, y: latest.y });
        if (target) {
          setPendingMerge({ dragged: table, target });
        }
        return null; // konum kalıcı değil — masa eski yerine snap'lenir
      });
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  const confirmPendingMerge = async () => {
    if (!pendingMerge) return;
    const { dragged, target } = pendingMerge;
    setSubmitting(true);
    try {
      const snapPos = computeSnapPosition(target, dragged);
      await createTableGroup({
        memberTables: [target, dragged],
        mainTableId: target.id,
        positions: { [dragged.id]: snapPos },
      });
      toast.success(`${target.ad} + ${dragged.ad} birleştirildi`);
      setPendingMerge(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Birleştirme başarısız');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDissolve = async (groupId) => {
    if (!confirm('Birleştirme kaldırılsın mı?')) return;
    try {
      await dissolveTableGroup({ groupId });
      toast.success('Birleştirme kaldırıldı');
      setSelectedTable(null);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Birleştirme kaldırılamadı');
    }
  };

  const openKisiPrompt = (masaId, masaAd, defaultKisi) => {
    setKisiPrompt({ masaId, masaAd, defaultKisi });
  };

  const handleTableClick = (table) => {
    // Grouped: redirect to main
    if (table.grupId) {
      const group = groupsById[table.grupId];
      if (!group) {
        toast.error('Grup bilgisi yüklenemedi');
        return;
      }
      const mainId = group.mainTableId;
      const mainOrder = ordersByTable[mainId];
      if (mainOrder) {
        setSelectedTable({ ...tables.find((t) => t.id === mainId), order: mainOrder, group });
        return;
      }
      // Free group → ask kisi sayisi, then start order
      openKisiPrompt(mainId, group.memberAdlari?.join(' + ') || 'Grup', group.kapasite);
      return;
    }
    // Standalone
    if (table.durum === 'bos') {
      openKisiPrompt(table.id, table.ad, table.kapasite || 2);
    } else if (table.durum === 'dolu') {
      setSelectedTable({ ...table, order: ordersByTable[table.id] });
    } else if (table.durum === 'rezerve') {
      const resv = reservationsByTable[table.id];
      setReserveDetail({ table, reservation: resv });
    }
  };

  const confirmKisi = (kisi) => {
    if (!kisiPrompt) return;
    const { masaId } = kisiPrompt;
    setKisiPrompt(null);
    navigate(`/pos/order/new?masaId=${masaId}&kisi=${kisi}`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex gap-1 overflow-x-auto">
          {zones.map((z) => {
            const count = tables.filter((t) => (t.zone || 'ic') === z).length;
            return (
              <button
                key={z}
                onClick={() => setZone(z)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition ${
                  zone === z
                    ? 'bg-blue-100 font-medium text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {ZONE_LABELS[z] || z}
                <span className="ml-1.5 text-xs opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-sm">
          <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex">
            <Link2 size={12} /> Birleştirmek için sürükleyip başkasının üstüne bırak
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="h-3 w-3 rounded-full bg-emerald-500"></span>
            <strong>{counts.bos}</strong>
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="h-3 w-3 rounded-full bg-red-500"></span>
            <strong>{counts.dolu}</strong>
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <span className="h-3 w-3 rounded-full bg-amber-500"></span>
            <strong>{counts.rezerve}</strong>
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-100 p-4">
        {tablesInZone.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
            <AlertCircle size={40} />
            <p>Bu bölgede masa yok.</p>
          </div>
        ) : (
          <div
            className="relative mx-auto rounded-xl border border-slate-200 bg-white shadow-inner"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
            {/* Decorations — read-only, rendered first (behind everything) */}
            {decorsInZone.map((d) => (
              <CanvasDecoration key={d.id} decor={d} />
            ))}

            {/* Group hulls — render BEHIND tables to visually connect members */}
            {groups
              .filter((g) =>
                tablesInZone.some((t) => g.memberIds.includes(t.id)),
              )
              .map((g) => {
                const members = tablesInZone.filter((t) =>
                  g.memberIds.includes(t.id),
                );
                if (members.length === 0) return null;
                const pad = 8;
                const positions = members.map((t) => ({
                  ...effectivePosition(t),
                  w: t.w || sizeFor(t.kapasite).w,
                  h: t.h || sizeFor(t.kapasite).h,
                }));
                const minX = Math.min(...positions.map((p) => p.x)) - pad;
                const minY = Math.min(...positions.map((p) => p.y)) - pad;
                const maxX = Math.max(...positions.map((p) => p.x + p.w)) + pad;
                const maxY = Math.max(...positions.map((p) => p.y + p.h)) + pad;
                const hasOrder = !!ordersByTable[g.mainTableId];
                return (
                  <div
                    key={`hull-${g.id}`}
                    className={`absolute rounded-2xl border-2 border-dashed transition ${
                      hasOrder
                        ? 'border-red-400 bg-red-100/40'
                        : 'border-blue-400 bg-blue-100/40'
                    }`}
                    style={{
                      left: minX,
                      top: minY,
                      width: maxX - minX,
                      height: maxY - minY,
                      pointerEvents: 'none',
                    }}
                  >
                    <span
                      className={`absolute -top-3 left-3 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        hasOrder
                          ? 'bg-red-500 text-white'
                          : 'bg-blue-500 text-white'
                      }`}
                    >
                      Grup · {g.kapasite} kişilik
                    </span>
                  </div>
                );
              })}

            {tablesInZone.map((t) => {
              const group = t.grupId ? groupsById[t.grupId] : null;
              const isMain = group && group.mainTableId === t.id;
              const mainOrder = group ? ordersByTable[group.mainTableId] : null;
              const reservation = reservationsByTable[t.id];
              const pos = effectivePosition(t);
              const isDragging = dragState?.tableId === t.id;
              return (
                <CanvasTable
                  key={t.id}
                  table={t}
                  x={pos.x}
                  y={pos.y}
                  order={ordersByTable[t.id] || (group ? mainOrder : null)}
                  group={group}
                  isMain={isMain}
                  reservation={reservation}
                  isDragging={isDragging}
                  onPointerDown={(e) => handleTablePointerDown(e, t)}
                />
              );
            })}
          </div>
        )}
      </div>

      <FullTableModal
        open={!!selectedTable}
        onClose={() => setSelectedTable(null)}
        table={selectedTable}
        rol={rol}
        navigate={navigate}
        onDissolve={handleDissolve}
      />

      <KisiSayisiModal
        open={!!kisiPrompt}
        masaAd={kisiPrompt?.masaAd}
        defaultKisi={kisiPrompt?.defaultKisi}
        onClose={() => setKisiPrompt(null)}
        onConfirm={confirmKisi}
        onSwitchToReserve={() => {
          const k = kisiPrompt;
          setKisiPrompt(null);
          setReservePrompt({
            masaId: k.masaId,
            masaAd: k.masaAd,
            defaultKisi: k.defaultKisi,
          });
        }}
      />

      <ReserveFormModal
        open={!!reservePrompt}
        masaId={reservePrompt?.masaId}
        masaAd={reservePrompt?.masaAd}
        defaultKisi={reservePrompt?.defaultKisi}
        userId={user?.uid}
        userAd={profile?.ad}
        onClose={() => setReservePrompt(null)}
        onSaved={() => {
          setReservePrompt(null);
          toast.success('Rezervasyon oluşturuldu');
        }}
      />

      <ConfirmMergeModal
        open={!!pendingMerge}
        dragged={pendingMerge?.dragged}
        target={pendingMerge?.target}
        submitting={submitting}
        onCancel={() => setPendingMerge(null)}
        onConfirm={confirmPendingMerge}
      />

      <ReserveDetailModal
        open={!!reserveDetail}
        table={reserveDetail?.table}
        reservation={reserveDetail?.reservation}
        onClose={() => setReserveDetail(null)}
        onCancel={async () => {
          if (!reserveDetail?.reservation) return;
          if (!confirm('Rezervasyon iptal edilsin mi?')) return;
          try {
            await cancelReservation({ reservationId: reserveDetail.reservation.id });
            toast.success('Rezervasyon iptal edildi');
            setReserveDetail(null);
          } catch (err) {
            console.error(err);
            toast.error(err.message || 'İptal edilemedi');
          }
        }}
        onSeatGuest={async () => {
          const r = reserveDetail.reservation;
          const t = reserveDetail.table;
          if (!r) return;
          try {
            // Önce rezervasyonu tamamlandı olarak işaretle + masayı boş yap
            await cancelReservation({ reservationId: r.id }); // boşa al + rezervasyon kapanır
            setReserveDetail(null);
            // Hemen kişi sayısı modalı aç (rezervasyondaki kişi sayısı default)
            openKisiPrompt(t.id, t.ad, r.kisiSayisi || t.kapasite);
          } catch (err) {
            console.error(err);
            toast.error('Masa açılamadı');
          }
        }}
      />
    </div>
  );
}

function CanvasTable({
  table,
  x,
  y,
  order,
  group,
  isMain,
  reservation,
  isDragging,
  onPointerDown,
}) {
  const w = table.w || sizeFor(table.kapasite).w;
  const h = table.h || sizeFor(table.kapasite).h;
  // effective status for grouped tables: mirror group state
  const effectiveDurum = group ? (order ? 'dolu' : 'bos') : table.durum;
  const colors = {
    bos: 'bg-emerald-500 hover:bg-emerald-600 border-emerald-700',
    dolu: 'bg-red-500 hover:bg-red-600 border-red-700',
    rezerve: 'bg-amber-500 hover:bg-amber-600 border-amber-700',
  };
  const mins = order?.olusturmaZamani ? minutesSince(order.olusturmaZamani) : null;
  // Only boş + non-grouped tables can be dragged
  const canDrag = effectiveDurum === 'bos' && !table.grupId;

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute flex flex-col items-center justify-between rounded-xl border-2 p-2 text-white shadow-md transition active:scale-95 ${colors[effectiveDurum] || colors.bos} ${
        isDragging ? 'z-30 cursor-grabbing shadow-2xl ring-4 ring-blue-400 ring-offset-2' : canDrag ? 'cursor-grab' : 'cursor-pointer'
      } select-none`}
      style={{ left: x, top: y, width: w, height: h, touchAction: 'none' }}
    >
      <div className="flex w-full justify-between text-[10px]">
        <span className="flex items-center gap-0.5">
          <UsersIcon size={10} />
          {table.kapasite}
        </span>
        {mins != null && (
          <span className={`flex items-center gap-0.5 ${mins > 15 ? 'font-bold' : ''}`}>
            <Clock size={10} />
            {mins}dk
          </span>
        )}
      </div>
      <div className="flex flex-col items-center leading-tight">
        <span className="text-sm font-bold">{table.ad}</span>
        {isMain && order && (
          <span className="text-xs font-semibold">{formatTL(order.toplam)}</span>
        )}
      </div>
      <span className="w-full truncate text-[10px] opacity-90">
        {order
          ? order.garsonAd
          : effectiveDurum === 'rezerve'
            ? reservation
              ? `${reservation.musteriAd.split(' ')[0]} · ${reservation.saat}`
              : 'Rezerve'
            : 'Boş'}
      </span>
    </div>
  );
}

function ConfirmMergeModal({ open, dragged, target, submitting, onCancel, onConfirm }) {
  if (!open || !dragged || !target) return null;
  const totalKapasite = (dragged.kapasite || 0) + (target.kapasite || 0);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Masaları Birleştir"
      size="sm"
      footer={
        <>
          <button onClick={onCancel} className="btn-secondary" disabled={submitting}>
            İptal
          </button>
          <button onClick={onConfirm} className="btn-primary" disabled={submitting}>
            <Link2 size={14} /> Birleştir
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-700">
          <strong>{target.ad}</strong> ile <strong>{dragged.ad}</strong> birleştirilsin mi?
        </p>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          <p>• Yeni kapasite: <strong>{totalKapasite} kişilik</strong></p>
          <p>• Ana masa: <strong>{target.ad}</strong> (sipariş bu masaya açılır)</p>
          <p>• <strong>Ödeme alındığında</strong> birleştirme otomatik kalkar ve masalar eski yerlerine döner.</p>
        </div>
      </div>
    </Modal>
  );
}

function KisiSayisiModal({ open, masaAd, defaultKisi, onClose, onConfirm, onSwitchToReserve }) {
  const [kisi, setKisi] = useState(defaultKisi || 2);

  useEffect(() => {
    if (open) setKisi(defaultKisi || 2);
  }, [open, defaultKisi]);

  if (!open) return null;

  const quick = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${masaAd} — Kaç kişi?`}
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            onClick={() => onConfirm(kisi)}
            disabled={!kisi || kisi < 1}
            className="btn-primary disabled:opacity-50"
          >
            Devam Et
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Sipariş açmak için müşteri sayısını girin. Bu bilgi rapor ve istatistiklerde kullanılır.
        </p>

        <div className="grid grid-cols-4 gap-2">
          {quick.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setKisi(n)}
              className={`rounded-lg border-2 py-4 text-lg font-bold transition ${
                kisi === n
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Veya farklı bir sayı:
          </label>
          <input
            type="number"
            value={kisi}
            min={1}
            max={50}
            onChange={(e) => setKisi(Number(e.target.value) || 0)}
            className="input text-center text-xl font-semibold"
            autoFocus
          />
        </div>

        {onSwitchToReserve && (
          <div className="border-t border-slate-200 pt-3 text-center">
            <button
              type="button"
              onClick={onSwitchToReserve}
              className="inline-flex items-center gap-1 text-sm text-amber-700 hover:underline"
            >
              <CalendarClock size={14} /> Sipariş yerine rezervasyon yap
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ReserveFormModal({
  open,
  masaId,
  masaAd,
  defaultKisi,
  userId,
  userAd,
  onClose,
  onSaved,
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(reservationSchema),
    defaultValues: {
      musteriAd: '',
      musteriTel: '',
      tarih: todayISO(),
      saat: '20:00',
      kisiSayisi: defaultKisi || 2,
      notlar: '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        musteriAd: '',
        musteriTel: '',
        tarih: todayISO(),
        saat: '20:00',
        kisiSayisi: defaultKisi || 2,
        notlar: '',
      });
    }
  }, [open, defaultKisi, reset]);

  const onSubmit = async (data) => {
    try {
      await createReservation({
        masaId,
        masaAd,
        musteriAd: data.musteriAd,
        musteriTel: data.musteriTel,
        tarih: data.tarih,
        saat: data.saat,
        kisiSayisi: data.kisiSayisi,
        notlar: data.notlar,
        olusturanId: userId,
        olusturanAd: userAd,
      });
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Rezervasyon kaydedilemedi');
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${masaAd} — Rezervasyon`}
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="resv-form"
            disabled={isSubmitting}
            className="btn-primary"
          >
            Kaydet
          </button>
        </>
      }
    >
      <form id="resv-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Müşteri Adı</label>
          <input {...register('musteriAd')} className="input" autoFocus placeholder="Ad Soyad" />
          {errors.musteriAd && (
            <p className="mt-1 text-xs text-red-600">{errors.musteriAd.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Telefon</label>
          <input
            {...register('musteriTel')}
            className="input"
            placeholder="0555 555 55 55"
            inputMode="tel"
          />
          {errors.musteriTel && (
            <p className="mt-1 text-xs text-red-600">{errors.musteriTel.message}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Tarih</label>
            <input {...register('tarih')} type="date" className="input" />
            {errors.tarih && (
              <p className="mt-1 text-xs text-red-600">{errors.tarih.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Saat</label>
            <input {...register('saat')} type="time" className="input" />
            {errors.saat && <p className="mt-1 text-xs text-red-600">{errors.saat.message}</p>}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Kişi Sayısı</label>
          <input
            {...register('kisiSayisi', { valueAsNumber: true })}
            type="number"
            className="input"
            min={1}
            max={50}
          />
          {errors.kisiSayisi && (
            <p className="mt-1 text-xs text-red-600">{errors.kisiSayisi.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Not (opsiyonel)</label>
          <input {...register('notlar')} className="input" placeholder="Pencere kenarı vb." />
        </div>
      </form>
    </Modal>
  );
}

function ReserveDetailModal({ open, table, reservation, onClose, onCancel, onSeatGuest }) {
  if (!open || !table) return null;
  return (
    <Modal open={open} onClose={onClose} title={`${table.ad} — Rezervasyon`} size="md">
      {!reservation ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Rezervasyon kaydı bulunamadı. Masa "rezerve" durumda ama dokümanı eksik. Aşağıdan iptal
            ederek masayı boşa alabilirsin.
          </p>
          <button onClick={onCancel} className="btn-danger w-full">
            <Trash2 size={14} /> Masayı Boşa Al
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <User size={14} /> {reservation.musteriAd}
            </div>
            <div className="mt-1 flex items-center gap-2 text-amber-800">
              <Phone size={12} /> {reservation.musteriTel}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Tarih</p>
              <p className="font-semibold text-slate-900">{reservation.tarih}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Saat</p>
              <p className="font-semibold text-slate-900">{reservation.saat}</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Kişi</p>
              <p className="font-semibold text-slate-900">{reservation.kisiSayisi}</p>
            </div>
          </div>

          {reservation.notlar && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-xs text-slate-500">Not</p>
              <p className="text-slate-700">{reservation.notlar}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={onCancel} className="btn-danger">
              <Trash2 size={14} /> İptal Et
            </button>
            <button onClick={onSeatGuest} className="btn-primary">
              <Plus size={14} /> Müşteri Geldi — Sipariş Aç
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CanvasDecoration({ decor }) {
  const preset = DECOR_PRESETS[decor.tip] || DECOR_PRESETS.etiket;
  const Icon = preset.icon;
  const w = decor.w || 100;
  const h = decor.h || 60;
  const label = decor.label || '';
  const isVertical = h > w * 1.5;
  const showIcon = Icon && Math.min(w, h) >= 30;
  const rounded = preset.noRounded ? '' : 'rounded-md';

  return (
    <div
      className={`pointer-events-none absolute flex select-none items-center justify-center gap-1 border-2 shadow-sm ${rounded} ${preset.className} ${
        isVertical ? 'flex-col' : 'flex-row'
      }`}
      style={{ left: decor.x ?? 0, top: decor.y ?? 0, width: w, height: h }}
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

function FullTableModal({ open, onClose, table, rol, navigate, onDissolve }) {
  if (!open || !table) return null;
  const order = table.order;
  const group = table.group;
  const canPay = ['kasiyer', 'admin'].includes(rol);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? `${table.ad} (Grup)` : table.ad}
      size="lg"
    >
      {group && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-semibold text-blue-900">
            Birleştirilmiş masa — {group.kapasite} kişilik
          </p>
          <p className="mt-0.5 text-xs text-blue-700">
            {group.memberAdlari?.join(' + ') || group.memberIds.join(' + ')}
          </p>
          {!order && (
            <button
              onClick={() => onDissolve(group.id)}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Link2Off size={12} /> Birleştirmeyi Kaldır
            </button>
          )}
        </div>
      )}
      {!order ? (
        <p className="py-8 text-center text-slate-500">Bu masada aktif sipariş bulunamadı.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-slate-500">Garson</p>
              <p className="font-semibold text-slate-900">{order.garsonAd}</p>
            </div>
            <div>
              <p className="text-slate-500">Kişi</p>
              <p className="font-semibold text-slate-900">
                {order.kisiSayisi != null ? order.kisiSayisi : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Süre</p>
              <p className="font-semibold text-slate-900">
                {minutesSince(order.olusturmaZamani)} dk
              </p>
            </div>
            <div>
              <p className="text-slate-500">Durum</p>
              <p className="font-semibold text-slate-900">{order.durum}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
              Sipariş İçeriği
            </div>
            <ul className="divide-y divide-slate-100">
              {order.items.map((it, idx) => (
                <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                  <span>
                    <strong>{it.adet}×</strong> {it.ad}
                    {it.notlar && <em className="ml-2 text-xs text-slate-500">({it.notlar})</em>}
                  </span>
                  <span className="font-semibold">{formatTL(it.fiyat * it.adet)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <span className="text-slate-500">Toplam: </span>
              <span className="text-lg font-bold text-slate-900">{formatTL(order.toplam)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onClose();
                navigate(`/pos/order/new?masaId=${order.masaId}&orderId=${order.id}`);
              }}
              className="btn-primary"
            >
              <Plus size={16} /> Sipariş Ekle
            </button>
            {canPay && (
              <button
                onClick={() => {
                  onClose();
                  navigate(`/pos/payment?orderId=${order.id}`);
                }}
                className="btn-secondary"
              >
                Ödeme Al
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
