import type { ReactNode } from 'react';

type IconProps = { size?: number };

function svg(paths: ReactNode) {
  return function Icon({ size = 16 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  };
}

export const IconCopy = svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>
);

export const IconCheck = svg(<path d="M20 6 9 17l-5-5" />);

export const IconDownload = svg(
  <>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </>
);

export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </>
);

export const IconDocs = svg(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </>
);

export const IconSkills = svg(
  <>
    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
  </>
);

export const IconAgents = svg(
  <>
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <path d="M8 16h.01" />
    <path d="M16 16h.01" />
  </>
);

export const IconSession = svg(
  <>
    <path d="M3 12h4l3 8 4-16 3 8h4" />
  </>
);

export const IconWorkflow = svg(
  <>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="12" r="3" />
    <path d="M6 9v6" />
    <path d="M8.5 7.5 15.5 10.5" />
    <path d="M8.5 16.5 15.5 13.5" />
  </>
);

export const IconTool = svg(
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />
);
