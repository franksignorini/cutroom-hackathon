import { ImageResponse } from "next/og";

// The film-leader mark (ring, crosshair, first sweep, the red dot) for iOS home screens.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a0a0b" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <path d="M32 32V11a21 21 0 0 1 21 21z" fill="#ede8e0" fillOpacity=".16" />
          <circle cx="32" cy="32" r="21" fill="none" stroke="#ede8e0" strokeOpacity=".6" strokeWidth="3" />
          <path
            d="M32 4v9M32 51v9M4 32h9M51 32h9"
            stroke="#ede8e0"
            strokeOpacity=".35"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="9" fill="#ff4d1a" />
        </svg>
      </div>
    ),
    size,
  );
}
