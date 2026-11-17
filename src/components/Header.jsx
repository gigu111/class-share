import { ArrowRight, Users } from 'lucide-react';

export function Header({ roomName, isTeacher, onlineCount, isConnected }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <a href="/" className="brand-link" title="처음 화면으로">
          <span className="brand-icon">
            <ArrowRight size={16} strokeWidth={2.5} />
          </span>
          <span>수업공유</span>
        </a>
        {roomName && (
          <>
            <span className="header-divider">|</span>
            <span className="room-title">{roomName}</span>
          </>
        )}
      </div>

      {isTeacher && (
        <div className="header-right">
          <span className="presence-pill" title="현재 접속 중인 인원">
            <Users size={14} />
            접속 {onlineCount}명
          </span>
          <span className="status-indicator">
            <span className={`status-dot ${isConnected ? '' : 'connecting'}`} />
            {isConnected ? '연결됨' : '연결 중...'}
          </span>
        </div>
      )}
    </header>
  );
}
