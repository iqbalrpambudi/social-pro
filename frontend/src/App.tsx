import { useState, useEffect, useCallback } from 'react';
import {
  Send,
  Activity,
  Users,
  Film,
} from 'lucide-react';
import { Navbar } from './components/Navbar';
import { PublishView } from './pages/PublishView';
import { MonitoringView } from './pages/MonitoringView';
import { AccountsView } from './pages/AccountsView';
import { MediaLibraryView } from './pages/MediaLibraryView';
import { useSSE } from './hooks/useSSE';
import { api } from './lib/api';
import type { SocialAccount, Publication, MediaAsset, DailyQuota } from './lib/api';

type Tab = 'publish' | 'monitoring' | 'accounts' | 'library';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('publish');

  // Shared application state
  const [systemReady, setSystemReady] = useState(false);
  const [quota, setQuota] = useState<DailyQuota | null>(null);
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [mediaList, setMediaList] = useState<MediaAsset[]>([]);
  const [oauthNotice, setOauthNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Refresh all state
  const refreshAll = useCallback(async () => {
    try {
      const readyRes = await api.getReady().catch(() => ({ status: 'error', database: 'error', storage: 'error' }));
      setSystemReady(readyRes.status === 'ready');

      const [quotaRes, accountsRes, pubsRes, mediaRes] = await Promise.all([
        api.getDailyQuota().catch(() => null),
        api.getSocialAccounts().catch(() => ({ data: [] })),
        api.listPublications({ limit: 100 }).catch(() => ({ data: [] })),
        api.listMedia().catch(() => ({ data: [] })),
      ]);

      if (quotaRes) setQuota(quotaRes);
      if (accountsRes?.data) setSocialAccounts(accountsRes.data);
      if (pubsRes?.data) setPublications(pubsRes.data);
      if (mediaRes?.data) setMediaList(mediaRes.data);
    } catch (err) {
      console.error('Error refreshing state:', err);
    }
  }, []);

  // Handle URL query parameters dari Google OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const channel = params.get('channel');
    const oauthError = params.get('oauth_error');

    if (connected === 'youtube') {
      setOauthNotice({
        type: 'success',
        message: `Channel YouTube "${channel || 'Channel'}" berhasil dihubungkan! Anda dapat mulai mengunggah video ke YouTube asli.`,
      });
      window.history.replaceState({}, '', window.location.pathname);
      refreshAll();
      setActiveTab('accounts');
    } else if (oauthError) {
      setOauthNotice({
        type: 'error',
        message: `Koneksi Google OAuth gagal: ${oauthError}. Periksa pengaturan redirect URI di Google Cloud Console.`,
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshAll]);

  // SSE Real-Time Updates
  const { isConnected: sseConnected, latestEvent } = useSSE(
    useCallback((event) => {
      console.log('SSE Event diterima:', event);
      // Auto-refresh publications and quota saat ada event SSE
      api.listPublications({ limit: 100 }).then((res) => res?.data && setPublications(res.data)).catch(() => {});
      api.getDailyQuota().then((res) => res && setQuota(res)).catch(() => {});
    }, [])
  );

  useEffect(() => {
    refreshAll();
    // Heartbeat polling 15s
    const timer = setInterval(refreshAll, 15000);
    return () => clearInterval(timer);
  }, [refreshAll]);

  const activePublicationsCount = publications.filter(
    (p) => p.status === 'queued' || p.status === 'processing'
  ).length;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar
        sseConnected={sseConnected}
        systemReady={systemReady}
        quota={quota}
        onRefreshAll={refreshAll}
      />

      {/* OAuth Banner Notification */}
      {oauthNotice && (
        <div
          style={{
            maxWidth: '1280px',
            margin: '16px auto 0',
            padding: '0 24px',
            width: '100%',
          }}
        >
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 'var(--radius-md)',
              background:
                oauthNotice.type === 'success'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${
                oauthNotice.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)'
              }`,
              color: oauthNotice.type === 'success' ? '#34d399' : '#f87171',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.88rem',
              fontWeight: 500,
            }}
          >
            <span>{oauthNotice.message}</span>
            <button
              className="btn btn-ghost"
              style={{ padding: '4px', color: 'inherit' }}
              onClick={() => setOauthNotice(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main style={{ flex: 1, paddingBottom: '60px' }}>
        {/* Navigation Tabs Header */}
        <div
          style={{
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(13, 18, 30, 0.6)',
          }}
        >
          <div
            style={{
              maxWidth: '1280px',
              margin: '0 auto',
              padding: '0 24px',
              display: 'flex',
              gap: '8px',
              overflowX: 'auto',
            }}
          >
            {[
              { id: 'publish', label: 'Buat Publikasi', icon: Send },
              {
                id: 'monitoring',
                label: 'Live Monitoring',
                icon: Activity,
                badge: activePublicationsCount > 0 ? activePublicationsCount : undefined,
              },
              {
                id: 'accounts',
                label: 'Akun Terhubung',
                icon: Users,
                badge: socialAccounts.length > 0 ? socialAccounts.length : undefined,
              },
              { id: 'library', label: 'Media Library', icon: Film },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '16px 18px',
                    fontSize: '0.88rem',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? 'var(--primary)' : 'transparent'}`,
                    background: 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon
                    size={16}
                    color={isActive ? 'var(--primary)' : 'currentColor'}
                  />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: '9999px',
                        background: isActive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                      }}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === 'publish' && (
          <PublishView
            socialAccounts={socialAccounts}
            onPublicationCreated={() => {
              refreshAll();
              setActiveTab('monitoring');
            }}
            onNavigateToAccounts={() => setActiveTab('accounts')}
          />
        )}

        {activeTab === 'monitoring' && (
          <MonitoringView
            publications={publications}
            latestEvent={latestEvent}
            sseConnected={sseConnected}
            onRefresh={refreshAll}
            onNavigateToAccounts={() => setActiveTab('accounts')}
            onNavigateToPublish={() => setActiveTab('publish')}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsView
            accounts={socialAccounts}
            onRefresh={refreshAll}
          />
        )}

        {activeTab === 'library' && (
          <MediaLibraryView
            mediaList={mediaList}
            onRefresh={refreshAll}
          />
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '20px 24px',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
          background: 'rgba(9, 13, 22, 0.95)',
        }}
      >
        <p>
          SocialPro Uploader • Node.js + Hono + PostgreSQL + Drizzle + pg-boss + S3 Direct Upload
        </p>
      </footer>
    </div>
  );
}

export default App;
