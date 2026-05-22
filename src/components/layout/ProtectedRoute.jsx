import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export default function ProtectedRoute({ roles, fallback = '/admin/login', children }) {
  const location = useLocation();
  const { user, rol, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Yükleniyor...
      </div>
    );
  }

  if (!user) {
    return <Navigate to={fallback} state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(rol)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">Erişim Yok</h2>
        <p className="text-slate-500">Bu sayfaya erişim yetkiniz bulunmuyor.</p>
      </div>
    );
  }

  return children;
}
