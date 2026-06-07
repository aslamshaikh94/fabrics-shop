"use client";
import { Paperclip, FileText } from "lucide-react";

export default function FileUpload({
  label,
  file,
  onFileChange,
  existingUrl,
  accept = "image/*,.pdf",
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
      </label>
      <label className="flex items-center gap-2 cursor-pointer border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-3 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors group bg-white dark:bg-gray-800">
        <Paperclip className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-500 dark:text-gray-400 flex-1 truncate">
          {file
            ? file.name
            : existingUrl
              ? "Replace current file"
              : `Attach ${label}`}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onFileChange(e.target.files[0] || null)}
        />
      </label>
      {existingUrl && !file && (
        <a
          href={existingUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-primary-600 hover:underline flex items-center gap-1 mt-1"
        >
          <FileText className="w-3 h-3" /> View current {label.toLowerCase()}
        </a>
      )}
    </div>
  );
}
