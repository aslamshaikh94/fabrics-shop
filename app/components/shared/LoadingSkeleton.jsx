"use client";

export function TableSkeleton({ rows = 6, cols = 6 }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 w-20 animate-shimmer rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: cols }).map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div
                      className={`h-4 animate-shimmer rounded ${j === 0 ? "w-28" : j === cols - 1 ? "w-24" : "w-16"}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="h-3 w-20 animate-shimmer rounded mb-3" />
          <div className="h-7 w-24 animate-shimmer rounded mb-2" />
          <div className="h-3 w-16 animate-shimmer rounded" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 animate-shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-shimmer rounded" />
            <div className="h-3 w-20 animate-shimmer rounded" />
          </div>
          <div className="h-4 w-16 animate-shimmer rounded" />
        </div>
      ))}
    </div>
  );
}
