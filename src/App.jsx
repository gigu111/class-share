import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { generateRoomCode, generateTeacherKey } from './utils/format';
import { Header } from './components/Header';
import { TeacherView } from './components/TeacherView';
import { StudentView } from './components/StudentView';

function parseLocation() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams(window.location.search);
  return {
    code: path || null,
    teacherParam: params.get('teacher'),
  };
}

function getRecentRooms() {
  try {
    return JSON.parse(localStorage.getItem('recent_teacher_rooms') || '[]');
  } catch {
    return [];
  }
}

function saveRecentRoom(roomInfo) {
  const list = getRecentRooms().filter((r) => r.code !== roomInfo.code);
  const updated = [roomInfo, ...list].slice(0, 5);
  localStorage.setItem('recent_teacher_rooms', JSON.stringify(updated));
  return updated;
}

function removeRecentRoom(code) {
  const updated = getRecentRooms().filter((r) => r.code !== code);
  localStorage.setItem('recent_teacher_rooms', JSON.stringify(updated));
  return updated;
}

export default function App() {
  const [{ code, teacherParam }, setLocationState] = useState(parseLocation);

  // 홈 화면 상태
  const [roomNameInput, setRoomNameInput] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [homeError, setHomeError] = useState('');
  const [recentRooms, setRecentRooms] = useState(getRecentRooms);

  // 수업방 화면 상태
  const [room, setRoom] = useState(null);
  const [items, setItems] = useState([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [teacherKey, setTeacherKey] = useState('');
  const [loading, setLoading] = useState(Boolean(code));
  const [notFound, setNotFound] = useState(false);
  const [onlineCount, setOnlineCount] = useState(1);
  const [isConnected, setIsConnected] = useState(false);

  // 뒤로가기/앞으로가기 대응
  useEffect(() => {
    const onPopState = () => setLocationState(parseLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (url) => {
    window.history.pushState({}, '', url);
    setLocationState(parseLocation());
  };

  // 수업방 만들기
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    const trimmedName = roomNameInput.trim();
    if (!trimmedName || creating) return;

    setCreating(true);
    setHomeError('');

    try {
      const newCode = generateRoomCode();
      const newTeacherKey = generateTeacherKey();

      const { data, error } = await supabase
        .from('rooms')
        .insert({
          code: newCode,
          name: trimmedName,
          teacher_key: newTeacherKey,
        })
        .select('id, code, name, created_at')
        .single();

      if (error) throw error;

      setRecentRooms(
        saveRecentRoom({
          code: data.code,
          name: data.name,
          teacherKey: newTeacherKey,
        })
      );
      navigate(`/${data.code}?teacher=${newTeacherKey}`);
    } catch (err) {
      setHomeError(err.message || '수업방을 만들지 못했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // 코드로 학생 입장
  const handleJoinRoom = (e) => {
    e.preventDefault();
    const trimmed = joinCodeInput.trim();
    if (!trimmed) return;
    navigate(`/${trimmed}`);
  };

  // 수업방 데이터 불러오기 + Realtime 구독
  useEffect(() => {
    if (!code) {
      setRoom(null);
      setItems([]);
      setLoading(false);
      setNotFound(false);
      return;
    }

    let channel;
    let cancelled = false;

    async function loadRoomAndSubscribe() {
      setLoading(true);
      setNotFound(false);

      // 1) 방 정보 조회
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('id, code, name, created_at')
        .eq('code', code)
        .maybeSingle();

      if (cancelled) return;

      if (roomError || !roomData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setRoom(roomData);

      // 2) 선생님 키 확인 (URL의 ?teacher= 파라미터로만 선생님/학생 화면을 구분)
      const candidateKey = teacherParam || '';

      let verifiedTeacher = false;
      if (candidateKey) {
        const { data: isValid } = await supabase.rpc('verify_teacher_key', {
          p_room_id: roomData.id,
          p_teacher_key: candidateKey,
        });
        verifiedTeacher = Boolean(isValid);
      }

      if (cancelled) return;
      setIsTeacher(verifiedTeacher);
      setTeacherKey(verifiedTeacher ? candidateKey : '');

      // 3) 기존 공유된 내용 목록 조회
      const { data: itemsData } = await supabase
        .from('shared_items')
        .select('*')
        .eq('room_id', roomData.id)
        .order('created_at', { ascending: false });

      if (cancelled) return;
      setItems(itemsData || []);
      setLoading(false);

      // 4) Supabase Realtime 구독 (새 글/삭제/방 이름 변경 + 접속자 수 Presence)
      const presenceId =
        sessionStorage.getItem('presence_id') ||
        Math.random().toString(36).slice(2);
      sessionStorage.setItem('presence_id', presenceId);

      channel = supabase.channel(`room:${roomData.id}`, {
        config: {
          presence: { key: presenceId },
        },
      });

      channel
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'shared_items',
            filter: `room_id=eq.${roomData.id}`,
          },
          (payload) => {
            setItems((prev) =>
              prev.some((i) => i.id === payload.new.id)
                ? prev
                : [payload.new, ...prev]
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'shared_items',
            filter: `room_id=eq.${roomData.id}`,
          },
          (payload) => {
            setItems((prev) => prev.filter((i) => i.id !== payload.old.id));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomData.id}`,
          },
          (payload) => {
            setRoom((prev) => (prev ? { ...prev, name: payload.new.name } : prev));
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${roomData.id}`,
          },
          () => {
            setNotFound(true);
            setRoom(null);
          }
        )
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          setOnlineCount(Object.keys(state).length);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            setIsConnected(true);
            await channel.track({
              role: verifiedTeacher ? 'teacher' : 'student',
              joined_at: new Date().toISOString(),
            });
          } else {
            setIsConnected(false);
          }
        });
    }

    loadRoomAndSubscribe();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [code, teacherParam]);

  // 1) 홈 화면
  if (!code) {
    return (
      <>
        <Header />
        <main className="home-container">
          <div className="home-card">
            <h1 className="home-title">수업공유</h1>
            <p className="home-subtitle">
              수업 중 학생들에게 텍스트, 링크, 코드, 파일을 실시간으로 빠르게 전달하세요.
            </p>

            {homeError && <div className="error-banner">{homeError}</div>}

            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label className="form-label" htmlFor="room-name">
                  새 수업방 만들기 (선생님용)
                </label>
                <input
                  id="room-name"
                  type="text"
                  className="text-input"
                  placeholder="예: 바이브 코딩"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={creating || !roomNameInput.trim()}
              >
                {creating ? '수업방 만드는 중...' : '수업방 만들기'}
              </button>
            </form>

            <div className="divider-line">또는 수업방 코드로 입장</div>

            <form onSubmit={handleJoinRoom} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="text-input"
                placeholder="6자리 코드 입력 (예: 823509)"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
              />
              <button
                type="submit"
                className="btn btn-secondary"
                style={{ flexShrink: 0 }}
                disabled={!joinCodeInput.trim()}
              >
                입장
              </button>
            </form>

            {recentRooms.length > 0 && (
              <>
                <div className="divider-line">최근 만든 수업방 (선생님용)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentRooms.map((r) => (
                    <button
                      key={r.code}
                      type="button"
                      className="btn btn-secondary"
                      style={{ justifyContent: 'space-between', width: '100%' }}
                      onClick={() => navigate(`/${r.code}?teacher=${r.teacherKey}`)}
                    >
                      <span>{r.name}</span>
                      <span style={{ color: '#2563eb', fontSize: 12.5 }}>{r.code}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </>
    );
  }

  // 2) 로딩 중
  if (loading) {
    return (
      <>
        <Header />
        <main className="student-layout">
          <div className="empty-state">수업방을 불러오는 중입니다...</div>
        </main>
      </>
    );
  }

  // 3) 방을 찾을 수 없음
  if (notFound || !room) {
    return (
      <>
        <Header />
        <main className="home-container">
          <div className="home-card" style={{ textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 8px' }}>수업방을 찾을 수 없습니다</h2>
            <p className="home-subtitle" style={{ marginBottom: 20 }}>
              코드가 잘못되었거나 선생님이 수업방을 삭제했습니다.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/')}
            >
              처음으로 돌아가기
            </button>
          </div>
        </main>
      </>
    );
  }

  // 4) 선생님 화면 / 학생 화면
  return (
    <>
      <Header
        roomName={room.name}
        isTeacher={isTeacher}
        onlineCount={onlineCount}
        isConnected={isConnected}
      />

      {isTeacher ? (
        <TeacherView
          room={room}
          teacherKey={teacherKey}
          items={items}
          onItemsChange={setItems}
          onRoomUpdated={setRoom}
          onRoomDeleted={() => {
            setRecentRooms(removeRecentRoom(room.code));
            navigate('/');
          }}
        />
      ) : (
        <StudentView items={items} />
      )}
    </>
  );
}
