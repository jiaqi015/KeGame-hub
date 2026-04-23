interface UserIdentityBadgeProps {
  nickname?: string;
  email?: string;
  compact?: boolean;
  sessionExpiresAt?: string;
}

export function UserIdentityBadge({ nickname, email, compact = false, sessionExpiresAt }: UserIdentityBadgeProps) {
  if (!nickname && !email) {
    return null;
  }

  const primaryLabel = nickname || email || '';
  const avatarLabel = primaryLabel.slice(0, 2).toUpperCase();
  const rootClassName = compact
    ? 'inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]'
    : 'inline-flex items-center gap-2.5 rounded-full border border-black/5 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]';

  return (
    <div className={rootClassName}>
      <div className={`${compact ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-xs'} flex shrink-0 items-center justify-center rounded-full bg-[#111111] font-bold uppercase tracking-[0.08em] text-white`}>
        {avatarLabel}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <div className="truncate text-sm font-semibold text-[#111111]">
          {primaryLabel}
        </div>
        {email && email !== primaryLabel ? (
          <div className="truncate text-xs text-[#6E6E73]">
            {email}
          </div>
        ) : null}
        {sessionExpiresAt ? (
          <div className="truncate text-[11px] text-[#8E8E93]">
            有效至 {formatSessionExpiry(sessionExpiresAt)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatSessionExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
