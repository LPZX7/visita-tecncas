import { useRef, useState } from 'react';
import api from '../api';
import { getUser, setUser } from '../utils/auth';

const ROLE_LABEL = {
  gestor: 'Gestor',
  analista: 'Analista',
  tecnico: 'Técnico',
  cliente: 'Cliente'
};

const MAX_DIMENSION = 256;

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const [user, setLocalUser] = useState(getUser());
  const [nome, setNome] = useState(user?.nome || '');
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirma, setSenhaConfirma] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const initials = (user?.nome || '?').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]).join('').toUpperCase();

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem.');
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      setAvatarPreview(dataUrl);
    } catch {
      setError('Não foi possível processar essa imagem.');
    }
  };

  const removeAvatar = () => {
    setAvatarPreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!nome.trim()) {
      setError('O nome não pode ficar vazio.');
      return;
    }
    if (senhaNova && senhaNova !== senhaConfirma) {
      setError('A confirmação de senha não confere.');
      return;
    }
    if (senhaNova && senhaNova.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const payload = { nome, avatar: avatarPreview || null };
      if (senhaNova) {
        payload.senha_atual = senhaAtual;
        payload.senha_nova = senhaNova;
      }
      const res = await api.patch('/auth/me', payload);
      const updatedUser = { ...user, nome: res.data.nome, avatar: res.data.avatar };
      setUser(updatedUser);
      setLocalUser(updatedUser);
      setSenhaAtual('');
      setSenhaNova('');
      setSenhaConfirma('');
      setSuccess('Perfil atualizado com sucesso!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao atualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Meu Perfil</h2>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={saveProfile} className="card-form" style={{ maxWidth: 480 }}>
        <div className="row-actions" style={{ alignItems: 'center', marginBottom: 8 }}>
          {avatarPreview ? (
            <img src={avatarPreview} alt="Foto de perfil" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <span className="sidebar__avatar" style={{ width: 72, height: 72, fontSize: 24 }}>{initials}</span>
          )}
          <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>Trocar foto</button>
            {avatarPreview && <button type="button" className="btn btn-outline btn-sm" onClick={removeAvatar}>Remover</button>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />
        </div>

        <label className="form-field">Nome<input className="form-input" value={nome} onChange={(e) => setNome(e.target.value)} required /></label>
        <label className="form-field">Email<input className="form-input" value={user?.email || ''} disabled /></label>
        <label className="form-field">Perfil<input className="form-input" value={ROLE_LABEL[user?.role] || user?.role || ''} disabled /></label>

        <h3 style={{ marginTop: 8 }}>Alterar senha</h3>
        <p className="section-text">Deixe em branco se não quiser mudar a senha.</p>
        <label className="form-field">Senha atual<input className="form-input" type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} /></label>
        <label className="form-field">Nova senha<input className="form-input" type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} minLength={8} /></label>
        <label className="form-field">Confirmar nova senha<input className="form-input" type="password" value={senhaConfirma} onChange={(e) => setSenhaConfirma(e.target.value)} minLength={8} /></label>

        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </form>
    </div>
  );
}
