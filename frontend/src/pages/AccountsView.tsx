import React, { useState } from 'react';
import {
  Users,
  Trash2,
  CheckCircle2,
  ExternalLink,
  X,
  HelpCircle,
  Plus,
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
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showMockForm, setShowMockForm] = useState(false);
  const [mockName, setMockName] = useState('My YouTube Channel');
  const [isAddingMock, setIsAddingMock] = useState(false);

  // Connect Real YouTube via Google OAuth
  const handleConnectRealYouTube = async () => {
    setIsConnectingReal(true);
    try {
      const res = await api.connectYouTubeOAuth();
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

  const handleAddMock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAddingMock(true);
    try {
      await api.connectMockAccount(mockName.trim() || 'My YouTube Channel', 'youtube');
      setShowMockForm(false);
      onRefresh();
    } catch (err: any) {
      alert(`Gagal menambahkan akun simulasi: ${err.message}`);
    } finally {
      setIsAddingMock(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header Sederhana */}
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
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Akun Media Sosial</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Hubungkan channel YouTube Anda untuk mulai mempublikasikan video secara otomatis
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handleConnectRealYouTube}
            disabled={isConnectingReal}
            className="btn btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '0.84rem',
              background: '#ff0033',
              border: '1px solid #cc0000',
              color: '#ffffff',
            }}
          >
            <YouTubeIcon size={17} color="#ffffff" />
            {isConnectingReal ? 'Menghubungkan...' : 'Hubungkan YouTube'}
          </button>

          <button
            onClick={() => setShowSetupModal(true)}
            className="btn btn-ghost"
            style={{ padding: '8px', color: 'var(--text-dim)' }}
            title="Panduan Google Cloud OAuth"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {/* Connected Accounts List */}
      {accounts.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '50px 20px',
            textAlign: 'center',
          }}
        >
          <Users size={38} color="var(--text-dim)" style={{ margin: '0 auto 14px' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>
            Belum Ada Channel yang Terhubung
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '18px', maxWidth: '420px', margin: '0 auto 18px' }}>
            Klik tombol di bawah untuk menghubungkan akun YouTube resmi Anda melalui otorisasi resmi Google OAuth 2.0.
          </p>
          <button
            onClick={handleConnectRealYouTube}
            className="btn btn-primary"
            style={{
              background: '#ff0033',
              border: '1px solid #cc0000',
              color: '#ffffff',
              padding: '9px 20px',
            }}
          >
            <YouTubeIcon size={18} color="#ffffff" /> Hubungkan Akun YouTube
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="glass-panel"
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: 'rgba(255, 0, 51, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <YouTubeIcon size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc' }}>
                      {acc.displayName}
                    </h4>
                    <span className="badge badge-success" style={{ fontSize: '0.66rem', padding: '1px 6px' }}>
                      <CheckCircle2 size={11} /> Aktif
                    </span>
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                    Platform: YouTube • ID: {acc.externalAccountId}
                  </p>
                </div>
              </div>

              <button
                onClick={() => handleDisconnect(acc.id, acc.displayName)}
                disabled={disconnectingId === acc.id}
                className="btn btn-secondary"
                style={{
                  color: '#f87171',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                }}
              >
                <Trash2 size={13} />
                {disconnectingId === acc.id ? 'Memutuskan...' : 'Putuskan'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Dev Mode Option (Sederhana & Rapi) */}
      <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
        {!showMockForm ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Butuh menguji tanpa akun YouTube asli?
            </span>
            <button
              type="button"
              onClick={() => setShowMockForm(true)}
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--text-muted)' }}
            >
              <Plus size={13} /> Tambah Akun Simulasi (Mock)
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleAddMock}
            className="glass-panel"
            style={{
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.8rem', color: '#f8fafc' }}>Tambah Akun Simulasi</strong>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                Akun virtual lokal untuk menguji alur publikasi tanpa kuota.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                className="input"
                value={mockName}
                onChange={(e) => setMockName(e.target.value)}
                placeholder="Nama channel..."
                style={{ width: '180px', height: '32px', fontSize: '0.78rem', padding: '4px 10px' }}
                required
              />
              <button
                type="submit"
                disabled={isAddingMock}
                className="btn btn-secondary"
                style={{ height: '32px', padding: '4px 12px', fontSize: '0.78rem' }}
              >
                Simpan
              </button>
              <button
                type="button"
                onClick={() => setShowMockForm(false)}
                className="btn btn-ghost"
                style={{ height: '32px', padding: '4px 8px', fontSize: '0.78rem' }}
              >
                Batal
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Google Cloud Setup Guidance Modal */}
      {showSetupModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
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
              maxWidth: '560px',
              padding: '24px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#090e1a',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <YouTubeIcon size={22} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
                  Setup Google Cloud OAuth Client ID
                </h3>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '4px' }}
                onClick={() => setShowSetupModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <ol style={{ fontSize: '0.82rem', color: '#e2e8f0', paddingLeft: '18px', lineHeight: 1.8 }}>
              <li>
                Buka <strong><a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google Cloud Console <ExternalLink size={12} style={{ display: 'inline' }} /></a></strong> dan buat project baru.
              </li>
              <li>
                Di menu <strong>APIs & Services &gt; Library</strong>, aktifkan <strong>"YouTube Data API v3"</strong>.
              </li>
              <li>
                Di menu <strong>OAuth consent screen</strong>, pilih <strong>External</strong> dan tambahkan email Anda di bagian Test users.
              </li>
              <li>
                Di <strong>Credentials &gt; OAuth client ID</strong> (Web application), isi Authorized redirect URI:{' '}
                <code style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: '#38bdf8' }}>
                  http://localhost:4000/v1/oauth/youtube/callback
                </code>
              </li>
              <li>
                Salin <strong>Client ID & Secret</strong> ke file <code>.env</code> di root project.
              </li>
            </ol>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowSetupModal(false)}
                style={{ padding: '6px 16px', fontSize: '0.8rem' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
