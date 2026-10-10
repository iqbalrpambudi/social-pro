import React, { useState } from 'react';
import {
  Users,
  Plus,
  Trash2,
  CheckCircle2,
  Info,
  ExternalLink,
  X,
  HelpCircle,
} from 'lucide-react';
import { YouTubeIcon } from '../components/YouTubeIcon';
import { api } from '../lib/api';
import type { SocialAccount } from '../lib/api';

interface AccountsViewProps {
  accounts: SocialAccount[];
  onRefresh: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ accounts, onRefresh }) => {
  const [isConnectingReal, setIsConnectingReal] = useState(false);
  const [isAddingMock, setIsAddingMock] = useState(false);
  const [mockName, setMockName] = useState('My YouTube Channel');
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Connect Real YouTube via Google OAuth
  const handleConnectRealYouTube = async () => {
    setIsConnectingReal(true);
    try {
      const res = await api.connectYouTubeOAuth();
      // Redirect browser langsung ke Google OAuth Consent Screen
      window.location.href = res.authorizationUrl;
    } catch (err: any) {
      if (err.message?.includes('YOUTUBE_CLIENT_ID') || err.message?.includes('OAUTH_CREDENTIALS_MISSING')) {
        setShowSetupModal(true);
      } else {
        alert(`Gagal memulai Google OAuth: ${err.message}`);
      }
    } finally {
      setIsConnectingReal(false);
    }
  };

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
            Kelola channel YouTube resmi yang terhubung dan izin publikasi video
          </p>
        </div>

        {/* Buttons for connecting accounts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Real YouTube OAuth Button */}
          <button
            onClick={handleConnectRealYouTube}
            disabled={isConnectingReal}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #ff0033 0%, #cc0000 100%)',
              color: '#ffffff',
              padding: '9px 18px',
              fontSize: '0.85rem',
              boxShadow: '0 4px 15px -3px rgba(255, 0, 51, 0.4)',
            }}
          >
            <YouTubeIcon size={18} color="#ffffff" />
            {isConnectingReal ? 'Menghubungi Google...' : 'Hubungkan Akun YouTube Asli'}
          </button>

          <button
            onClick={() => setShowSetupModal(true)}
            className="btn btn-ghost"
            style={{ padding: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}
            title="Panduan Setup Google Cloud Console"
          >
            <HelpCircle size={18} />
          </button>
        </div>
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
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#fff' }}>Koneksi Akun YouTube Asli (Google OAuth 2.0):</strong>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
            Saat tombol <strong>"Hubungkan Akun YouTube Asli"</strong> diklik, Anda akan diarahkan ke halaman izin resmi Google untuk memilih akun/channel YouTube Anda. Token disimpan terenkripsi dengan AES-256-GCM.
          </p>
          <div style={{ marginTop: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
              Belum punya Google Cloud OAuth Client ID?{' '}
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                Lihat 4 Langkah Mudah Setup Google Console &gt;
              </button>
            </span>
          </div>
        </div>
      </div>

      {/* Connected Accounts Grid */}
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
            Belum ada channel YouTube yang terhubung
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Hubungkan akun YouTube resmi Anda melalui Google OAuth.
          </p>
          <button
            onClick={handleConnectRealYouTube}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #ff0033 0%, #cc0000 100%)',
              color: '#ffffff',
              padding: '10px 20px',
              margin: '0 auto',
            }}
          >
            <YouTubeIcon size={18} color="#ffffff" /> Hubungkan Akun YouTube Asli
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
                      background: 'rgba(255, 0, 51, 0.15)',
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
                      {acc.platform} • ID: {acc.externalAccountId.substring(0, 16)}...
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
                  Izin & Kapabilitas:
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

      {/* Dev Tool: Add simulated channel */}
      <div
        style={{
          marginTop: '36px',
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px dashed var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Opsi Pengujian Cepat (Dev Mode)</span>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
            Tambahkan channel tiruan jika Anda ingin mencoba alur publish tanpa memotong kuota harian YouTube asli.
          </p>
        </div>
        <form onSubmit={handleAddMock} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="input"
            value={mockName}
            onChange={(e) => setMockName(e.target.value)}
            placeholder="Nama channel..."
            style={{ width: '180px', padding: '6px 10px', fontSize: '0.8rem' }}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={isAddingMock}
            style={{ padding: '6px 14px', fontSize: '0.8rem' }}
          >
            <Plus size={14} />
            {isAddingMock ? 'Menambahkan...' : 'Tambah Channel Simulasi'}
          </button>
        </form>
      </div>

      {/* Google Cloud Console Setup Guidance Modal */}
      {showSetupModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowSetupModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '620px',
              padding: '28px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <YouTubeIcon size={24} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  Panduan Menghubungkan Akun YouTube Asli
                </h3>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '6px' }}
                onClick={() => setShowSetupModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
              Untuk dapat mengunggah video ke YouTube asli melalui API resmi Google, Anda memerlukan <strong>OAuth 2.0 Client ID</strong> dari Google Cloud Console. Berikut langkah cepatnya:
            </p>

            <ol style={{ fontSize: '0.84rem', color: '#e2e8f0', paddingLeft: '20px', lineHeight: 1.8 }}>
              <li>
                Buka <strong><a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>Google Cloud Console <ExternalLink size={12} style={{ display: 'inline' }} /></a></strong> dan buat project baru.
              </li>
              <li>
                Di menu <strong>APIs & Services &gt; Library</strong>, cari dan aktifkan <strong>"YouTube Data API v3"</strong>.
              </li>
              <li>
                Di menu <strong>OAuth consent screen</strong>:
                <ul style={{ paddingLeft: '18px', color: 'var(--text-muted)' }}>
                  <li>Pilih User Type: <strong>External</strong>.</li>
                  <li>Di bagian <strong>Test users</strong>, tambahkan alamat email Google/YouTube Anda.</li>
                </ul>
              </li>
              <li>
                Di menu <strong>Credentials &gt; Create Credentials &gt; OAuth client ID</strong>:
                <ul style={{ paddingLeft: '18px', color: 'var(--text-muted)' }}>
                  <li>Application type: <strong>Web application</strong>.</li>
                  <li>
                    Authorized redirect URIs tambahkan persis:{' '}
                    <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
                      http://localhost:4000/v1/oauth/youtube/callback
                    </code>
                  </li>
                </ul>
              </li>
              <li>
                Salin <strong>Client ID</strong> dan <strong>Client Secret</strong> yang didapat, lalu tempelkan ke file <code style={{ color: '#fbbf24' }}>.env</code> di root project:
                <pre
                  style={{
                    background: '#040711',
                    padding: '12px',
                    borderRadius: '8px',
                    marginTop: '8px',
                    fontSize: '0.78rem',
                    color: '#a7f3d0',
                    fontFamily: 'monospace',
                  }}
                >
                  YOUTUBE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com{'\n'}
                  YOUTUBE_CLIENT_SECRET=GOCSPX_your_secret_here{'\n'}
                  ENABLE_MOCK_ADAPTER=false
                </pre>
              </li>
            </ol>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowSetupModal(false)}
                style={{ padding: '8px 20px' }}
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
