import { create } from 'zustand';
import { fetchOne } from '../firebase/firestore';
import { watchAuth, logout as fbLogout, tryRestoreAdminSession } from '../firebase/auth';

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  rol: null,
  loading: true,
  error: null,
  _restoreAttempted: false,

  init: () => {
    const unsub = watchAuth(async (firebaseUser) => {
      if (!firebaseUser) {
        // Capacitor APK'da Firebase persistence bazen restore edemiyor.
        // İlk null geldiğinde kayıtlı credential ile sessiz re-login dene.
        if (!get()._restoreAttempted) {
          set({ _restoreAttempted: true });
          const restored = await tryRestoreAdminSession();
          if (restored) return; // watchAuth tekrar tetiklenecek, user gelecek
        }
        set({ user: null, profile: null, rol: null, loading: false });
        return;
      }
      const token = await firebaseUser.getIdTokenResult();
      const rolFromClaim = token.claims.rol;
      let profile = null;
      try {
        profile = await fetchOne('users', firebaseUser.uid);
      } catch (err) {
        console.warn('users/{uid} okunamadı (kullanıcı admin olabilir):', err.message);
      }
      set({
        user: firebaseUser,
        profile,
        rol: rolFromClaim || profile?.rol || 'admin',
        loading: false,
        error: null,
      });
    });
    return unsub;
  },

  logout: async () => {
    await fbLogout();
    set({ user: null, profile: null, rol: null, _restoreAttempted: true });
  },

  hasRole: (...roles) => {
    const { rol } = get();
    return rol && roles.includes(rol);
  },
}));
