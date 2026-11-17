import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Maximize2, Plus, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatFileSize, isSingleUrl } from '../utils/format';
import { SharedItemCard } from './SharedItemCard';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function TeacherView({ room, teacherKey, items, onItemsChange, onRoomUpdated, onRoomDeleted }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedTeacherUrl, setCopiedTeacherUrl] = useState(false);

  const [text, setText] = useState('');
  const [isCode, setIsCode] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState(room.name);

  const fileInputRef = useRef(null);

  const studentUrl = `${window.location.origin}/${room.code}`;
  const teacherUrl = `${window.location.origin}/${room.code}?teacher=${teacherKey}`;
  const shortDisplayUrl = `${window.location.host}/${room.code}`;

  // 학생 접속용 QR 코드 이미지 생성
  useEffect(() => {
    QRCode.toDataURL(studentUrl, {
      width: 420,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [studentUrl]);

  const copyText = async (value, setFlag) => {
    try {
      await navigator.clipboard.writeText(value);
      setFlag(true);
      setTimeout(() => setFlag(false), 1800);
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  const handleFilePick = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      setErrorMsg('파일 크기는 최대 50 MB까지 업로드할 수 있습니다.');
      return;
    }
    setErrorMsg('');
    setSelectedFile(file);
  };

  const handleShare = async () => {
    if (isSubmitting) return;
    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // 1) 파일이 선택된 경우: Supabase Storage에 업로드 후 DB에 기록
      if (selectedFile) {
        const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${room.id}/${Date.now()}_${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('class-files')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('class-files')
          .getPublicUrl(filePath);

        const { data: created, error: rpcError } = await supabase.rpc('create_shared_item', {
          p_room_id: room.id,
          p_teacher_key: teacherKey,
          p_item_type: 'file',
          p_content: trimmed || null,
          p_file_name: selectedFile.name,
          p_file_size: selectedFile.size,
          p_file_path: filePath,
          p_file_url: urlData.publicUrl,
        });

        if (rpcError) throw rpcError;
        if (created) {
          onItemsChange((prev) =>
            prev.some((i) => i.id === created.id) ? prev : [created, ...prev]
          );
        }
        setSelectedFile(null);
      }

      // 2) 텍스트(또는 코드/링크)가 입력된 경우
      if (trimmed) {
        let itemType = 'text';
        if (isCode) itemType = 'code';
        else if (isSingleUrl(trimmed)) itemType = 'link';

        const { data: created, error: rpcError } = await supabase.rpc('create_shared_item', {
          p_room_id: room.id,
          p_teacher_key: teacherKey,
          p_item_type: itemType,
          p_content: trimmed,
        });

        if (rpcError) throw rpcError;
        if (created) {
          onItemsChange((prev) =>
            prev.some((i) => i.id === created.id) ? prev : [created, ...prev]
          );
        }
        setText('');
        setIsCode(false);
      }
    } catch (err) {
      setErrorMsg(err.message || '공유 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleShare();
    }
  };

  const handlePaste = (e) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      handleFilePick(files[0]);
    }
  };

  const handleDeleteItem = async (item) => {
    try {
      if (item.file_path) {
        await supabase.storage.from('class-files').remove([item.file_path]);
      }
      const { error } = await supabase
        .from('shared_items')
        .delete()
        .eq('id', item.id)
        .eq('room_id', room.id);

      if (error) throw error;
      onItemsChange((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      alert(err.message || '삭제에 실패했습니다.');
    }
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!window.confirm('공유된 내용을 모두 지울까요?')) return;

    try {
      const filePaths = items.map((i) => i.file_path).filter(Boolean);
      if (filePaths.length > 0) {
        await supabase.storage.from('class-files').remove(filePaths);
      }
      const { error } = await supabase
        .from('shared_items')
        .delete()
        .eq('room_id', room.id);

      if (error) throw error;
      onItemsChange([]);
    } catch (err) {
      alert(err.message || '전체 삭제에 실패했습니다.');
    }
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    const { error } = await supabase.rpc('rename_room', {
      p_room_id: room.id,
      p_teacher_key: teacherKey,
      p_name: trimmed,
    });

    if (error) {
      alert(error.message || '이름 변경에 실패했습니다.');
      return;
    }

    onRoomUpdated({ ...room, name: trimmed });
    setShowRenameModal(false);
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm(`"${room.name}" 수업방을 완전히 삭제할까요? 공유된 내용도 모두 사라집니다.`)) {
      return;
    }

    const filePaths = items.map((i) => i.file_path).filter(Boolean);
    if (filePaths.length > 0) {
      await supabase.storage.from('class-files').remove(filePaths);
    }

    const { error } = await supabase.from('rooms').delete().eq('id', room.id);
    if (error) {
      alert(error.message || '수업방 삭제에 실패했습니다.');
      return;
    }

    localStorage.removeItem(`teacher_key_${room.code}`);
    onRoomDeleted();
  };

  return (
    <main className="teacher-layout">
      {/* 왼쪽 패널: 학생 접속 방법 + 공유하기 + 방 관리 */}
      <aside className="sidebar-stack">
        <section className="card">
          <h2 className="card-title">학생 접속 방법</h2>
          <div className="qr-box">
            {qrDataUrl && <img src={qrDataUrl} alt="학생 접속 QR 코드" className="qr-image" />}
            <div className="qr-info">
              <p className="qr-caption">QR 코드를 찍거나 주소창에 입력</p>
              <p className="qr-url">
                {shortDisplayUrl.replace(room.code, '')}
                <span className="qr-url-code">{room.code}</span>
              </p>
              <div className="qr-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyText(studentUrl, setCopiedUrl)}
                >
                  {copiedUrl ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                  {copiedUrl ? '복사됨' : '주소 복사'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowQrModal(true)}
                >
                  <Maximize2 size={13} />
                  크게 보기
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          className="card"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.[0]) {
              handleFilePick(e.dataTransfer.files[0]);
            }
          }}
        >
          <h2 className="card-title">공유하기</h2>

          {errorMsg && <div className="error-banner">{errorMsg}</div>}

          <textarea
            className={`share-textarea ${isDragging ? 'share-dropzone-active' : ''}`}
            placeholder="링크나 텍스트를 붙여넣으세요"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
          />

          {selectedFile && (
            <div className="selected-file-chip">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </span>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', padding: 2 }}
                aria-label="선택한 파일 취소"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFilePick(e.target.files[0]);
              e.target.value = '';
            }}
          />

          <div className="share-controls">
            <div className="share-controls-left">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={14} />
                파일 추가
              </button>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isCode}
                  onChange={(e) => setIsCode(e.target.checked)}
                />
                코드로 표시
              </label>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={isSubmitting || (!text.trim() && !selectedFile)}
              onClick={handleShare}
            >
              {isSubmitting ? '공유 중...' : '공유'}
            </button>
          </div>

          <p className="share-hint">
            Enter로 공유 · Shift+Enter로 줄바꿈 · 파일은 끌어다 놓거나 Ctrl+V (최대 50 MB)
          </p>
        </section>

        <div className="room-manage-links">
          <button
            type="button"
            className="text-link-btn"
            onClick={() => {
              setNewName(room.name);
              setShowRenameModal(true);
            }}
          >
            이름 바꾸기
          </button>
          <button
            type="button"
            className="text-link-btn"
            onClick={() => copyText(teacherUrl, setCopiedTeacherUrl)}
          >
            {copiedTeacherUrl ? '선생님용 링크 복사됨!' : '선생님용 링크 복사'}
          </button>
          <button
            type="button"
            className="text-link-btn danger"
            onClick={handleDeleteRoom}
          >
            수업방 삭제
          </button>
        </div>
      </aside>

      {/* 오른쪽 패널: 공유된 내용 목록 */}
      <section>
        <div className="feed-header">
          <h2 className="feed-title">
            공유된 내용 <span className="feed-count">{items.length}</span>
          </h2>
          {items.length > 0 && (
            <button type="button" className="text-link-btn danger" onClick={handleClearAll}>
              모두 지우기
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            왼쪽 입력창에 텍스트, 링크, 코드 또는 파일을 올리면 학생 화면에 실시간으로 표시됩니다.
          </div>
        ) : (
          <div className="feed-list">
            {items.map((item) => (
              <SharedItemCard
                key={item.id}
                item={item}
                canDelete={true}
                onDelete={handleDeleteItem}
              />
            ))}
          </div>
        )}
      </section>

      {/* QR 크게 보기 모달 */}
      {showQrModal && (
        <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>{room.name}</h3>
            <p style={{ margin: 0, fontSize: 13.5, color: '#6b7280' }}>
              스마트폰 카메라로 QR 코드를 스캔하세요
            </p>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="학생 접속 QR 코드 크게 보기" className="modal-qr-large" />
            )}
            <div className="modal-code-big">{room.code}</div>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#374151', wordBreak: 'break-all' }}>
              {studentUrl}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-full"
              onClick={() => setShowQrModal(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 수업방 이름 바꾸기 모달 */}
      {showRenameModal && (
        <div className="modal-backdrop" onClick={() => setShowRenameModal(false)}>
          <form
            className="modal-card"
            style={{ textAlign: 'left' }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleRenameSubmit}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 17 }}>수업방 이름 바꾸기</h3>
            <input
              type="text"
              className="text-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="새 수업방 이름"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowRenameModal(false)}
              >
                취소
              </button>
              <button type="submit" className="btn btn-primary">
                저장
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
