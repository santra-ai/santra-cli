export default function SantraIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      aria-label="Santra"
    >
      <circle cx="256" cy="256" r="220" fill="#F97316" />
      <path
        d="M320 -20 C248 70 228 150 284 240 C338 324 288 410 198 532"
        fill="none"
        stroke="#FFF9F4"
        strokeWidth="34"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
