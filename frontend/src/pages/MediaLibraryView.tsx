import { Film, Image, CheckCircle2, RotateCcw } from 'lucide-react';
import type { MediaAsset } from '../lib/api';

interface MediaLibraryViewProps {
  mediaList: MediaAsset[];
  onRefresh: () => void;
}

export const MediaLibraryView: React.FC<MediaLibraryViewProps> = ({ mediaList, onRefresh }) => {
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
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Media Asset Library (S3 Storage)</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Daftar file video dan thumbnail yang tersimpan aman di object storage
          </p>
        </div>

        <button onClick={onRefresh} className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.8rem' }}>
          <RotateCcw size={15} /> Muat Ulang
        </button>
      </div>

      {mediaList.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <Film size={40} color="var(--text-dim)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px' }}>
            Belum ada media tersimpan
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Video yang Anda unggah akan otomatis terdaftar di sini.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {mediaList.map((m) => {
            const isVideo = m.mediaType === 'video' || m.contentType.startsWith('video/');
            const sizeMB = (m.sizeBytes / (1024 * 1024)).toFixed(1);

            return (
              <div
                key={m.id}
                className="glass-panel"
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Media Preview Box */}
                <div
                  style={{
                    height: '160px',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: '#05070d',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {m.previewUrl ? (
                    isVideo ? (
                      <video
                        src={m.previewUrl}
                        controls
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <img
                        src={m.previewUrl}
                        alt={m.fileName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-dim)' }}>
                      {isVideo ? <Film size={32} /> : <Image size={32} />}
                      <p style={{ fontSize: '0.72rem', marginTop: '6px' }}>Preview belum siap</p>
                    </div>
                  )}
                </div>

                <div>
                  <h4
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={m.fileName}
                  >
                    {m.fileName}
                  </h4>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '6px',
                      fontSize: '0.75rem',
                      color: 'var(--text-dim)',
                    }}
                  >
                    <span>{sizeMB} MB • {m.contentType}</span>
                    <span className="badge badge-success" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                      <CheckCircle2 size={11} /> {m.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
