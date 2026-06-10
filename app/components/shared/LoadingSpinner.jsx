"use client";

export default function LoadingSpinner({ size = "md", className = "" }) {
  const sizes = {
    sm: "h-5 w-5 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-3",
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`animate-spin rounded-full ${sizes[size] || sizes.md} border-primary-200 border-t-primary-600`}
      />
    </div>
  );
}
