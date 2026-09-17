// Íconos de línea, minimalistas y livianos (SVG inline, sin dependencias externas).
// Heredan el color del texto vía currentColor.

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export type IconName =
  | "home"
  | "route"
  | "swap"
  | "bottle"
  | "clipboard"
  | "boxes"
  | "leaf"
  | "tag"
  | "truck"
  | "users"
  | "chart";

const paths: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3.5 11 12 4l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-6h5v6" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="6.5" r="2.2" />
      <circle cx="18" cy="17.5" r="2.2" />
      <path d="M7.6 8.1C8.6 9 9.5 9.8 10.5 10.4c2 1.2 3 2.4 3 4.2 0 1 .5 1.8 1.3 2.4" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h14" />
      <path d="M14.5 4.5 18 8l-3.5 3.5" />
      <path d="M20 16H6" />
      <path d="M9.5 12.5 6 16l3.5 3.5" />
    </>
  ),
  bottle: (
    <>
      <path d="M10 3h4v3.2l2.2 3.3V19a2 2 0 0 1-2 2h-4.4a2 2 0 0 1-2-2V9.5L10 6.2V3Z" />
      <path d="M9 12.5h6" />
      <path d="M10 3h4" />
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.2" width="14" height="16.6" rx="2" />
      <path d="M9 3.2h6v3H9z" />
      <path d="M8.5 11h7" />
      <path d="M8.5 14.5h7" />
      <path d="M8.5 18h4.5" />
    </>
  ),
  boxes: (
    <>
      <rect x="3.5" y="11.5" width="7" height="7" rx="1" />
      <rect x="13.5" y="11.5" width="7" height="7" rx="1" />
      <rect x="8.5" y="4.5" width="7" height="7" rx="1" />
    </>
  ),
  leaf: (
    <>
      <path d="M19.5 4.5c-9 0-14 4.8-14 14.5 9.7 0 14.5-5 14.5-14.5Z" />
      <path d="M7.5 19c3.5-3.6 7-7.2 10.5-10.7" />
    </>
  ),
  tag: (
    <>
      <path d="M11.8 3.5h6.2a1.5 1.5 0 0 1 1.5 1.5v6.2a1.5 1.5 0 0 1-.44 1.06l-8.4 8.4a1.5 1.5 0 0 1-2.12 0l-6.2-6.2a1.5 1.5 0 0 1 0-2.12l8.4-8.4a1.5 1.5 0 0 1 1.06-.44Z" />
      <circle cx="16" cy="8" r="1.35" />
    </>
  ),
  truck: (
    <>
      <rect x="2.2" y="7" width="12" height="9.2" rx="1" />
      <path d="M14.2 10h3.8l3 3.2v3H14.2Z" />
      <circle cx="7" cy="18.3" r="1.8" />
      <circle cx="17.3" cy="18.3" r="1.8" />
    </>
  ),
  users: (
    <>
      <circle cx="8.3" cy="8" r="3" />
      <path d="M2.5 20c0-3.3 2.6-6 5.8-6s5.8 2.7 5.8 6" />
      <circle cx="17" cy="7.2" r="2.3" />
      <path d="M14.8 20c.35-2.7 2.2-4.6 4.7-5" />
    </>
  ),
  chart: (
    <>
      <rect x="4" y="12.5" width="3.2" height="7.5" rx="0.6" />
      <rect x="10.4" y="6.5" width="3.2" height="13.5" rx="0.6" />
      <rect x="16.8" y="9.5" width="3.2" height="10.5" rx="0.6" />
    </>
  ),
};

export default function Icon({ name }: { name: string }) {
  const content = paths[name as IconName];
  if (!content) return null;
  return (
    <svg {...common} width="16" height="16" aria-hidden="true">
      {content}
    </svg>
  );
}
