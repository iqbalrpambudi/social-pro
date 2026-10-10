import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  Film,
  Image,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Send,
  FileVideo,
  X,
} from 'lucide-react';
import { YouTubeIcon } from '../components/YouTubeIcon';
import { api } from '../lib/api';
import type { SocialAccount, MediaAsset } from '../lib/api';

interface PublishViewProps {
  socialAccounts: SocialAccount[];
  onPublicationCreated: () => void;
  onNavigateToAccounts: () => void;
}

export const PublishView: React.FC<PublishViewProps> = ({
  socialAccounts,
  onPublicationCreated,
  onNavigateToAccounts,
}) => {
  // Video upload states
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<MediaAsset | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Thumbnail upload states
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [uploadedThumb, setUploadedThumb] = useState<MediaAsset | null>(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState<string | null>(null);

  // Metadata states
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');

  // Target accounts states
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Schedule states
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');

  // Submit state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  // Handle Video Selection and Direct S3 Upload
  const handleVideoSelect = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setUploadError('File harus berupa video (MP4, MOV, WEBM).');
      return;
    }

    setVideoFile(file);
    setUploadError(null);
    setIsUploading(true);
    setUploadProgress(0);

    // Default title dari filename tanpa ekstensi
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    if (!title) {
      setTitle(nameWithoutExt);
    }

    try {
      // 1. Minta presigned URL dari backend API
      const session = await api.createUploadSession(file.name, file.type, file.size);

      // 2. Upload binary langsung ke Object Storage via presigned PUT URL
      await api.uploadToPresignedUrl(
        session.upload.url,
        file.type,
        file,
        (percent) => setUploadProgress(percent)
      );

      // 3. Konfirmasi upload selesai ke backend
      const completeRes = await api.completeUpload(session.media.id);
      setUploadedVideo(completeRes.media);

      // Buat URL preview lokal untuk player
      setVideoPreviewUrl(URL.createObjectURL(file));
      setUploadProgress(null);
    } catch (err: any) {
      console.error('Upload video gagal:', err);
      setUploadError(err.message || 'Gagal mengunggah video ke storage.');
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Thumbnail Selection and Upload
  const handleThumbSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Thumbnail harus berupa gambar (JPG, PNG, WEBP).');
      return;
    }

    setThumbFile(file);
    try {
      const session = await api.createUploadSession(file.name, file.type, file.size);
      await api.uploadToPresignedUrl(session.upload.url, file.type, file);
      const completeRes = await api.completeUpload(session.media.id);
      setUploadedThumb(completeRes.media);
      setThumbPreviewUrl(URL.createObjectURL(file));
    } catch (err: any) {
      alert(`Gagal mengunggah thumbnail: ${err.message}`);
    }
  };

  const toggleAccountSelection = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((accId) => accId !== id) : [...prev, id]
    );
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadedVideo) {
      alert('Silakan unggah video terlebih dahulu.');
      return;
    }

    if (selectedAccountIds.length === 0) {
      alert('Pilih minimal satu akun sosial media tujuan.');
      return;
    }

    setIsPublishing(true);
    setPublishSuccessMessage(null);

    try {
      const targets = selectedAccountIds.map((accId) => ({
        socialAccountId: accId,
        title: title.trim(),
        caption: caption.trim(),
        visibility,
        thumbnailMediaId: uploadedThumb ? uploadedThumb.id : undefined,
      }));

      const scheduleAt =
        isScheduled && scheduledDate ? new Date(scheduledDate).toISOString() : null;

      await api.createPublication({
        mediaId: uploadedVideo.id,
        targets,
        scheduleAt,
      });

      setPublishSuccessMessage(
        'Publikasi berhasil dikirim ke antrian worker! Status akan diperbarui secara real-time.'
      );

      // Reset form
      setVideoFile(null);
      setUploadedVideo(null);
      setVideoPreviewUrl(null);
      setThumbFile(null);
      setUploadedThumb(null);
      setThumbPreviewUrl(null);
      setTitle('');
      setCaption('');
      setSelectedAccountIds([]);

      // Notify parent to refresh list
      onPublicationCreated();
    } catch (err: any) {
      alert(`Gagal membuat publikasi: ${err.message}`);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Success banner */}
      {publishSuccessMessage && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <CheckCircle2 color="var(--color-success)" size={22} />
            <span style={{ color: '#34d399', fontWeight: 600 }}>{publishSuccessMessage}</span>
          </div>
          <button
            className="btn btn-ghost"
            style={{ padding: '4px', color: '#34d399' }}
            onClick={() => setPublishSuccessMessage(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <form onSubmit={handlePublish}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: '24px',
            alignItems: 'start',
          }}
        >
          {/* LEFT COLUMN: Media Upload & Preview */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Video Uploader Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Film size={20} color="var(--primary)" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>1. Unggah Video</h2>
              </div>

              {!uploadedVideo && !isUploading ? (
                <div
                  style={{
                    border: '2px dashed var(--border-hover)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '40px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.02)',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => videoInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files[0]) handleVideoSelect(e.dataTransfer.files[0]);
                  }}
                >
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && handleVideoSelect(e.target.files[0])}
                  />
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.1)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <UploadCloud size={28} />
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px' }}>
                    Klik atau tarik file video ke sini
                  </h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    Mendukung MP4, QuickTime (MOV), WebM hingga 1 GB
                  </p>
                  <p style={{ fontSize: '0.72rem', color: '#818cf8', marginTop: '10px' }}>
                    ⚡ Direct upload ke private S3 storage (presigned URL)
                  </p>
                </div>
              ) : null}

              {/* Uploading Progress */}
              {isUploading && (
                <div
                  style={{
                    padding: '30px 20px',
                    textAlign: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <FileVideo size={24} color="var(--primary)" />
                    <span style={{ fontWeight: 600 }}>{videoFile?.name}</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '10px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '5px',
                      overflow: 'hidden',
                      marginBottom: '10px',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${uploadProgress || 0}%`,
                        background: 'var(--gradient-brand)',
                        transition: 'width 0.15s ease',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Mengunggah langsung ke S3: {uploadProgress ?? 0}%
                  </p>
                </div>
              )}

              {/* Upload Error */}
              {uploadError && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '12px 16px',
                    background: 'var(--color-error-bg)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#f87171',
                    fontSize: '0.85rem',
                  }}
                >
                  <AlertCircle size={18} />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Completed Video Preview Player */}
              {uploadedVideo && videoPreviewUrl && (
                <div style={{ marginTop: '10px' }}>
                  <div
                    style={{
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      background: '#000',
                      border: '1px solid var(--border-subtle)',
                      position: 'relative',
                      maxHeight: '340px',
                    }}
                  >
                    <video
                      src={videoPreviewUrl}
                      controls
                      style={{ width: '100%', maxHeight: '340px', display: 'block' }}
                    />
                  </div>
                  <div
                    style={{
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} color="var(--color-success)" />
                      <span style={{ color: '#34d399', fontWeight: 600 }}>Tersimpan di S3</span>
                      <span>• {(uploadedVideo.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      onClick={() => {
                        setUploadedVideo(null);
                        setVideoPreviewUrl(null);
                        setVideoFile(null);
                      }}
                    >
                      Ganti Video
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Custom Thumbnail Card (Optional) */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Image size={18} color="var(--primary)" />
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>2. Custom Thumbnail (Opsional)</h3>
                </div>
                <span className="badge badge-neutral">Opsional</span>
              </div>

              {!thumbPreviewUrl ? (
                <div
                  style={{
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: 'rgba(255, 255, 255, 0.01)',
                  }}
                  onClick={() => thumbInputRef.current?.click()}
                >
                  <input
                    ref={thumbInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => e.target.files?.[0] && handleThumbSelect(e.target.files[0])}
                  />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    + Klik untuk memilih cover/thumbnail gambar (JPG/PNG)
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img
                    src={thumbPreviewUrl}
                    alt="Thumbnail preview"
                    style={{
                      width: '120px',
                      height: '68px',
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  />
                  <div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 600 }}>
                      {thumbFile?.name}
                    </p>
                    <span className="badge badge-success" style={{ marginTop: '4px' }}>
                      Thumbnail Siap
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '4px', display: 'block', marginTop: '6px' }}
                      onClick={() => {
                        setThumbPreviewUrl(null);
                        setUploadedThumb(null);
                        setThumbFile(null);
                      }}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Metadata & Target Platforms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Metadata Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <Sparkles size={20} color="var(--primary)" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>3. Informasi Video</h2>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Judul Video *
                </label>
                <input
                  type="text"
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Masukkan judul video yang menarik"
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Caption / Deskripsi
                </label>
                <textarea
                  className="textarea"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Tulis deskripsi, tag, dan hashtag #shorts #viral..."
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Visibilitas / Privacy
                </label>
                <select
                  className="select"
                  value={visibility}
                  onChange={(e) => setVisibility(e.target.value as any)}
                >
                  <option value="public">Publik (Dapat ditonton semua orang)</option>
                  <option value="unlisted">Unlisted (Hanya yang memiliki link)</option>
                  <option value="private">Privat (Hanya akun pengunggah)</option>
                </select>
              </div>
            </div>

            {/* Target Accounts Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>4. Akun Media Sosial Tujuan</h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {selectedAccountIds.length} dipilih
                </span>
              </div>

              {socialAccounts.length === 0 ? (
                <div
                  style={{
                    padding: '20px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    textAlign: 'center',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Belum ada akun sosial media yang terhubung.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem' }}
                    onClick={onNavigateToAccounts}
                  >
                    + Hubungkan Akun Sekarang
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {socialAccounts.map((acc) => {
                    const isSelected = selectedAccountIds.includes(acc.id);
                    return (
                      <div
                        key={acc.id}
                        onClick={() => toggleAccountSelection(acc.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderRadius: 'var(--radius-md)',
                          background: isSelected
                            ? 'rgba(99, 102, 241, 0.15)'
                            : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${
                            isSelected ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-subtle)'
                          }`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background:
                                acc.platform === 'youtube'
                                  ? 'rgba(255, 0, 51, 0.15)'
                                  : 'rgba(99, 102, 241, 0.15)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <YouTubeIcon size={18} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{acc.displayName}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'capitalize' }}>
                              Platform: {acc.platform}
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '6px',
                            border: `2px solid ${
                              isSelected ? 'var(--primary)' : 'var(--border-hover)'
                            }`,
                            background: isSelected ? 'var(--primary)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {isSelected && <CheckCircle2 size={14} color="#fff" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Schedule Option */}
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isScheduled ? '12px' : '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Clock size={18} color="var(--text-muted)" />
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>Jadwalkan Publikasi Nanti</span>
                </div>
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </div>

              {isScheduled && (
                <div style={{ marginTop: '10px' }}>
                  <input
                    type="datetime-local"
                    className="input"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    required={isScheduled}
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Waktu publikasi akan dikonversi dan diproses dalam UTC oleh database scheduler.
                  </p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!uploadedVideo || selectedAccountIds.length === 0 || isPublishing}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '1rem',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {isPublishing ? (
                'Memproses Publikasi...'
              ) : (
                <>
                  <Send size={18} />
                  Publikasikan Video ke {selectedAccountIds.length} Platform
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
