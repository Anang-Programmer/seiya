"use client";

import React, { useRef, useEffect } from "react";

interface SeiyaVideoAvatarProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  size?: number; // square size in px
}

/**
 * SeiyaVideoAvatar renders the mascot video `curiousseiya.mp4` with:
 * - Native HTML5 looping (transition mix deactivated).
 * - A feathered elliptical radial mask that seamlessly dissolves the video's
 *   warm-offwhite background into the page background with zero visible borders.
 */
export function SeiyaVideoAvatar({
  className = "",
  width,
  height,
  size = 210,
}: SeiyaVideoAvatarProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play().catch(() => {});
    }
  }, []);

  // Determine square size
  const finalSize = size ?? (typeof width === "number" ? width : 210);

  return (
    <div
      style={{
        width: finalSize,
        height: finalSize,
        maskImage:
          "radial-gradient(ellipse 49% 45% at 50% 53%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 49% 45% at 50% 53%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
      }}
      className={`relative overflow-hidden shrink-0 select-none ${className}`}
    >
      <video
        ref={videoRef}
        src="/videos/curiousseiya_clean.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="w-full h-full object-contain pointer-events-none"
      />
    </div>
  );
}
