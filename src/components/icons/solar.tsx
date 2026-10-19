import React from "react";

export type SolarIconName =
  | "home"
  | "wallet"
  | "card"
  | "chart"
  | "calendar"
  | "bell"
  | "chat-round-dots"
  | "shield-check"
  | "lock-keyhole"
  | "clock-circle"
  | "check-circle"
  | "close-circle"
  | "danger-triangle"
  | "money-bag"
  | "receipt"
  | "users-group-rounded"
  | "settings"
  | "camera"
  | "paperclip"
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "arrow-down"
  | "dots-menu"
  | "sparkles"
  | "search"
  | "plus"
  | "edit"
  | "undo"
  | "filter"
  | "log-out"
  | "lock"
  | "user"
  | "trend-up"
  | "trend-down"
  | "info-circle"
  | "check"
  | "refresh"
  | "cup"
  | "bag"
  | "car"
  | "heart"
  | "plane"
  | "paper-plane"
  | "image"
  | "tv"
  | "book"
  | "bolt"
  | "trash"
  | "layers"
  | "microphone"
  | "microphone-slash"
  | "volume-loud"
  | "volume-cross"
  | "soundwave"
  | "phone-hangup"
  | "eye"
  | "eye-closed";

interface SolarIconProps extends React.SVGProps<SVGSVGElement> {
  name: SolarIconName;
  size?: number | string;
  className?: string;
  variant?: "outline" | "bold" | "duotone";
}

