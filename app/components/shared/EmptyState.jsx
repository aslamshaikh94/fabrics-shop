"use client";
import { memo } from "react";

const EmptyState = memo(function EmptyState({
  icon: Icon,
  title = "No data found",
  description = "",
  action,
  searchTerm,
}) {
  return (
    <div className="text-center py-16">
      {Icon && <Icon className="w-10 h-10 text-gray-200 mx-auto mb-3" />}
      <p className="text-gray-400 font-medium">
        {searchTerm ? `No results match your search` : title}
      </p>
      {description && (
        <p className="text-gray-300 text-sm mt-1">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
});

export default EmptyState;
