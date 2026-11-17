import { SharedItemCard } from './SharedItemCard';

export function StudentView({ items }) {
  return (
    <main className="student-layout">
      <div className="feed-header">
        <h2 className="feed-title">
          공유된 내용 <span className="feed-count">{items.length}</span>
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          아직 선생님이 공유한 내용이 없습니다. 잠시만 기다려 주세요!
        </div>
      ) : (
        <div className="feed-list">
          {items.map((item) => (
            <SharedItemCard key={item.id} item={item} canDelete={false} />
          ))}
        </div>
      )}
    </main>
  );
}
