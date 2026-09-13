"use client";
import { memo } from "react";

const LoadingSpinner = memo(function LoadingSpinner({ size = "md", text }) {
  const sizeClasses = {
    sm: "h-5 w-5 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-3",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <div
        className={`animate-spin rounded-full ${sizeClasses[size] || sizeClasses.md} border-gray-200 border-t-primary-600`}
      />
      {text && <p className="text-sm text-gray-500">{text}</p>}
    </div>
  );
});

export default LoadingSpinner;
