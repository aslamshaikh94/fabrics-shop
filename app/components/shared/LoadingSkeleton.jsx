"use client";
import { memo } from "react";

const SkeletonBar = memo(function SkeletonBar({
  width = "100%",
  height = "1rem",
  className = "",
}) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      style={{ width, height }}
    />
  );
});

const LoadingSkeleton = memo(function LoadingSkeleton({
  type = "table",
  rows = 5,
}) {
  if (type === "card") {
    return (
      <div className="space-y-3 p-4">
        <SkeletonBar width="60%" height="1.25rem" />
        <SkeletonBar width="40%" height="2rem" />
        <SkeletonBar width="80%" height="0.75rem" />
      </div>
    );
  }

  if (type === "stats") {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-hover p-4 space-y-3">
            <SkeletonBar width="50%" height="0.75rem" />
            <SkeletonBar width="70%" height="1.5rem" />
            <SkeletonBar width="40%" height="0.625rem" />
          </div>
        ))}
      </div>
    );
  }

  // Default: table skeleton
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3">
          <SkeletonBar
            width="2rem"
            height="2rem"
            className="rounded-full shrink-0"
          />
          <div className="flex-1 space-y-2">
            <SkeletonBar width="40%" height="0.875rem" />
            <SkeletonBar width="60%" height="0.75rem" />
          </div>
          <SkeletonBar width="5rem" height="0.875rem" />
        </div>
      ))}
    </div>
  );
});

export { LoadingSkeleton, SkeletonBar };
export default LoadingSkeleton;
