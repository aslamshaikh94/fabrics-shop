"use client";
import { X } from "lucide-react";

export default function ImageViewer({ url, onClose, title = "View" }) {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex items-center justify-center bg-gray-50 dark:bg-gray-900 max-h-[calc(90vh-60px)] overflow-y-auto">
          {url.match(/\.(pdf)$/i) ? (
            <iframe
              src={url}
              className="w-full h-[70vh] rounded-lg"
              title={title}
            />
          ) : (
            <img
              src={url}
              alt={title}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          )}
        </div>
      </div>
    </div>
  );
}
