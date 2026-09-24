// Merkezi rol / yetki yardımcıları.
// Tek kaynak: sipariş iptal yetkisi SADECE godmode kullanıcısındadır (Sezgin).
// Garson, kasiyer ve admin(email) iptal yapamaz.

export const GODMODE_ROL = 'godmode';

/** Bu rol sipariş iptal / silme yapabilir mi? */
export function canCancelOrders(rol) {
  return rol === GODMODE_ROL;
}

/** Kullanıcı godmode mi? */
export function isGodmode(rol) {
  return rol === GODMODE_ROL;
}
