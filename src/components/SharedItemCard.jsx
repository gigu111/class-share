import { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileText,
  Link as LinkIcon,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { formatFileSize, formatKoreanTime } from '../utils/format';

const BADGE_MAP = {
  text: { label: '텍스트', icon: FileText, className: '' },
  code: { label: '코드', icon: Code2, className: 'code' },
  link: { label: '링크', icon: LinkIcon, className: 'link' },
  file: { label: '파일', icon: Paperclip, className: 'file' },
};

export function SharedItemCard({ item, canDelete, onDelete }) {
  const [copied, setCopied] = useState(false);

  const badge = BADGE_MAP[item.item_type] || BADGE_MAP.text;
  const BadgeIcon = badge.icon;

  const handleCopy = async () => {
    const targetText =
      item.item_type === 'file' ? item.file_url : item.content || '';
    if (!targetText) return;

    try {
      await navigator.clipboard.writeText(targetText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  return (
    <article className="item-card">
      <div className="item-card-top">
        <div className="item-meta">
          <span className={`item-badge ${badge.className}`}>
            <BadgeIcon size={13} />
            {badge.label}
          </span>
          <span className="item-time">{formatKoreanTime(item.created_at)}</span>
        </div>

        {canDelete && (
          <button
            type="button"
            className="icon-btn-danger"
            onClick={() => onDelete(item)}
            title="삭제"
            aria-label="공유 항목 삭제"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {item.item_type === 'code' && (
        <pre className="item-content-code">
          <code>{item.content}</code>
        </pre>
      )}

      {item.item_type === 'link' && (
        <a
          href={item.content}
          target="_blank"
          rel="noopener noreferrer"
          className="item-content-link"
        >
          {item.content}
        </a>
      )}

      {item.item_type === 'text' && (
        <p className="item-content-text">{item.content}</p>
      )}

      {item.item_type === 'file' && (
        <div className="item-file-box">
          <div className="item-file-info">
            <Paperclip size={18} color="#2563eb" />
            <div style={{ minWidth: 0 }}>
              <div className="item-file-name">{item.file_name}</div>
              <div className="item-file-size">
                {formatFileSize(item.file_size)}
              </div>
            </div>
          </div>
          <a
            href={item.file_url}
            target="_blank"
            rel="noopener noreferrer"
            download={item.file_name}
            className="btn btn-secondary btn-sm"
          >
            <Download size={14} />
            다운로드
          </a>
        </div>
      )}

      <div className="item-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleCopy}
        >
          {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
          {copied
            ? '복사됨!'
            : item.item_type === 'file'
              ? '파일 링크 복사'
              : '복사'}
        </button>
      </div>
    </article>
  );
}
