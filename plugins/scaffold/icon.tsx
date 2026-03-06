export function ScaffoldIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-label="Scaffold logo"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Scaffold</title>
      <path
        d="M4 4h16v16H4z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 4v16M16 4v16M4 8h16M4 16h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
