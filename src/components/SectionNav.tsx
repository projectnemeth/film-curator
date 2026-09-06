type SectionNavProps = {
  counts: { watchlist: number; loved: number }
}

export function SectionNav({ counts }: SectionNavProps) {
  // self-stretch makes the whole bar height tappable, not just the text.
  const linkClass =
    'flex items-center self-stretch text-sm font-medium text-textSecondary hover:text-accent transition-colors'

  return (
    <nav
      aria-label="dashboard sections"
      className="sticky top-14 z-20 -mx-6 mb-8 flex h-11 gap-6 items-center border-b border-border bg-surface px-6"
    >
      <a href="#not-seen" className={linkClass}>
        Not Seen
      </a>
      {counts.watchlist > 0 && (
        <a href="#watchlist" className={linkClass}>
          Watchlist ({counts.watchlist})
        </a>
      )}
      {counts.loved > 0 && (
        <a href="#loved" className={linkClass}>
          Loved ({counts.loved})
        </a>
      )}
    </nav>
  )
}