export function SolarIcon({
  name,
  size = 20,
  className = "",
  variant = "outline",
  ...props
}: SolarIconProps) {
  const s = size;

  switch (name) {
    case "home":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M2.5192 7.82274C2 8.77128 2 9.91549 2 12.2039v1.5211c0 3.9008 0 5.8513 1.17157 7.0631C4.34315 22 6.22876 22 10 22h4c3.7712 0 5.6569 0 6.8284 -1.2119C22 19.5763 22 17.6258 22 13.725v-1.5211c0 -2.28841 0 -3.43262 -0.5192 -4.38116 -0.5192 -0.94853 -1.4677 -1.53723 -3.3648 -2.71462l-2 -1.24125C14.1106 2.62229 13.1079 2 12 2c-1.1079 0 -2.11061 0.62229 -4.11597 1.86687l-2 1.24126C3.98695 6.28551 3.0384 6.87421 2.5192 7.82274ZM9 17.25c-0.41421 0 -0.75 0.3358 -0.75 0.75s0.33579 0.75 0.75 0.75h6c0.4142 0 0.75 -0.3358 0.75 -0.75s-0.3358 -0.75 -0.75 -0.75H9Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M2.5 10.5L12 3l9.5 7.5" />
          <path d="M4.5 9v11a1 1 0 001 1h13a1 1 0 001-1V9" />
          <path d="M10 21v-6a2 2 0 014 0v6" />
        </svg>
      );
    case "wallet":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M21.1009 8.00353c-0.0567 -0.00357 -0.1184 -0.00355 -0.1823 -0.00353l-0.016 0.00001h-2.5085c-2.0677 0 -3.8369 1.62756 -3.8369 3.74999 0 2.1224 1.7692 3.75 3.8369 3.75h2.5085l0.016 0c0.0639 0 0.1256 0.0001 0.1823 -0.0035 0.8399 -0.0531 1.5826 -0.7103 1.6451 -1.6283 0.0041 -0.0602 0.004 -0.1251 0.004 -0.1852l0 -0.0163V9.83334l0 -0.01632c0 -0.06014 0.0001 -0.12503 -0.004 -0.18522 -0.0625 -0.91799 -0.8052 -1.57523 -1.6451 -1.62827ZM18.1717 12.75c0.5323 0 0.9638 -0.4477 0.9638 -1s-0.4315 -1 -0.9638 -1 -0.9639 0.4477 -0.9639 1 0.4316 1 0.9639 1Z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M20.9179 17c0.1491 -0.0039 0.262 0.1342 0.2215 0.2778 -0.2007 0.7124 -0.5194 1.3197 -1.0306 1.831 -0.7484 0.7483 -1.6974 1.0804 -2.8698 1.2381 -1.1392 0.1531 -2.5948 0.1531 -4.4326 0.1531h-2.1128c-1.83777 0 -3.29341 0 -4.43262 -0.1531 -1.17242 -0.1577 -2.12137 -0.4898 -2.86974 -1.2381 -0.74836 -0.7484 -1.08048 -1.6974 -1.2381 -2.8698 -0.15317 -1.1392 -0.15316 -2.5948 -0.15314 -4.4326v-0.1128c-0.00002 -1.83777 -0.00003 -3.29341 0.15314 -4.43262 0.15762 -1.17242 0.48974 -2.12137 1.2381 -2.86974 0.74837 -0.74836 1.69732 -1.08048 2.86974 -1.2381C7.40019 2.99997 8.85582 2.99998 10.6936 3l2.1128 0c1.8378 -0.00002 3.2934 -0.00003 4.4326 0.15314 1.1724 0.15762 2.1214 0.48974 2.8698 1.2381 0.5112 0.51128 0.8298 1.1185 1.0306 1.83094 0.0405 0.14357 -0.0724 0.28169 -0.2215 0.27782l-2.5239 0.00001c-2.8366 0 -5.3369 2.2409 -5.3369 5.24999 0 3.0091 2.5003 5.25 5.3369 5.25l2.5239 0ZM5.75 7c-0.41421 0 -0.75 0.33579 -0.75 0.75s0.33579 0.75 0.75 0.75h4c0.4142 0 0.75 -0.33579 0.75 -0.75S10.1642 7 9.75 7h-4Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M21 7V5a2 2 0 00-2-2H5a3 3 0 00-3 3v12a3 3 0 003 3h14a2 2 0 002-2v-2" />
          <path d="M16 12h5v4h-5a2 2 0 010-4z" />
          <circle cx="18" cy="14" r="0.8" fill="currentColor" />
        </svg>
      );
    case "card":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path d="M14 4h-4C6.229 4 4.343 4 3.172 5.172c-0.844 0.843 -1.08 2.057 -1.146 4.078h19.948c-0.066 -2.021 -0.302 -3.235 -1.146 -4.078C19.657 4 17.771 4 14 4Z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M10 20h4c3.771 0 5.657 0 6.828 -1.172C22 17.657 22 15.771 22 12c0 -0.442 0 -0.858 -0.002 -1.25H2.002C2 11.142 2 11.558 2 12c0 3.771 0 5.657 1.172 6.828C4.343 20 6.229 20 10 20Zm-4.75 -4a0.75 0.75 0 0 1 0.75 -0.75h4a0.75 0.75 0 0 1 0 1.5H6a0.75 0.75 0 0 1 -0.75 -0.75Zm7.25 -0.75a0.75 0.75 0 0 0 0 1.5H14a0.75 0.75 0 0 0 0 -1.5h-1.5Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <rect x="2" y="5" width="20" height="14" rx="3" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <circle cx="6" cy="15" r="1" fill="currentColor" />
          <circle cx="9.5" cy="15" r="1" fill="currentColor" />
        </svg>
      );
    case "chart":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path d="M17.2929 2.29289C17 2.58579 17 3.05719 17 4v13c0 0.9428 0 1.4142 0.2929 1.7071C17.5858 19 18.0572 19 19 19c0.9428 0 1.4142 0 1.7071 -0.2929C21 18.4142 21 17.9428 21 17V4c0 -0.94281 0 -1.41421 -0.2929 -1.70711C20.4142 2 19.9428 2 19 2c-0.9428 0 -1.4142 0 -1.7071 0.29289Z" />
            <path d="M10 7c0 -0.94281 0 -1.41421 0.2929 -1.70711C10.5858 5 11.0572 5 12 5c0.9428 0 1.4142 0 1.7071 0.29289C14 5.58579 14 6.05719 14 7v10c0 0.9428 0 1.4142 -0.2929 1.7071C13.4142 19 12.9428 19 12 19c-0.9428 0 -1.4142 0 -1.7071 -0.2929C10 18.4142 10 17.9428 10 17V7Z" />
            <path d="M3.29289 9.29289C3 9.58579 3 10.0572 3 11v6c0 0.9428 0 1.4142 0.29289 1.7071C3.58579 19 4.05719 19 5 19c0.94281 0 1.41421 0 1.70711 -0.2929C7 18.4142 7 17.9428 7 17v-6c0 -0.9428 0 -1.41421 -0.29289 -1.70711C6.41421 9 5.94281 9 5 9c-0.94281 0 -1.41421 0 -1.70711 0.29289Z" />
            <path d="M3 21.25c-0.41421 0 -0.75 0.3358 -0.75 0.75s0.33579 0.75 0.75 0.75h18c0.4142 0 0.75 -0.3358 0.75 -0.75s-0.3358 -0.75 -0.75 -0.75H3Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M21 21H3V3" />
          <path d="M7 16l4-5 4 4 6-8" />
          <circle cx="21" cy="7" r="1" fill="currentColor" />
        </svg>
      );
    case "calendar":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path d="M7.75 2.5c0 -0.41421 -0.33579 -0.75 -0.75 -0.75s-0.75 0.33579 -0.75 0.75v1.57926c-1.43933 0.11525 -2.38423 0.39811 -3.07843 1.09231 -0.6942 0.6942 -0.97706 1.6391 -1.09231 3.07843H21.9207c-0.1152 -1.43933 -0.3981 -2.38423 -1.0923 -3.07843 -0.6942 -0.6942 -1.6391 -0.97706 -3.0784 -1.09231V2.5c0 -0.41421 -0.3358 -0.75 -0.75 -0.75s-0.75 0.33579 -0.75 0.75v1.5129C15.5847 4 14.839 4 14 4h-4c-0.83903 0 -1.58473 0 -2.25 0.0129V2.5Z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M2 12c0 -0.839 0 -1.5847 0.0129 -2.25h19.9742C22 10.4153 22 11.161 22 12v2c0 3.7712 0 5.6569 -1.1716 6.8284C19.6569 22 17.7712 22 14 22h-4c-3.77124 0 -5.65685 0 -6.82843 -1.1716C2 19.6569 2 17.7712 2 14v-2Zm15 2c0.5523 0 1 -0.4477 1 -1s-0.4477 -1 -1 -1 -1 0.4477 -1 1 0.4477 1 1 1Zm0 4c0.5523 0 1 -0.4477 1 -1s-0.4477 -1 -1 -1 -1 0.4477 -1 1 0.4477 1 1 1Zm-4 -5c0 0.5523 -0.4477 1 -1 1s-1 -0.4477 -1 -1 0.4477 -1 1 -1 1 0.4477 1 1Zm0 4c0 0.5523 -0.4477 1 -1 1s-1 -0.4477 -1 -1 0.4477 -1 1 -1 1 0.4477 1 1Zm-6 -3c0.55228 0 1 -0.4477 1 -1s-0.44772 -1 -1 -1 -1 0.4477 -1 1 0.44772 1 1 1Zm0 4c0.55228 0 1 -0.4477 1 -1s-0.44772 -1 -1 -1 -1 0.4477 -1 1 0.44772 1 1 1Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <rect x="3" y="4" width="18" height="17" rx="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <circle cx="8" cy="13" r="1" fill="currentColor" />
          <circle cx="12" cy="13" r="1" fill="currentColor" />
          <circle cx="16" cy="13" r="1" fill="currentColor" />
          <circle cx="8" cy="17" r="1" fill="currentColor" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    case "bell":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path d="M8.35179 20.2418C9.19288 21.311 10.5142 22 12 22c1.4858 0 2.8071 -0.689 3.6482 -1.7582 -2.4218 0.3282 -4.8746 0.3282 -7.29641 0Z" />
            <path d="M18.7491 9v0.7041c0 0.845 0.2412 1.6711 0.6931 2.3741l1.1074 1.723c1.0116 1.5737 0.2394 3.7127 -1.52 4.2104 -4.6023 1.3018 -9.45686 1.3018 -14.05924 0 -1.75931 -0.4977 -2.53154 -2.6367 -1.52 -4.2104l1.10744 -1.723c0.45192 -0.703 0.69307 -1.5291 0.69307 -2.3741V9c0 -3.86599 3.02169 -7 6.74913 -7 3.7274 0 6.7491 3.13401 6.7491 7Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      );
    case "chat-round-dots":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M12 21a9 9 0 10-7.8-4.5L3 21l4.8-1.2A8.96 8.96 0 0012 21z" />
          <circle cx="8" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="16" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case "shield-check":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M3.37752 5.08241C3 5.62028 3 7.21907 3 10.4167v1.5747c0 5.638 4.23896 8.3741 6.89856 9.5359C10.62 21.8424 10.9807 22 12 22s1.38 -0.1576 2.1014 -0.4727C16.761 20.3655 21 17.6294 21 11.9914v-1.5747c0 -3.19763 0 -4.79642 -0.3775 -5.33429 -0.3775 -0.53787 -1.8808 -1.05245 -4.8874 -2.08162l-0.5728 -0.19607C13.595 2.26824 12.8114 2 12 2c-0.8114 0 -1.595 0.26824 -3.16228 0.80472l-0.57281 0.19607C5.25832 4.02996 3.75503 4.54454 3.37752 5.08241ZM15.0595 10.4995c0.2758 -0.309 0.249 -0.78308 -0.06 -1.05895 -0.309 -0.27588 -0.7831 -0.24904 -1.059 0.05994l-3.0119 3.37341 -0.8691 -0.9734c-0.27592 -0.309 -0.75003 -0.3358 -1.05901 -0.06 -0.30898 0.2759 -0.33582 0.75 -0.05994 1.059l1.42855 1.6c0.1423 0.1594 0.3458 0.2505 0.5595 0.2505 0.2136 0 0.4171 -0.0911 0.5594 -0.2505l3.5715 -4Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "lock-keyhole":
    case "lock":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M6 10V7a6 6 0 1 1 12 0v3h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3h1Zm2-3a4 4 0 1 1 8 0v3H8V7Zm4 7.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <rect x="4" y="10" width="16" height="11" rx="3" />
          <path d="M7 10V7a5 5 0 0110 0v3" />
          <circle cx="12" cy="15" r="1.5" fill="currentColor" />
          <path d="M12 16.5V18" />
        </svg>
      );
    case "clock-circle":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M12 22c5.523 0 10 -4.477 10 -10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm0.75 -14a0.75 0.75 0 0 0 -1.5 0v4c0 0.199 0.079 0.39 0.22 0.53l2.5 2.5a0.75 0.75 0 1 0 1.06 -1.06l-2.28 -2.28V8Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
      );
    case "check-circle":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm3.78-12.72a.75.75 0 0 0-1.06-1.06L10.5 12.44 9.28 11.22a.75.75 0 0 0-1.06 1.06l1.75 1.75a.75.75 0 0 0 1.06 0l4.75-4.75Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8.5 12.5l2.5 2.5 5-5" />
        </svg>
      );
    case "close-circle":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm-2.72-12.72a.75.75 0 0 0-1.06 1.06L10.94 12l-2.72 2.72a.75.75 0 1 0 1.06 1.06L12 13.06l2.72 2.72a.75.75 0 0 0 1.06-1.06L13.06 12l2.72-2.72a.75.75 0 0 0-1.06-1.06L12 10.94l-2.72-2.72Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="12" cy="12" r="9" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
      );
    case "danger-triangle":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M10.29 3.86a2 2 0 0 1 3.42 0l8.47 14.14A2 2 0 0 1 20.47 21H3.53a2 2 0 0 1-1.71-3L10.29 3.86ZM12 8a.75.75 0 0 0-.75.75v4.5a.75.75 0 0 0 1.5 0v-4.5A.75.75 0 0 0 12 8Zm0 8.25a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <circle cx="12" cy="17" r="0.8" fill="currentColor" />
        </svg>
      );
    case "money-bag":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M6 10l2-5h8l2 5" />
          <path d="M12 2a2 2 0 00-2 2h4a2 2 0 00-2-2z" />
          <path d="M4 11a8 8 0 0016 0c0-1.5-.5-2.8-1-3.8H5c-.5 1-1 2.3-1 3.8z" />
          <circle cx="12" cy="14" r="2" />
        </svg>
      );
    case "receipt":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M7.24502 2H16.755c1.1589 0 1.7383 0 2.2056 0.16261 0.8862 0.30835 1.5819 1.02458 1.8814 1.93685 0.158 0.48109 0.158 1.07759 0.158 2.2706V20.3742c0 0.8582 -0.985 1.3136 -1.6081 0.7434 -0.3661 -0.335 -0.9177 -0.335 -1.2838 0l-0.4831 0.4421c-0.6416 0.5871 -1.6084 0.5871 -2.25 0s-1.6084 -0.5871 -2.25 0 -1.6084 0.5871 -2.25 0 -1.60841 -0.5871 -2.25 0c-0.64159 0.5871 -1.60841 0.5871 -2.25 0l-0.4831 -0.4421c-0.36607 -0.335 -0.91773 -0.335 -1.2838 0C3.985 21.6878 3 21.2324 3 20.3742V6.37006c0 -1.19301 0 -1.78951 0.15795 -2.2706 0.29953 -0.91227 0.99527 -1.6285 1.88144 -1.93685C5.50671 2 6.08614 2 7.24502 2ZM7 6.75c-0.41421 0 -0.75 0.33579 -0.75 0.75s0.33579 0.75 0.75 0.75h0.5c0.41421 0 0.75 -0.33579 0.75 -0.75s-0.33579 -0.75 -0.75 -0.75H7Zm3.5 0c-0.4142 0 -0.75 0.33579 -0.75 0.75s0.3358 0.75 0.75 0.75H17c0.4142 0 0.75 -0.33579 0.75 -0.75s-0.3358 -0.75 -0.75 -0.75h-6.5ZM7 10.25c-0.41421 0 -0.75 0.3358 -0.75 0.75s0.33579 0.75 0.75 0.75h0.5c0.41421 0 0.75 -0.3358 0.75 -0.75s-0.33579 -0.75 -0.75 -0.75H7Zm3.5 0c-0.4142 0 -0.75 0.3358 -0.75 0.75s0.3358 0.75 0.75 0.75H17c0.4142 0 0.75 -0.3358 0.75 -0.75s-0.3358 -0.75 -0.75 -0.75h-6.5ZM7 13.75c-0.41421 0 -0.75 0.3358 -0.75 0.75s0.33579 0.75 0.75 0.75h0.5c0.41421 0 0.75 -0.3358 0.75 -0.75s-0.33579 -0.75 -0.75 -0.75H7Zm3.5 0c-0.4142 0 -0.75 0.3358 -0.75 0.75s0.3358 0.75 0.75 0.75H17c0.4142 0 0.75 -0.3358 0.75 -0.75s-0.3358 -0.75 -0.75 -0.75h-6.5Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M4 2v20l3-1.5 3 1.5 3-1.5 3 1.5 4-2V2l-4 2-3-2-3 2-3-2-3 2z" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="12" y2="16" />
        </svg>
      );
    case "users-group-rounded":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="9" cy="7" r="4" />
          <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
          <path d="M16 3.13a4 4 0 010 7.75" />
          <path d="M21 21v-2a4 4 0 00-3-3.87" />
        </svg>
      );
    case "settings":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M14.2788 2.15224C13.9085 2 13.439 2 12.5 2s-1.4085 0 -1.7788 0.15224c-0.4938 0.20299 -0.88611 0.59234 -1.09064 1.08239 -0.09337 0.22371 -0.12991 0.48387 -0.14421 0.86336 -0.02101 0.55769 -0.30919 1.0739 -0.79618 1.35294 -0.48699 0.27903 -1.08153 0.26861 -1.57868 0.00783 -0.33831 -0.17746 -0.5836 -0.27614 -0.8255 -0.30774 -0.5299 -0.06924 -1.06581 0.07327 -1.48983 0.39618 -0.31802 0.24218 -0.55277 0.6457 -1.02226 1.45273 -0.46949 0.80704 -0.70423 1.21055 -0.75655 1.60498 -0.06977 0.52589 0.07383 1.05775 0.3992 1.47859 0.14851 0.1921 0.35722 0.3535 0.68115 0.5555 0.47621 0.297 0.78262 0.8029 0.78259 1.361 -0.00003 0.5581 -0.30643 1.0639 -0.78259 1.3608 -0.32398 0.2021 -0.53273 0.3636 -0.68125 0.5557 -0.32537 0.4208 -0.46896 0.9526 -0.3992 1.4785 0.05232 0.3944 0.28707 0.798 0.75655 1.605 0.46949 0.807 0.70424 1.2106 1.02226 1.4527 0.42402 0.3229 0.95993 0.4654 1.48983 0.3962 0.24189 -0.0316 0.48716 -0.1303 0.82544 -0.3077 0.49719 -0.2608 1.09177 -0.2712 1.57879 0.0078 0.48702 0.2791 0.77521 0.7953 0.79623 1.3531 0.0143 0.3794 0.05084 0.6396 0.14421 0.8633 0.20453 0.49 0.59684 0.8794 1.09064 1.0824C11.0915 22 11.561 22 12.5 22s1.4085 0 1.7788 -0.1522c0.4938 -0.203 0.8861 -0.5924 1.0906 -1.0824 0.0934 -0.2237 0.13 -0.4839 0.1443 -0.8634 0.021 -0.5577 0.3091 -1.0739 0.7961 -1.353 0.487 -0.2791 1.0816 -0.2686 1.5788 -0.0078 0.3383 0.1774 0.5835 0.276 0.8254 0.3076 0.5299 0.0693 1.0658 -0.0732 1.4898 -0.3961 0.3181 -0.2422 0.5528 -0.6457 1.0223 -1.4528 0.4695 -0.807 0.7042 -1.2105 0.7566 -1.6049 0.0697 -0.5259 -0.0739 -1.0578 -0.3992 -1.4786 -0.1486 -0.1921 -0.3573 -0.3536 -0.6813 -0.5556 -0.4761 -0.2969 -0.7825 -0.8028 -0.7825 -1.3609s0.3064 -1.0638 0.7825 -1.3607c0.3241 -0.2021 0.5328 -0.3635 0.6814 -0.5557 0.3253 -0.42077 0.4689 -0.95263 0.3992 -1.47853 -0.0524 -0.39442 -0.2871 -0.79794 -0.7566 -1.60497 -0.4695 -0.80703 -0.7042 -1.21055 -1.0223 -1.45273 -0.424 -0.32291 -0.9599 -0.46542 -1.4898 -0.39618 -0.2419 0.0316 -0.4872 0.13027 -0.8254 0.30771 -0.4972 0.26079 -1.0918 0.27122 -1.5788 -0.00784 -0.487 -0.27905 -0.7752 -0.7953 -0.7963 -1.35302 -0.0143 -0.37946 -0.0508 -0.63961 -0.1442 -0.86331 -0.2045 -0.49005 -0.5968 -0.8794 -1.0906 -1.08239ZM12.5 15c1.6695 0 3.0228 -1.3431 3.0228 -3S14.1695 9 12.5 9c-1.6695 0 -3.02284 1.3431 -3.02284 3S10.8305 15 12.5 15Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      );
    case "camera":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "paperclip":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      );
    case "dots-menu":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      );
    case "sparkles":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path d="M10.0802 7.89712C11.1568 5.96571 11.6952 5 12.5 5s1.3432 0.96571 2.4198 2.89712l0.2786 0.49968c0.3059 0.54884 0.4589 0.82327 0.6974 1.00434 0.2385 0.18106 0.5356 0.24828 1.1297 0.3827l0.5409 0.12238c2.0907 0.47308 3.1361 0.70958 3.3848 1.50938 0.2487 0.7997 -0.464 1.6331 -1.8893 3.2998l-0.3687 0.4312c-0.4051 0.4737 -0.6076 0.7105 -0.6987 1.0035 -0.0911 0.2929 -0.0605 0.6089 0.0008 1.2408l0.0557 0.5753c0.2155 2.2238 0.3232 3.3357 -0.3279 3.83 -0.6511 0.4943 -1.6299 0.0436 -3.5874 -0.8577l-0.5065 -0.2332c-0.5562 -0.2561 -0.8344 -0.3842 -1.1292 -0.3842 -0.2948 0 -0.573 0.1281 -1.1292 0.3842l-0.5065 0.2332c-1.95753 0.9013 -2.9363 1.352 -3.58742 0.8577 -0.65113 -0.4943 -0.54338 -1.6062 -0.32789 -3.83l0.05575 -0.5753c0.06123 -0.6319 0.09185 -0.9479 0.00074 -1.2408 -0.0911 -0.293 -0.29362 -0.5298 -0.69865 -1.0035l-0.36875 -0.4312c-1.42532 -1.6667 -2.13798 -2.5001 -1.88927 -3.2998 0.2487 -0.7998 1.29407 -1.0363 3.3848 -1.50938l0.54089 -0.12238c0.59412 -0.13442 0.89118 -0.20164 1.1297 -0.3827 0.23852 -0.18107 0.3915 -0.45549 0.69745 -1.00434l0.27855 -0.49968Z" />
            <path d="M4.86728 2.50058c0.02999 -0.10578 0.21775 -0.10642 0.24846 -0.00084 0.1402 0.48211 0.40017 1.19473 0.7933 1.58521 0.39312 0.39048 1.10748 0.64563 1.59053 0.78257 0.10578 0.02999 0.10642 0.21776 0.00084 0.24846 -0.48211 0.1402 -1.19473 0.40018 -1.58521 0.7933 -0.39048 0.39313 -0.64563 1.10748 -0.78257 1.59053 -0.02999 0.10579 -0.21776 0.10642 -0.24846 0.00084 -0.14021 -0.48211 -0.40018 -1.19473 -0.7933 -1.5852 -0.39313 -0.39048 -1.10749 -0.64564 -1.59054 -0.78258 -0.10578 -0.02999 -0.10641 -0.21776 -0.00083 -0.24846 0.48211 -0.1402 1.19472 -0.40017 1.5852 -0.7933 0.39048 -0.39313 0.64563 -1.10748 0.78258 -1.59053Z" />
            <path fillRule="evenodd" clipRule="evenodd" d="M19 3.25c0.4142 0 0.75 0.33579 0.75 0.75v0.25H20c0.4142 0 0.75 0.33579 0.75 0.75s-0.3358 0.75 -0.75 0.75h-0.25V6c0 0.41421 -0.3358 0.75 -0.75 0.75s-0.75 -0.33579 -0.75 -0.75v-0.25H18c-0.4142 0 -0.75 -0.33579 -0.75 -0.75s0.3358 -0.75 0.75 -0.75h0.25V4c0 -0.41421 0.3358 -0.75 0.75 -0.75Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z" />
          <path d="M18 16l1.2 2.8L22 20l-2.8 1.2L18 24l-1.2-2.8L14 20l2.8-1.2z" />
        </svg>
      );
    case "search":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "plus":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      );
    case "edit":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      );
    case "undo":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13" />
        </svg>
      );
    case "filter":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
      );
    case "log-out":
      if (variant === "bold") {
        return (
          <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
            <path fillRule="evenodd" clipRule="evenodd" d="M16.125 12c0 -0.4142 -0.3358 -0.75 -0.75 -0.75l-10.97256 0 1.96065 -1.68056c0.3145 -0.26956 0.35092 -0.74304 0.08135 -1.05753 -0.26956 -0.3145 -0.74304 -0.35092 -1.05753 -0.08135l-3.5 3.00004c-0.16624 0.1424 -0.26191 0.3505 -0.26191 0.5694 0 0.2189 0.09567 0.427 0.26191 0.5694l3.5 3c0.31449 0.2696 0.78797 0.2332 1.05753 -0.0813 0.26957 -0.3145 0.23315 -0.788 -0.08135 -1.0575L4.40244 12.75l10.97256 0c0.4142 0 0.75 -0.3358 0.75 -0.75Z" />
            <path d="M9.375 8c0 0.70219 0 1.05329 0.16851 1.3055 0.07297 0.10921 0.16674 0.20298 0.27595 0.27595 0.25224 0.16851 0.60334 0.16851 1.30554 0.16851l4.25 0c1.2426 0 2.25 1.00734 2.25 2.25004 0 1.2426 -1.0074 2.25 -2.25 2.25l-4.25 0c-0.7022 0 -1.0534 0 -1.3056 0.1685 -0.10917 0.073 -0.2029 0.1667 -0.27585 0.2759C9.375 14.9466 9.375 15.2977 9.375 16c0 2.8284 0 4.2426 0.8787 5.1213C11.1324 22 12.5464 22 15.3748 22l1 0c2.8284 0 4.2426 0 5.1213 -0.8787 0.8787 -0.8787 0.8787 -2.2929 0.8787 -5.1213l0 -8c0 -2.82842 0 -4.24264 -0.8787 -5.12132C20.6174 2 19.2032 2 16.3748 2l-1 0c-2.8284 0 -4.2424 0 -5.1211 0.87868C9.375 3.75736 9.375 5.17157 9.375 8Z" />
          </svg>
        );
      }
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      );
    case "user":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "trend-up":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case "trend-down":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
          <polyline points="17 18 23 18 23 12" />
        </svg>
      );
    case "info-circle":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="8.01" />
          <line x1="12" y1="11" x2="12" y2="16" />
        </svg>
      );
    case "check":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "refresh":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
      );
    case "cup":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M18 8h1a4 4 0 010 8h-1" />
          <path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z" />
          <line x1="6" y1="2" x2="6" y2="4" />
          <line x1="10" y1="2" x2="10" y2="4" />
          <line x1="14" y1="2" x2="14" y2="4" />
        </svg>
      );
    case "bag":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 01-8 0" />
        </svg>
      );
    case "car":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M5 17h14v-5l-2-4H7l-2 4v5z" />
          <circle cx="7.5" cy="17.5" r="2.5" />
          <circle cx="16.5" cy="17.5" r="2.5" />
          <line x1="9" y1="10" x2="15" y2="10" />
        </svg>
      );
    case "heart":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
      );
    case "plane":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3.5c-.5-.5-2.5 0-4 1.5L13.5 8.5 5.3 6.7 4 8l6 4-3 3-2.5-.5L3 16l3.5 1.5L8 21l1.5-1.5-.5-2.5 3-3 4 6 1.8-1.8z" />
        </svg>
      );
    case "paper-plane":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" fill="currentColor" fillOpacity="0.12" />
        </svg>
      );
    case "image":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "tv":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <rect x="2" y="7" width="20" height="15" rx="2" />
          <polyline points="17 2 12 7 7 2" />
        </svg>
      );
    case "book":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      );
    case "bolt":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "trash":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      );
    case "layers":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      );
    case "microphone":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" />
          <path d="M19 10v2a7 7 0 01-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      );
    case "microphone-slash":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M18.89 13.23A7.12 7.12 0 0019 12v-2" />
          <path d="M5 10v2a7 7 0 0012 5" />
          <path d="M15 9.34V5a3 3 0 00-5.68-1.33" />
          <path d="M9 9v3a3 3 0 005.12 2.12" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="8" y1="22" x2="16" y2="22" />
        </svg>
      );
    case "volume-loud":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
        </svg>
      );
    case "volume-cross":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      );
    case "soundwave":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M2 10v4" />
          <path d="M6 6v12" />
          <path d="M10 3v18" />
          <path d="M14 8v8" />
          <path d="M18 5v14" />
          <path d="M22 10v4" />
        </svg>
      );
    case "phone-hangup":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M16 10c.83 0 1.5-.67 1.5-1.5 0-3.31-2.69-6-6-6s-6 2.69-6 6c0 .83.67 1.5 1.5 1.5h1.2c.4 0 .76-.23.92-.6l.72-1.68c.17-.4.07-.86-.24-1.16l-.8-.8c.7-.72 1.6-1.16 2.7-1.16s2 .44 2.7 1.16l-.8.8c-.31.3-.41.76-.24 1.16l.72 1.68c.16.37.52.6.92.6H16z" />
          <line x1="3" y1="21" x2="21" y2="21" />
        </svg>
      );
    case "eye":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "eye-closed":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.3 17.3 0 0 1-2.9 3.6" />
          <path d="M6.4 7.3C3.8 9 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      );
    default:
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} {...props}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
  }
}
