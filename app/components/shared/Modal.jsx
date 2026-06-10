"use client";

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start justify-center z-50 overflow-y-auto p-2 sm:p-4">
      <div
        className={`bg-white dark:bg-gray-800 rounded-2xl w-full ${maxWidth} p-4 sm:p-6 m-4 sm:my-8 border border-gray-200 dark:border-gray-700 animate-modal-in shadow-xl`}
      >
        {title && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto scrollbar-thin">
          {children}
        </div>
      </div>
    </div>
  );
}
