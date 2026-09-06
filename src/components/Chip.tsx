export default function Chip({
  active,
  onClick,
  disabled,
  children,
  title,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1 text-xs rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? 'bg-zinc-200 text-zinc-900 border-zinc-200'
          : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
      }`}
    >
      {children}
    </button>
  )
}
