import { useEffect, useMemo, useRef, useState } from 'react';
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
  Calculator,
  Footprints,
  DoorOpen,
  DoorClosed,
  Type,
  CalendarClock,
  Phone,
  User,
  Trash2,
  Ban,
  Printer,
  ArrowLeftRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { watchCollection, orderBy, where } from '../../firebase/firestore';
import { formatTL, minutesSince, formatAdet } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/ui/Modal';
import { createTableGroup, addTableToGroup, dissolveTableGroup } from '../../firebase/tableGroups';
import { createReservation, cancelReservation } from '../../firebase/reservations';
import { cancelActiveOrder, transferOrder } from '../../firebase/orders';
import { reservationSchema } from '../../utils/validators';
import KitchenTicket from '../../components/KitchenTicket';
import AdisyonTicket from '../../components/AdisyonTicket';
import { useSettingsStore } from '../../store/settingsStore';

const ZONE_LABELS = {
  ic: 'İç Salon',
  dis: 'Dış Mekan',
  bahce: 'Bahçe',
  bar: 'Meşrubat',
  kapali: 'Kapalı Alan',
};

const CANVAS_W = 1200;
const CANVAS_H = 700;

const DECOR_PRESETS = {
  bar: {
    icon: Wine,
    iconColor: 'text-amber-100',
    label: 'MEŞRUBAT',
    className:
      'bg-gradient-to-b from-amber-900 to-amber-700 text-amber-50 border-amber-950 tracking-widest font-bold uppercase',
  },
  kasa: {
    icon: Calculator,
    iconColor: 'text-slate-100',
    className:
      'bg-gradient-to-b from-slate-700 to-slate-600 text-slate-50 border-slate-900 tracking-widest font-bold uppercase',
  },
  mutfak: {
    icon: ChefHat,
    iconColor: 'text-orange-600',
    className:
      'bg-white text-orange-700 border-orange-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  wc: {
    icon: User,
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
  kapi: {
    icon: DoorClosed,
    iconColor: 'text-amber-700',
    className:
      'bg-white text-amber-700 border-amber-500 border-[3px] font-semibold tracking-wide uppercase',
  },
  duvar: {
    icon: null,
    iconColor: '',
    className: 'bg-slate-700 border-slate-900',
    noRounded: true,
  },
  merdiven: {
    icon: Footprints,
    iconColor: 'text-slate-500',
    className:
      'bg-slate-200 text-slate-600 border-slate-400 border-[2px] font-semibold tracking-wide uppercase text-xs',
  },
  etiket: {
    icon: null,
    iconColor: '',
    className: 'bg-transparent text-slate-500 border-transparent italic text-xs',
    noRounded: true,
  },
};

const TABLE_H = 70; // tüm masalar için sabit yükseklik (px) — admin ile aynı

function sizeFor(kapasite) {
  // Yükseklik sabit (TABLE_H); genişlik kapasiteyle sağa doğru artar
  if (kapasite >= 8) return { w: 140, h: TABLE_H };
  if (kapasite >= 6) return { w: 120, h: TABLE_H };
  if (kapasite >= 4) return { w: 100, h: TABLE_H };
  if (kapasite >= 2) return { w: 80, h: TABLE_H };
  return { w: 70, h: TABLE_H }; // 1 kişilik
}

// Yuvarlak masa çapı (w=h, kare oranlı) — admin ile aynı
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

// Masanın gerçek boyutu: admin'de elle ayarlanmış özel boyut (customW/H) varsa onu,
// yoksa şekle göre kapasite varsayılanını kullan
function tableDim(t) {
  const def = defaultSize(t.kapasite, t.sekil);
  return {
    w: t.customW ?? def.w,
    h: t.customH ?? def.h,
  };
}

// Masa taşıma/birleştirme (garson ekranı)
const LONG_PRESS_MS = 600; // bu kadar basılı tutunca masa "kalkar" ve sürüklenebilir
const SNAP_THRESHOLD = 8; // px — kenar hizalama yapışma mesafesi
const MERGE_GAP = 100; // px — bu mesafeye kadar yakına bırakınca birleştirir (tablet parmağı için cömert)

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

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
  const [scale, setScale] = useState(1);
  const [guides, setGuides] = useState(null); // sürüklerken hizalama çizgileri { v:[x], h:[y] }
  const [dropTarget, setDropTarget] = useState(null); // sürüklerken vurgulanan hedef { kind, id }
  const canvasWrapperRef = useRef(null);

  // Viewport'a göre canvas'ı küçült (iMin Swan 1 Pro 1280x800 gibi tablette taşmasın)
  useEffect(() => {
    function updateScale() {
      if (!canvasWrapperRef.current) return;
      const rect = canvasWrapperRef.current.getBoundingClientRect();
      const availableW = rect.width - 16; // küçük marj
      const availableH = rect.height - 16;
      if (availableW <= 0 || availableH <= 0) return;
      const sW = availableW / CANVAS_W;
      const sH = availableH / CANVAS_H;
      setScale(Math.min(1, sW, sH));
    }
    updateScale();
    window.addEventListener('resize', updateScale);
    // İlk render'da layout otursun
    const t1 = setTimeout(updateScale, 50);
    const t2 = setTimeout(updateScale, 250);
    return () => {
      window.removeEventListener('resize', updateScale);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

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
    // Her zaman görünmesini istediğimiz bölgeler (henüz masası olmasa bile)
    const ALWAYS = ['ic', 'dis'];
    const set = new Set([...ALWAYS, ...tables.map((t) => t.zone || 'ic')]);
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
    const { w, h } = tableDim(t);
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

  // Dragged'ın target'a göre orijinal konumuna bakıp o yöne snap'ler:
  // sol/sağ/üst/alt — kullanıcı hangi yönden geliyorsa orada bitişik olur.
  // Eski sürüm hep "sağa" snap'liyordu, sağdan sola sürüklemede layout kayıyordu.
  function computeSnapPosition(target, dragged) {
    const t = rectFor(target, effectivePosition(target));
    const { w: dw, h: dh } = tableDim(dragged);
    const dPos = { x: dragged.x ?? 0, y: dragged.y ?? 0 };
    const dx = dPos.x - t.x;
    const dy = dPos.y - t.y;
    // Hangi eksende daha çok kaymışsa o yönde snap
    if (Math.abs(dy) > Math.abs(dx)) {
      return dy < 0 ? { x: t.x, y: t.y - dh } : { x: t.x, y: t.y + t.h };
    }
    return dx < 0 ? { x: t.x - dw, y: t.y } : { x: t.x + t.w, y: t.y };
  }

  // Sürüklerken kenar/merkez hizalama: en yakın hizaya yapışır, çizgileri döndürür
  function computeAlignment(dragged, px, py, w, h) {
    const others = tablesInZone.filter((o) => o.id !== dragged.id);
    let bestX = { delta: SNAP_THRESHOLD + 1, x: px, line: null };
    let bestY = { delta: SNAP_THRESHOLD + 1, y: py, line: null };
    for (const o of others) {
      const r = rectFor(o, effectivePosition(o));
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
    const guides = { v: [], h: [] };
    let x = px;
    let y = py;
    if (bestX.delta <= SNAP_THRESHOLD) {
      x = Math.round(bestX.x);
      guides.v.push(Math.round(bestX.line));
    }
    if (bestY.delta <= SNAP_THRESHOLD) {
      y = Math.round(bestY.y);
      guides.h.push(Math.round(bestY.line));
    }
    return { x, y, guides };
  }

  // Bırakma konumuna en uygun hedefi bul: tekil boş masa VEYA mevcut grup (ekrandaki combined kutusuyla).
  // Kural: önce ÖRTÜŞME — bırakılan masa bir adayın bbox'unda kalıyorsa o aday kazanır;
  // birden fazla aday örtüşüyorsa en geniş örtüşme alanı kazanır (genelde grup). Hiçbiri
  // örtüşmüyorsa en yakın aday (gap) kazanır; eşitlikte grup tercih edilir.
  function findDropTarget(dragged, pos, w, h) {
    const d = { x: pos.x, y: pos.y, w, h };
    const gapOf = (r) => {
      const dx = Math.max(0, r.x - (d.x + d.w), d.x - (r.x + r.w));
      const dy = Math.max(0, r.y - (d.y + d.h), d.y - (r.y + r.h));
      return Math.hypot(dx, dy);
    };
    const overlapOf = (r) => {
      const ox = Math.min(d.x + d.w, r.x + r.w) - Math.max(d.x, r.x);
      const oy = Math.min(d.y + d.h, r.y + r.h) - Math.max(d.y, r.y);
      return ox > 0 && oy > 0 ? ox * oy : 0;
    };

    let bestGroup = null;
    let bestGroupGap = MERGE_GAP + 1;
    let bestGroupOverlap = 0;
    for (const g of groups) {
      const members = tablesInZone.filter(
        (t) => g.memberIds?.includes(t.id) || t.grupId === g.id,
      );
      if (members.length === 0 || members.some((m) => m.id === dragged.id)) continue;
      const ps = members.map((t) => ({
        ...effectivePosition(t),
        ...tableDim(t),
      }));
      const minX = Math.min(...ps.map((p) => p.x));
      const minY = Math.min(...ps.map((p) => p.y));
      const maxX = Math.max(...ps.map((p) => p.x + p.w));
      const maxY = Math.max(...ps.map((p) => p.y + p.h));
      const rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      const ov = overlapOf(rect);
      const gap = gapOf(rect);
      const isCandidate = ov > 0 || gap <= MERGE_GAP;
      const isBetter = ov > bestGroupOverlap || (ov === bestGroupOverlap && gap < bestGroupGap);
      if (isCandidate && isBetter) {
        bestGroupOverlap = ov;
        bestGroupGap = gap;
        bestGroup = { kind: 'group', group: g, rect };
      }
    }

    let bestTable = null;
    let bestTableGap = MERGE_GAP + 1;
    let bestTableOverlap = 0;
    for (const o of tablesInZone) {
      // Rezerve masaya birleştirme olmaz; gruplu masalar yukarıda group olarak değerlendirildi.
      // Dolu (siparişli) masaya birleştirme serbest — sipariş ana masada kalır.
      if (o.id === dragged.id || o.grupId || o.durum === 'rezerve') continue;
      const rect = rectFor(o, effectivePosition(o));
      const ov = overlapOf(rect);
      const gap = gapOf(rect);
      const isCandidate = ov > 0 || gap <= MERGE_GAP;
      const isBetter = ov > bestTableOverlap || (ov === bestTableOverlap && gap < bestTableGap);
      if (isCandidate && isBetter) {
        bestTableOverlap = ov;
        bestTableGap = gap;
        bestTable = { kind: 'table', table: o, rect };
      }
    }

    // 1) Bir taraf örtüşüyorsa: en geniş örtüşme kazanır (eşitlikte grup)
    if (bestGroupOverlap > 0 || bestTableOverlap > 0) {
      if (bestGroupOverlap >= bestTableOverlap) return bestGroup || bestTable;
      return bestTable;
    }
    // 2) Kimse örtüşmüyor → en yakın (eşitlikte grup)
    if (bestGroup && bestTable) return bestGroupGap <= bestTableGap ? bestGroup : bestTable;
    return bestGroup || bestTable;
  }

  function handleTablePointerDown(e, table) {
    // Sadece boş ve gruplanmamış masalar taşınabilir
    const canDrag = table.durum === 'bos' && !table.grupId;
    if (!canDrag) {
      handleTableClick(table);
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const origX = table.x ?? 0;
    const origY = table.y ?? 0;
    const { w: tableW, h: tableH } = tableDim(table);
    const currentScale = scale || 1; // canvas scaled, mouse delta'yı geri çevir
    let armed = false; // long-press tamamlandı mı (masa "kalktı" mı)
    let lastPos = { x: origX, y: origY }; // son sürükleme konumu (yan etkisiz okumak için)

    // Bu kadar basılı tutunca masa kalkar ve sürüklenebilir hale gelir
    const timer = setTimeout(() => {
      armed = true;
      lastPos = { x: origX, y: origY };
      setDragState({ tableId: table.id, x: origX, y: origY });
      if (navigator.vibrate) navigator.vibrate(30);
    }, LONG_PRESS_MS);

    function onMove(ev) {
      const totalDx = ev.clientX - startX;
      const totalDy = ev.clientY - startY;
      if (!armed) {
        // Süre dolmadan parmağı belirgin kaydırırsa long-press iptal (kaydırma jesti)
        if (Math.abs(totalDx) > 16 || Math.abs(totalDy) > 16) cleanup();
        return;
      }
      const dx = totalDx / currentScale;
      const dy = totalDy / currentScale;
      const nx = clamp(Math.round(origX + dx), 0, CANVAS_W - tableW);
      const ny = clamp(Math.round(origY + dy), 0, CANVAS_H - tableH);
      const al = computeAlignment(table, nx, ny, tableW, tableH);
      lastPos = { x: al.x, y: al.y };
      setDragState({ tableId: table.id, x: al.x, y: al.y });
      setGuides(al.guides);
      const tgt = findDropTarget(table, lastPos, tableW, tableH);
      setDropTarget(
        tgt ? { kind: tgt.kind, id: tgt.kind === 'group' ? tgt.group.id : tgt.table.id } : null,
      );
    }
    function onUp() {
      const wasArmed = armed;
      cleanup();
      setGuides(null);
      setDropTarget(null);
      setDragState(null); // birleşmezse masa eski yerine döner
      if (!wasArmed) {
        // Süre dolmadan bırakıldı → normal tıklama (masayı aç)
        handleTableClick(table);
        return;
      }
      const found = findDropTarget(table, lastPos, tableW, tableH);
      if (!found) return;
      if (found.kind === 'group') {
        // Mevcut grubun combined kutusuna bırakıldı → gruba ekle
        setPendingMerge({ dragged: table, group: found.group });
      } else {
        // Tekil boş masa → yeni grup
        setPendingMerge({ dragged: table, target: found.table });
      }
    }
    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  const confirmPendingMerge = async () => {
    if (!pendingMerge) return;
    const { dragged, target, group } = pendingMerge;
    setSubmitting(true);
    try {
      if (group) {
        // Mevcut gruba ekle — grubun sağ kenarına yerleştir (combined genişlik büyür)
        const members = tablesInZone.filter(
          (t) => group.memberIds.includes(t.id) || t.grupId === group.id,
        );
        const ps = members.map((t) => ({
          ...effectivePosition(t),
          ...tableDim(t),
        }));
        const minX = Math.min(...ps.map((p) => p.x));
        const maxX = Math.max(...ps.map((p) => p.x + p.w));
        const minY = Math.min(...ps.map((p) => p.y));
        const maxY = Math.max(...ps.map((p) => p.y + p.h));
        const cX = (minX + maxX) / 2;
        const cY = (minY + maxY) / 2;
        const { w: dW, h: dH } = tableDim(dragged);
        const dxFromCenter = (dragged.x ?? 0) - cX;
        const dyFromCenter = (dragged.y ?? 0) - cY;
        let newPos;
        if (Math.abs(dyFromCenter) > Math.abs(dxFromCenter)) {
          newPos = dyFromCenter < 0
            ? { x: Math.round(cX - dW / 2), y: minY - dH }
            : { x: Math.round(cX - dW / 2), y: maxY };
        } else {
          newPos = dxFromCenter < 0
            ? { x: minX - dW, y: minY }
            : { x: maxX, y: minY };
        }
        await addTableToGroup({
          groupId: group.id,
          table: dragged,
          position: newPos,
        });
        // Snapshot listener gecikmesini köprüle: lokal state'i hemen güncelle.
        // Firestore listener'ı arkadan gelince noop olur (aynı veri).
        setGroups((prev) =>
          prev.map((g) =>
            g.id === group.id
              ? {
                  ...g,
                  memberIds: [...new Set([...(g.memberIds || []), dragged.id])],
                  memberAdlari: [...(g.memberAdlari || []), dragged.ad],
                  kapasite: (g.kapasite || 0) + (dragged.kapasite || 0),
                  positions: { ...(g.positions || {}), [dragged.id]: newPos },
                }
              : g,
          ),
        );
        setTables((prev) =>
          prev.map((t) => (t.id === dragged.id ? { ...t, grupId: group.id } : t)),
        );
        toast.success(`${dragged.ad} gruba eklendi`);
      } else {
        const snapPos = computeSnapPosition(target, dragged);
        const res = await createTableGroup({
          memberTables: [target, dragged],
          mainTableId: target.id,
          positions: { [dragged.id]: snapPos },
        });
        // Lokal state'i hemen güncelle (snapshot listener gecikmesini köprüle)
        const newGroup = {
          id: res.groupId,
          memberIds: [target.id, dragged.id],
          mainTableId: target.id,
          mainTableAd: target.ad,
          kapasite: res.kapasite,
          memberAdlari: [target.ad, dragged.ad],
          positions: { [dragged.id]: snapPos },
        };
        setGroups((prev) => [...prev.filter((g) => g.id !== res.groupId), newGroup]);
        setTables((prev) =>
          prev.map((t) =>
            t.id === target.id || t.id === dragged.id ? { ...t, grupId: res.groupId } : t,
          ),
        );
        toast.success(`${target.ad} + ${dragged.ad} birleştirildi`);
      }
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

  const openKisiPrompt = (masaId, masaAd, defaultKisi, groupId = null) => {
    setKisiPrompt({ masaId, masaAd, defaultKisi, groupId });
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
      openKisiPrompt(mainId, group.memberAdlari?.join(' + ') || 'Grup', group.kapasite, group.id);
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

      <div ref={canvasWrapperRef} className="flex flex-1 items-start justify-center overflow-hidden bg-slate-100 p-2">
        {tablesInZone.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
            <AlertCircle size={40} />
            <p>Bu bölgede masa yok.</p>
          </div>
        ) : (
          <div
            style={{
              width: CANVAS_W * scale,
              height: CANVAS_H * scale,
            }}
          >
          <div
            className="relative rounded-xl border border-slate-200 bg-white shadow-inner"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {/* Decorations — read-only, rendered first (behind everything) */}
            {decorsInZone.map((d) => (
              <CanvasDecoration key={d.id} decor={d} />
            ))}

            {/* Birleştirilmiş gruplar — tek bir combined masa olarak çizilir */}
            {groups
              .filter((g) =>
                tablesInZone.some(
                  (t) => g.memberIds.includes(t.id) || t.grupId === g.id,
                ),
              )
              .map((g) => {
                // Üye tespiti: memberIds VEYA tablodaki grupId — Firestore sync race'inde
                // bir taraf güncellenirken diğeri gecikirse görsel tutarsızlığı önler
                const members = tablesInZone.filter(
                  (t) => g.memberIds.includes(t.id) || t.grupId === g.id,
                );
                if (members.length === 0) return null;
                const mainTable =
                  members.find((t) => t.id === g.mainTableId) || members[0];
                const positions = members.map((t) => ({
                  ...effectivePosition(t),
                  ...tableDim(t),
                }));
                const minX = Math.min(...positions.map((p) => p.x));
                const minY = Math.min(...positions.map((p) => p.y));
                const maxX = Math.max(...positions.map((p) => p.x + p.w));
                const maxY = Math.max(...positions.map((p) => p.y + p.h));
                const order = ordersByTable[g.mainTableId];
                const colorCls = order
                  ? 'bg-red-500 hover:bg-red-600 border-red-700'
                  : 'bg-emerald-500 hover:bg-emerald-600 border-emerald-700';
                const mins = order?.olusturmaZamani
                  ? minutesSince(order.olusturmaZamani)
                  : null;
                return (
                  <div
                    key={`group-${g.id}`}
                    onPointerDown={(e) => handleTablePointerDown(e, mainTable)}
                    className={`absolute z-20 flex cursor-pointer flex-col items-center justify-between rounded-xl border-2 p-2 text-white shadow-md transition active:scale-95 select-none ${colorCls} ${
                      dropTarget?.kind === 'group' && dropTarget.id === g.id
                        ? 'z-30 scale-105 ring-4 ring-amber-300 ring-offset-2'
                        : ''
                    }`}
                    style={{
                      left: minX,
                      top: minY,
                      width: maxX - minX,
                      height: maxY - minY,
                      touchAction: 'none',
                    }}
                  >
                    <div className="flex w-full justify-between text-[10px]">
                      <span className="flex items-center gap-0.5">
                        <UsersIcon size={10} />
                        {g.kapasite}
                      </span>
                      {mins != null && (
                        <span className={`flex items-center gap-0.5 ${mins > 15 ? 'font-bold' : ''}`}>
                          <Clock size={10} />
                          {mins}dk
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col items-center leading-tight">
                      <span className="text-sm font-bold">
                        {(g.memberAdlari || []).join(' + ') || g.mainTableAd}
                      </span>
                      {order && (
                        <span className="text-xs font-semibold">{formatTL(order.toplam)}</span>
                      )}
                      <span className="text-[10px] opacity-90">Birleşik · {g.kapasite} kişilik</span>
                    </div>
                    <span className="w-full truncate text-center text-[10px] opacity-90">
                      {order ? order.garsonAd : 'Boş'}
                    </span>
                  </div>
                );
              })}

            {tablesInZone.map((t) => {
              if (t.grupId) return null; // gruplular yukarıda combined kutu olarak çizilir
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
                  isMergeTarget={dropTarget?.kind === 'table' && dropTarget.id === t.id}
                  onPointerDown={(e) => handleTablePointerDown(e, t)}
                />
              );
            })}

            {/* Sürüklerken hizalama çizgileri */}
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
          </div>
          </div>
        )}
      </div>

      <FullTableModal
        open={!!selectedTable}
        onClose={() => setSelectedTable(null)}
        table={selectedTable}
        tables={tables}
        rol={rol}
        navigate={navigate}
        onDissolve={handleDissolve}
      />

      <KisiSayisiModal
        open={!!kisiPrompt}
        masaAd={kisiPrompt?.masaAd}
        defaultKisi={kisiPrompt?.defaultKisi}
        groupId={kisiPrompt?.groupId}
        onClose={() => setKisiPrompt(null)}
        onConfirm={confirmKisi}
        onDissolve={async () => {
          const gId = kisiPrompt?.groupId;
          if (!gId) return;
          if (!confirm('Bu grubun tüm masaları ayrılsın mı?')) return;
          try {
            await dissolveTableGroup({ groupId: gId, force: true });
            toast.success('Masalar ayrıldı');
            setKisiPrompt(null);
          } catch (err) {
            console.error(err);
            toast.error(err.message || 'Ayırma başarısız');
          }
        }}
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
        group={pendingMerge?.group}
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
  isMergeTarget,
  onPointerDown,
}) {
  const { w, h } = tableDim(table);
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
  const round = table.sekil === 'yuvarlak' ? 'rounded-full' : 'rounded-lg';
  const rotation = table.rotation || 0;

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute flex flex-col items-center justify-between border-2 p-2 text-white shadow-md transition active:scale-95 ${round} ${colors[effectiveDurum] || colors.bos} ${
        isDragging ? 'z-30 cursor-grabbing shadow-2xl ring-4 ring-blue-400 ring-offset-2' : canDrag ? 'cursor-grab' : 'cursor-pointer'
      } ${isMergeTarget ? 'z-30 scale-105 ring-4 ring-amber-300 ring-offset-2' : ''} select-none`}
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        touchAction: 'none',
      }}
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

function ConfirmMergeModal({ open, dragged, target, group, submitting, onCancel, onConfirm }) {
  if (!open || !dragged || (!target && !group)) return null;
  const baseKapasite = group ? group.kapasite || 0 : target?.kapasite || 0;
  const totalKapasite = baseKapasite + (dragged.kapasite || 0);
  const baseAd = group
    ? (group.memberAdlari || []).join(' + ') || group.mainTableAd
    : target?.ad;
  const anaMasaAd = group ? group.mainTableAd : target?.ad;
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={group ? 'Gruba Ekle' : 'Masaları Birleştir'}
      size="sm"
      footer={
        <>
          <button onClick={onCancel} className="btn-secondary" disabled={submitting}>
            İptal
          </button>
          <button onClick={onConfirm} className="btn-primary" disabled={submitting}>
            <Link2 size={14} /> {group ? 'Gruba Ekle' : 'Birleştir'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-700">
          <strong>{baseAd}</strong> ile <strong>{dragged.ad}</strong> birleştirilsin mi?
        </p>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
          <p>• Yeni kapasite: <strong>{totalKapasite} kişilik</strong></p>
          <p>• Ana masa: <strong>{anaMasaAd}</strong> (sipariş bu masaya açılır)</p>
          <p>• <strong>Ödeme alındığında</strong> birleştirme otomatik kalkar ve masalar eski yerlerine döner.</p>
        </div>
      </div>
    </Modal>
  );
}

function KisiSayisiModal({ open, masaAd, defaultKisi, groupId, onClose, onConfirm, onDissolve, onSwitchToReserve }) {
  const [kisi, setKisi] = useState(defaultKisi || 2);

  useEffect(() => {
    if (open) setKisi(defaultKisi || 2);
  }, [open, defaultKisi]);

  if (!open) return null;

  const quick = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${masaAd} — Kaç kişi?`}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-between">
          <div>
            {groupId && (
              <button
                type="button"
                onClick={onDissolve}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                <Link2Off size={14} /> Masaları Ayır
              </button>
            )}
          </div>
          <div className="flex gap-2">
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
          </div>
        </div>
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

function FullTableModal({ open, onClose, table, tables = [], rol, navigate, onDissolve }) {
  const { user, profile } = useAuthStore();
  const { settings } = useSettingsStore();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancellingTicket, setCancellingTicket] = useState(null);
  const [adisyonOpen, setAdisyonOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  if (!open || !table) return null;
  const order = table.order;
  const group = table.group;
  const canPay = ['kasiyer', 'admin'].includes(rol);
  const canCancel = ['kasiyer', 'admin'].includes(rol);

  const handleTransfer = async (targetTableId) => {
    // hata fırlatırsa alt modal yakalar ve toast gösterir, açık kalır
    await transferOrder({
      orderId: order.id,
      sourceTableId: table.id,
      targetTableId,
      kullaniciId: user?.uid,
      kullaniciAd: profile?.ad || null,
    });
    toast.success('Masa taşındı');
    setTransferOpen(false);
    onClose();
  };

  const handleCancelConfirm = async (sebep) => {
    try {
      await cancelActiveOrder({
        orderId: order.id,
        sebep,
        kullaniciId: user?.uid,
        kullaniciAd: profile?.ad || 'Bilinmiyor',
      });
      toast.success('Sipariş iptal edildi');
      setCancelOpen(false);
      // Mutfağa iptal fişi bas
      setCancellingTicket({ order, items: order.items, sebep });
    } catch (err) {
      toast.error(err?.message || 'İptal başarısız');
    }
  };

  const handleCancelTicketClose = () => {
    setCancellingTicket(null);
    onClose();
  };

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
          <div className="grid grid-cols-3 gap-3 text-sm">
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
          </div>

          <div className="rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium uppercase text-slate-500">
              Sipariş İçeriği
            </div>
            <ul className="divide-y divide-slate-100">
              {order.items.map((it, idx) => (
                <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                  <span>
                    <strong>{formatAdet(it.adet)}×</strong> {it.ad}
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
              <Plus size={16} /> Sipariş Ekle / Düzenle
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

          {/* Masayı Taşı / Aktar — siparişi başka boş masaya taşır (birleşik masada gizli) */}
          {!group && (
            <button
              onClick={() => setTransferOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <ArrowLeftRight size={16} /> Masayı Taşı / Aktar
            </button>
          )}

          {/* Hesap Fişi (Adisyon) — ödemeden önce müşteriye verilir */}
          <button
            onClick={() => setAdisyonOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <Printer size={16} /> Hesap Fişi (Adisyon) Bas
          </button>

          {/* Sipariş İptal — yetkili kullanıcılar için, ayrı blokta */}
          {canCancel && (
            <button
              onClick={() => setCancelOpen(true)}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            >
              <Ban size={14} /> Siparişi İptal Et
            </button>
          )}
        </div>
      )}

      <CancelOrderModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancelConfirm}
        orderTotal={order?.toplam}
      />

      <TransferTableModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        sourceTable={table}
        tables={tables}
        onConfirm={handleTransfer}
      />

      {/* İptal fişi mutfağa otomatik basar (modal açılınca KitchenTicket akışı) */}
      <KitchenTicket
        open={!!cancellingTicket}
        onClose={handleCancelTicketClose}
        order={cancellingTicket?.order}
        items={cancellingTicket?.items}
        isCancellation={true}
        cancellationReason={cancellingTicket?.sebep || ''}
      />

      {/* Adisyon (hesap fişi) — ödemeden önce */}
      <AdisyonTicket
        open={adisyonOpen}
        onClose={() => setAdisyonOpen(false)}
        order={order}
        settings={settings}
      />
    </Modal>
  );
}

function TransferTableModal({ open, onClose, sourceTable, tables = [], onConfirm }) {
  const [targetId, setTargetId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetId(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open || !sourceTable) return null;

  // Uygun hedefler: boş + gruplu olmayan + kaynak masa değil (tüm bölgeler)
  const candidates = tables
    .filter(
      (t) => t.id !== sourceTable.id && (t.durum || 'bos') === 'bos' && !t.grupId,
    )
    .sort(
      (a, b) =>
        String(a.zone || '').localeCompare(String(b.zone || '')) ||
        String(a.ad).localeCompare(String(b.ad), 'tr', { numeric: true }),
    );

  const handleConfirm = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      await onConfirm(targetId);
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Taşıma başarısız');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${sourceTable.ad} → Masayı Taşı`}
      size="md"
      footer={
        <>
          <button onClick={onClose} disabled={submitting} className="btn-secondary">
            İptal
          </button>
          <button
            onClick={handleConfirm}
            disabled={!targetId || submitting}
            className="btn-primary disabled:opacity-50"
          >
            <ArrowLeftRight size={14} /> {submitting ? 'Taşınıyor…' : 'Taşı'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          <strong>{sourceTable.ad}</strong> masasındaki siparişin tamamı seçeceğin boş masaya
          aktarılacak.
        </p>
        {candidates.length === 0 ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Aktarılabilecek boş masa yok.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {candidates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTargetId(t.id)}
                className={`rounded-lg border-2 p-2 text-center transition ${
                  targetId === t.id
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-semibold">{t.ad}</div>
                <div className="text-[10px] text-slate-400">
                  {ZONE_LABELS[t.zone] || t.zone || 'İç Salon'} · {t.kapasite}k
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CancelOrderModal({ open, onClose, onConfirm, orderTotal }) {
  const [sebep, setSebep] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSebep('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const canConfirm = sebep.trim().length >= 3 && !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(sebep.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Siparişi İptal Et"
      footer={
        <>
          <button onClick={onClose} disabled={submitting} className="btn-secondary">
            Vazgeç
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="btn-primary bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            <Ban size={14} /> İptal Et ({formatTL(orderTotal || 0)})
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠️ Bu siparişi iptal etmek:
          <ul className="ml-4 mt-1 list-disc space-y-0.5">
            <li>Ürün <strong>stoğunu geri yükler</strong></li>
            <li>Masayı <strong>boşaltır</strong></li>
            <li>Mutfağa <strong>iptal fişi basar</strong></li>
            <li>Raporlamada <strong>iptal</strong> olarak görünür</li>
          </ul>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            İptal Sebebi <span className="text-red-500">*</span>
          </label>
          <textarea
            value={sebep}
            onChange={(e) => setSebep(e.target.value)}
            rows={3}
            placeholder="Ör: Müşteri vazgeçti, yanlış sipariş, mutfak hatası..."
            className="input"
            autoFocus
          />
          <p className="mt-1 text-xs text-slate-500">En az 3 karakter, mutfak fişine yazılacak.</p>
        </div>
      </div>
    </Modal>
  );
}
