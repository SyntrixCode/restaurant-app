import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, RefreshCw, Users as UsersIcon } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import StatCard from '../../components/ui/StatCard';
import Modal from '../../components/ui/Modal';
import Toggle from '../../components/ui/Toggle';
import { watchCollection, patchDoc, removeDoc, upsertDoc } from '../../firebase/firestore';
import { userSchema, randomCode4 } from '../../utils/validators';
import { createPosUser } from '../../firebase/auth';
import { derivePosCredentials } from '../../utils/hash';
import { POS_EMAIL_DOMAIN } from '../../firebase/config';
import { useAuthStore } from '../../store/authStore';

const ROLE_LABEL = { admin: 'Admin', kasiyer: 'Kasiyer', garson: 'Garson' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState({ rol: 'all', aktif: 'all' });
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => watchCollection('users', setUsers), []);

  const filtered = users.filter((u) => {
    if (filter.rol !== 'all' && u.rol !== filter.rol) return false;
    if (filter.aktif === 'active' && !u.aktif) return false;
    if (filter.aktif === 'passive' && u.aktif) return false;
    return true;
  });

  const stats = {
    toplam: users.length,
    aktif: users.filter((u) => u.aktif).length,
    garson: users.filter((u) => u.rol === 'garson').length,
    kasiyer: users.filter((u) => u.rol === 'kasiyer').length,
  };

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (u) => {
    setEditing(u);
    setOpen(true);
  };

  const handleDelete = async (u) => {
    if (!confirm(`${u.ad} kullanıcısı silinsin mi?`)) return;
    try {
      await removeDoc('users', u.id);
      toast.success('Kullanıcı silindi');
    } catch (err) {
      toast.error('Silme hatası');
      console.error(err);
    }
  };

  const handleResetCode = async (u) => {
    toast.error('Kod sıfırlama Spark planında destelenmiyor. Kullanıcıyı silip yeniden yaratın.');
  };

  const toggleActive = async (u) => {
    await patchDoc('users', u.id, { aktif: !u.aktif });
  };

  return (
    <div className="p-8">
      <PageHeader
        title="Kullanıcılar"
        subtitle="Garson ve kasiyer hesaplarını yönetin"
        actions={
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Yeni Kullanıcı
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard label="Toplam" value={stats.toplam} icon={UsersIcon} />
        <StatCard label="Aktif" value={stats.aktif} color="green" />
        <StatCard label="Garson" value={stats.garson} color="blue" />
        <StatCard label="Kasiyer" value={stats.kasiyer} color="amber" />
      </div>

      <div className="mb-4 flex gap-2">
        <select
          value={filter.rol}
          onChange={(e) => setFilter((f) => ({ ...f, rol: e.target.value }))}
          className="input max-w-xs"
        >
          <option value="all">Tüm Roller</option>
          <option value="garson">Garson</option>
          <option value="kasiyer">Kasiyer</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={filter.aktif}
          onChange={(e) => setFilter((f) => ({ ...f, aktif: e.target.value }))}
          className="input max-w-xs"
        >
          <option value="all">Tümü</option>
          <option value="active">Sadece Aktif</option>
          <option value="passive">Sadece Pasif</option>
        </select>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ad</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Kod İpucu</th>
              <th className="px-4 py-3">Durum</th>
              <th className="px-4 py-3 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan="5" className="py-12 text-center text-slate-500">
                  Henüz kullanıcı yok. "Yeni Kullanıcı" ile başlayın.
                </td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.ad}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{ROLE_LABEL[u.rol]}</span>
                </td>
                <td className="px-4 py-3 font-mono text-slate-600">{u.kodIpucu || '****'}</td>
                <td className="px-4 py-3">
                  <Toggle checked={u.aktif} onChange={() => toggleActive(u)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button onClick={() => handleResetCode(u)} className="btn-ghost px-2 py-1" title="Kodu Sıfırla">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => openEdit(u)} className="btn-ghost px-2 py-1" title="Düzenle">
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="btn-ghost px-2 py-1 text-red-600 hover:bg-red-50"
                      title="Sil"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserModal open={open} onClose={() => setOpen(false)} editing={editing} />
    </div>
  );
}

function UserModal({ open, onClose, editing }) {
  const isEdit = !!editing;
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: { ad: '', rol: 'garson', kod: '', aktif: true },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? { ad: editing.ad, rol: editing.rol, kod: '', aktif: editing.aktif ?? true }
          : { ad: '', rol: 'garson', kod: randomCode4(), aktif: true },
      );
    }
  }, [open, editing, reset]);

  const aktif = watch('aktif');
  const kod = watch('kod');

  const onSubmit = async (data) => {
    try {
      if (isEdit) {
        await patchDoc('users', editing.id, {
          ad: data.ad,
          rol: data.rol,
          aktif: data.aktif,
        });
        toast.success('Kullanıcı güncellendi');
      } else {
        const { uid } = await createPosUser({
          kod: data.kod,
          ad: data.ad,
          rol: data.rol,
        });
        await upsertDoc('users', uid, {
          ad: data.ad,
          rol: data.rol,
          aktif: data.aktif,
          kodIpucu: `${data.kod[0]}***`,
        });
        toast.success(`Eklendi. Kod: ${data.kod}`);
      }
      onClose();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        toast.error('Bu kod zaten kullanımda. Farklı bir kod seçin.');
      } else {
        toast.error('Kayıt hatası: ' + (err.message || ''));
      }
      console.error(err);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            İptal
          </button>
          <button
            type="submit"
            form="user-form"
            disabled={isSubmitting}
            className="btn-primary"
          >
            {isSubmitting ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Ad Soyad</label>
          <input {...register('ad')} className="input" autoFocus />
          {errors.ad && <p className="mt-1 text-xs text-red-600">{errors.ad.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Rol</label>
          <select {...register('rol')} className="input">
            <option value="garson">Garson</option>
            <option value="kasiyer">Kasiyer</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            4 Haneli Kod
          </label>
          <div className="flex gap-2">
            <input {...register('kod')} maxLength={4} className="input font-mono tracking-widest" />
            <button
              type="button"
              onClick={() => setValue('kod', randomCode4(), { shouldValidate: true })}
              className="btn-secondary whitespace-nowrap"
            >
              Otomatik Üret
            </button>
          </div>
          {errors.kod && <p className="mt-1 text-xs text-red-600">{errors.kod.message}</p>}
          {kod?.length === 4 && (
            <p className="mt-1 text-xs text-slate-500">
              Kayıt sonrası kod sadece "{kod[0]}***" şeklinde görünür. Kullanıcıya iletmeyi unutmayın.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
          <span className="text-sm font-medium text-slate-700">Aktif</span>
          <Toggle checked={aktif} onChange={(v) => setValue('aktif', v)} />
        </div>
      </form>
    </Modal>
  );
}
