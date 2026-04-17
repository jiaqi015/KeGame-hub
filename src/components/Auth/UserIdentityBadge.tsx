interface UserIdentityBadgeProps {
  nickname?: string;
  email?: string;
  compact?: boolean;
}

export function UserIdentityBadge({ nickname, email, compact = false }: UserIdentityBadgeProps) {
  if (!nickname && !email) {
    return null;
  }

  const primaryLabel = nickname || email || '';
  const avatarLabel = primaryLabel.slice(0, 2).toUpperCase();

  return (
    <div
      className={
        compact
          ? 'inline-flex items-center gap-2 rounded-full border border-black/5 bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]'
          : 'inline-flex items-center gap-3 rounded-[20px] border border-black/5 bg-white px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.05)]'
      }
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111111] text-sm font-bold uppercase tracking-[0.08em] text-white">
        {avatarLabel}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8E8E93]">
          当前账号
        </div>
        <div className="truncate text-sm font-semibold text-[#111111]">
          {primaryLabel}
        </div>
        {email && email !== primaryLabel ? (
          <div className="truncate text-xs text-[#6E6E73]">
            {email}
          </div>
        ) : null}
      </div>
    </div>
  );
}
