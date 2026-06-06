import { useEffect, useState } from 'react';
import { CreditCard, X, Check, AlertCircle, Smartphone, Loader2 } from 'lucide-react';
import { formatTL } from '../utils/format';
import { chargeCard } from '../services/cardPayment';

/**
 * Kart ödeme modal'ı — T650p simülasyonu / gerçek entegrasyon.
 *
 * Aşamalı görsel akış:
 *   amount-input → connecting → sending → waiting → processing → approved | declined | error
 *
 * Banka entegrasyonu aktif olduğunda sadece `provider` prop'unu 'verifone-tcp'
 * yapıp `terminalIp` geçmek yeter; UI değişmez.
 */
export default function CardPaymentModal({
  open,
  onClose,
  remaining,
  onApproved,
  provider = 'simulation',
  terminalIp,
}) {
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState('input'); // input | connecting | sending | waiting | processing | approved | declined | error
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (open) {
      setAmount(remaining.toFixed(2));
      setStage('input');
      setDetail(null);
    }
  }, [open, remaining]);

  if (!open) return null;

  const amountNum = parseFloat(amount) || 0;
  const isProcessing = ['connecting', 'sending', 'waiting', 'processing'].includes(stage);

  const handleStart = async () => {
    if (amountNum <= 0) return;
    // Manuel mod: tahsilat T650p'de elle yapılır; sahte akış yok, kasiyer sonucu işaretler
    if (provider === 'manual') {
      setStage('manual-confirm');
      return;
    }
    setStage('connecting');
    const result = await chargeCard({
      amount: amountNum,
      provider,
      terminalIp,
      onStage: (s, d) => {
        setStage(s);
        if (d) setDetail(d);
      },
    });
    if (result.ok) {
      setStage('approved');
      setDetail(result);
      // Onaylanınca 1.5sn göster, sonra modal kapansın + payment eklensin
      setTimeout(() => {
        onApproved(Math.min(amountNum, remaining), result);
      }, 1500);
    } else {
      // declined veya error
      setStage(result.reason ? (result.reason.includes('reddedildi') ? 'declined' : 'error') : 'error');
      setDetail(result);
    }
  };

  const reset = () => {
    setStage('input');
    setDetail(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <CreditCard size={18} /> Kart Ödemesi
          </h3>
          {!isProcessing && stage !== 'approved' && (
            <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="p-6">
          {stage === 'input' && (
            <InputView
              amount={amount}
              setAmount={setAmount}
              remaining={remaining}
              onCancel={onClose}
              onStart={handleStart}
              provider={provider}
            />
          )}

          {stage === 'manual-confirm' && (
            <ManualConfirmView
              amount={amountNum}
              onApprove={() => {
                setStage('approved');
                const result = { ok: true, mode: 'manual' };
                setDetail(result);
                setTimeout(() => onApproved(Math.min(amountNum, remaining), result), 900);
              }}
              onDecline={() => {
                setStage('declined');
                setDetail({ reason: 'Tahsilat alınamadı / iptal edildi' });
              }}
              onBack={reset}
            />
          )}

          {(stage === 'connecting' || stage === 'sending' || stage === 'waiting' || stage === 'processing') && (
            <ProcessingView amount={amountNum} stage={stage} detail={detail} provider={provider} />
          )}

          {stage === 'approved' && <ApprovedView amount={amountNum} detail={detail} />}

          {stage === 'declined' && (
            <ResultView
              kind="declined"
              title="Kart Reddedildi"
              message={detail?.reason || 'Banka onay vermedi'}
              onRetry={reset}
              onClose={onClose}
            />
          )}

          {stage === 'error' && (
            <ResultView
              kind="error"
              title="Bağlantı Hatası"
              message={detail?.message || detail?.reason || 'POS cihazıyla iletişim kurulamadı'}
              onRetry={reset}
              onClose={onClose}
              showBankNote={detail?.needsBankApproval}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function InputView({ amount, setAmount, remaining, onCancel, onStart, provider }) {
  const amountNum = parseFloat(amount) || 0;
  return (
    <>
      <div className="mb-1 text-xs text-slate-500">Kalan tutar: {formatTL(remaining)}</div>
      <label className="mb-1 block text-sm font-medium text-slate-700">Tutar</label>
      <input
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="input text-3xl font-bold tabular-nums"
        autoFocus
      />

      <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <Smartphone size={12} />
          {provider === 'manual'
            ? 'Manuel kart tahsilatı'
            : provider === 'simulation'
              ? 'T650p simülasyon modu'
              : 'T650p (canlı)'}
        </div>
        {provider === 'manual' ? (
          <p>Bu tutarı T650p cihazına elle girip kartı okutun, sonra sonucu işaretleyin.</p>
        ) : provider === 'simulation' ? (
          <p>
            Banka entegrasyonu hazır olana kadar simülasyon modu çalışır.
            Müşteri kartı okutmuş gibi akış gösterilir, gerçek tahsilat yapılmaz.
          </p>
        ) : (
          <p>Tutar T650p ekranına gönderilecek, müşteri kartını okutacak.</p>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <button onClick={onCancel} className="btn-secondary flex-1">
          İptal
        </button>
        <button
          onClick={onStart}
          disabled={amountNum <= 0}
          className="btn-primary flex-1 disabled:opacity-50"
        >
          <Smartphone size={14} /> {provider === 'manual' ? 'Devam' : "POS'a Gönder"}
        </button>
      </div>
    </>
  );
}

function ManualConfirmView({ amount, onApprove, onDecline, onBack }) {
  return (
    <div className="space-y-5">
      {/* Tutar ekranı — kasiyere hatırlatma */}
      <div className="rounded-xl border-2 border-slate-900 bg-slate-900 p-6 text-white">
        <div className="mb-1 text-center text-xs uppercase tracking-widest text-slate-400">
          T650p'ye girilecek tutar
        </div>
        <div className="text-center text-4xl font-bold tabular-nums">{formatTL(amount)}</div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <p className="font-semibold text-slate-700">Adımlar</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>Tutarı T650p cihazına girin</li>
          <li>Müşteriye kartı okutturun</li>
          <li>Sonuca göre aşağıdan işaretleyin</li>
        </ol>
      </div>

      <div className="flex gap-2">
        <button onClick={onDecline} className="btn-secondary flex-1 !text-red-600">
          <AlertCircle size={14} /> Reddedildi / İptal
        </button>
        <button onClick={onApprove} className="btn-primary flex-1 !bg-emerald-600 hover:!bg-emerald-700">
          <Check size={14} /> Tahsilat Onaylandı
        </button>
      </div>
      <button onClick={onBack} className="w-full text-center text-xs text-slate-400 hover:text-slate-600">
        ← Tutarı değiştir
      </button>
    </div>
  );
}

const STAGE_INFO = {
  connecting: { label: 'POS\'a bağlanılıyor…', step: 1 },
  sending: { label: 'Tutar gönderiliyor…', step: 2 },
  waiting: { label: 'Müşteri kartını okutuyor…', step: 3 },
  processing: { label: 'Banka onayı alınıyor…', step: 4 },
};

function ProcessingView({ amount, stage, detail, provider }) {
  const info = STAGE_INFO[stage];
  return (
    <div className="space-y-5">
      {/* Tutar ekranı — T650p simülasyonu gibi */}
      <div className="rounded-xl border-2 border-slate-900 bg-slate-900 p-6 text-white">
        <div className="mb-1 text-center text-xs uppercase tracking-widest text-slate-400">
          {provider === 'simulation' ? 'T650p (Simülasyon)' : 'Verifone T650p'}
        </div>
        <div className="text-center text-4xl font-bold tabular-nums">
          {formatTL(amount)}
        </div>
        <div className="mt-3 text-center text-sm text-slate-300">
          {stage === 'waiting' ? '🪪 Kartınızı okutun' : ''}
        </div>
      </div>

      {/* Aşama bar */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>Aşama {info.step}/4</span>
          <span className="font-mono">{info.label}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${(info.step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Aşama adımları */}
      <ul className="space-y-1.5 text-sm">
        {Object.entries(STAGE_INFO).map(([key, val]) => {
          const isDone = val.step < info.step;
          const isCurrent = val.step === info.step;
          return (
            <li
              key={key}
              className={`flex items-center gap-2 ${
                isDone ? 'text-emerald-600' : isCurrent ? 'text-blue-700 font-semibold' : 'text-slate-400'
              }`}
            >
              {isDone ? (
                <Check size={14} />
              ) : isCurrent ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />
              )}
              {val.label.replace('…', '')}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ApprovedView({ amount, detail }) {
  return (
    <div className="py-4 text-center">
      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <Check size={32} className="text-emerald-600" />
      </div>
      <h4 className="text-xl font-bold text-emerald-700">Ödeme Onaylandı</h4>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatTL(amount)}</p>
      {detail && (detail.cardType || detail.approvalCode || detail.mode === 'simulation') && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-left text-xs">
          {detail.cardType && (
            <div className="flex justify-between">
              <span className="text-slate-500">Kart:</span>
              <span className="font-medium">{detail.cardType} •••• {detail.cardLastFour}</span>
            </div>
          )}
          {detail.approvalCode && (
            <div className="flex justify-between">
              <span className="text-slate-500">Onay Kodu:</span>
              <span className="font-mono font-medium">{detail.approvalCode}</span>
            </div>
          )}
          {detail.mode === 'simulation' && (
            <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-center text-[10px] text-amber-700">
              ⚠️ Simülasyon — gerçek tahsilat yapılmadı
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultView({ kind, title, message, onRetry, onClose, showBankNote }) {
  return (
    <div className="py-2 text-center">
      <div
        className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${
          kind === 'declined' ? 'bg-red-100' : 'bg-amber-100'
        }`}
      >
        <AlertCircle size={32} className={kind === 'declined' ? 'text-red-600' : 'text-amber-600'} />
      </div>
      <h4 className={`text-xl font-bold ${kind === 'declined' ? 'text-red-700' : 'text-amber-700'}`}>
        {title}
      </h4>
      <p className="mt-2 text-sm text-slate-600">{message}</p>

      {showBankNote && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-left text-xs text-amber-800">
          Banka onayı bekleniyor. T650p ECR moduna alındığında otomatik aktif olacak.
          Bu süreçte simülasyon modunu kullanın.
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button onClick={onClose} className="btn-secondary flex-1">
          Vazgeç
        </button>
        <button onClick={onRetry} className="btn-primary flex-1">
          Tekrar Dene
        </button>
      </div>
    </div>
  );
}
