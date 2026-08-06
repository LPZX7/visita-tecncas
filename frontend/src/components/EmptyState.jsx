import { Link } from 'react-router-dom';

export default function EmptyState({ title, message, actionLabel, to, onAction }) {
  return (
    <div className="empty-state">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" className="empty-state__icon">
        <rect x="3" y="5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M8 13h3M8 16.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {actionLabel && to && (
        <Link to={to} className="btn btn-primary">{actionLabel}</Link>
      )}
      {actionLabel && onAction && (
        <button type="button" className="btn btn-primary" onClick={onAction}>{actionLabel}</button>
      )}
    </div>
  );
}
