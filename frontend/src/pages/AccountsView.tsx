import React, { useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { YouTubeIcon } from '../components/YouTubeIcon';
import { api } from '../lib/api';
import type { SocialAccount } from '../lib/api';

interface AccountsViewProps {
  accounts: SocialAccount[];
  onRefresh: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ accounts, onRefresh }) => {
  const [isAddingMock, setIsAddingMock] = useState(false);
  const [mockName, setMockName] = useState('My YouTube Channel');
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const handleAddMock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingMock(true);
    try {
      await api.connectMockAccount(mockName.trim() || 'My YouTube Channel', 'youtube');
      onRefresh();
    } catch (err: any) {
      alert(`Gagal menghubungkan akun: ${err.message}`);
    } finally {
      setIsAddingMock(false);
    }
  };

  const handleDisconnect = async (id: string, name: string) => {
    if (!confirm(`Yakin ingin memutuskan koneksi akun "${name}"?`)) return;

    setDisconnectingId(id);
    try {
      await api.disconnectAccount(id);
      onRefresh();
    } catch (err: any) {
      alert(`Gagal memutuskan akun: ${err.message}`);
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Manajemen Akun Media Sosial</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Kelola akun resmi yang terhubung dan izin publikasi video
          </p>
        </div>

        {/* Action to connect account */}
        <form onSubmit={handleAddMock} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input"
            value={mockName}
            onChange={(e) => setMockName(e.target.value)}
            placeholder="Nama channel..."
            style={{ width: '220px', padding: '8px 12px' }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isAddingMock}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Plus size={16} />
            {isAddingMock ? 'Menghubungkan...' : 'Tambah Channel (Dev/Mock)'}
          </button>
        </form>
      </div>

      {/* Info card */}
      <div
        style={{
          background: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'start',
          gap: '12px',
          fontSize: '0.85rem',
        }}
      >
        <Info size={18} color="var(--primary)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <strong style={{ color: '#fff' }}>Keamanan Kredensial & Batasan Kuota:</strong>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
            Access token dan refresh token disimpan terenkripsi (AES-256-GCM) di backend dan tidak pernah dikirim ke browser. Akun developer YouTube dibatasi 10.000 unit/hari (~6 video/hari). Akun Dev/Mock di atas dapat digunakan untuk melakukan testing tanpa memotong kuota API Google.
          </p>
        </div>
      </div>

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <Users size={40} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            Belum ada akun sosial media yang terhubung
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Hubungkan channel YouTube atau akun simulasi untuk mulai mengunggah video.
          </p>
          <button onClick={handleAddMock} className="btn btn-primary" style={{ padding: '10px 20px' }}>
            <Plus size={16} /> Tambah Channel Dev Sekarang
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
          }}
        >
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="glass-panel"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      background:
                        acc.platform === 'youtube'
                          ? 'rgba(255, 0, 51, 0.15)'
                          : 'rgba(99, 102, 241, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <YouTubeIcon size={22} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '0.98rem', fontWeight: 700 }}>{acc.displayName}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                      {acc.platform} • ID: {acc.externalAccountId.substring(0, 10)}...
                    </p>
                  </div>
                </div>

                <span className="badge badge-success">
                  <CheckCircle2 size={12} /> {acc.status}
                </span>
              </div>

              {/* Capabilities */}
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Fitur yang Didukung:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                    Video Upload
                  </span>
                  <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                    Scheduled Publish
                  </span>
                  <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                    Custom Thumbnail
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '12px',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <button
                  onClick={() => handleDisconnect(acc.id, acc.displayName)}
                  disabled={disconnectingId === acc.id}
                  className="btn btn-ghost"
                  style={{ color: '#f87171', padding: '6px 12px', fontSize: '0.78rem' }}
                >
                  <Trash2 size={14} />
                  {disconnectingId === acc.id ? 'Memutuskan...' : 'Putuskan Koneksi'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
