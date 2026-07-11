import { Component } from 'react';

/**
 * Uygulama genel hata sınırı.
 * Bir render/lifecycle hatası tüm ekranı beyaza düşürmesin — bunun yerine
 * kurtarılabilir bir hata ekranı gösterir ve hatayı konsola yazar.
 * POS gibi kesintisiz çalışması gereken bir üründe kritik.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Gerçek hatayı konsola bas (beyaz ekran yerine teşhis edilebilir).
    console.error('[ErrorBoundary] Yakalanan hata:', error, info?.componentStack);
  }

  handleReload = () => {
    // Modül/HMR durumunu temizlemek için tam yeniden yükleme.
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-lg">
          <div className="mb-2 text-4xl">⚠️</div>
          <h1 className="mb-1 text-xl font-bold text-slate-900">Bir şeyler ters gitti</h1>
          <p className="mb-4 text-sm text-slate-500">
            Ekran beklenmedik bir hatayla karşılaştı. Kaldığın yerden devam etmek için
            "Tekrar Dene", tamamen yenilemek için "Sayfayı Yenile"yi kullan.
          </p>
          <pre className="mb-4 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-left text-xs text-red-600">
            {String(error?.message || error)}
          </pre>
          <div className="flex justify-center gap-2">
            <button
              onClick={this.handleReset}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Tekrar Dene
            </button>
            <button
              onClick={this.handleReload}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Sayfayı Yenile
            </button>
          </div>
        </div>
      </div>
    );
  }
}
