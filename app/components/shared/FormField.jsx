"use client";
import { memo } from "react";

/**
 * Reusable form field component used across all CRUD forms.
 * Supports input, select, textarea, and custom children rendering.
 */
const FormField = memo(function FormField({
  field,
  label,
  type = "text",
  required = false,
  placeholder = "",
  disabled = false,
  children,
  value,
  error,
  onChange,
  onBlur,
  className = "",
}) {
  const cls = `input ${error ? "border-error-400" : ""} ${className}`;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children || (
        <input
          type={type}
          step={type === "number" ? "0.01" : undefined}
          required={required}
          disabled={disabled}
          value={value ?? ""}
          onChange={(e) => onChange?.(field, e.target.value)}
          onBlur={onBlur}
          className={cls}
          placeholder={placeholder}
          onWheel={(e) => e.target.blur()}
        />
      )}
      {error && <p className="text-error-600 text-sm mt-1">{error}</p>}
    </div>
  );
});

/**
 * Wrapper for form modal submit/cancel buttons
 */
function FormActions({
  onCancel,
  isSubmitting,
  submitLabel = "Save",
  cancelLabel = "Cancel",
}) {
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="btn btn-secondary flex-1"
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={isSubmitting}
        className="btn btn-primary flex-1"
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 inline"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Saving...
          </>
        ) : (
          submitLabel
        )}
      </button>
    </div>
  );
}

/**
 * Reusable file upload field for invoices/receipts
 */
function FileUploadField({
  file,
  onFileChange,
  error,
  onErrorClear,
  existingUrl,
  label = "Attach file",
  accept = "image/*,.pdf",
  maxSize = 10 * 1024 * 1024,
  bucket = "",
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <label
        className={`flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-3 hover:border-primary-400 hover:bg-primary-50 transition-colors ${error ? "border-error-400 bg-error-50" : "border-gray-300"}`}
      >
        <svg
          className="w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
        <span className="text-sm text-gray-500 flex-1 truncate">
          {file
            ? file.name
            : existingUrl
              ? "Replace existing file"
              : "Upload file (PDF, image)"}
        </span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            onFileChange?.(e.target.files[0] || null);
            if (e.target.files[0] && onErrorClear) onErrorClear();
          }}
        />
      </label>
      {error && <p className="text-error-600 text-sm mt-1">{error}</p>}
      {existingUrl && !file && (
        <a
          href={existingUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary-600 hover:underline mt-1 flex items-center gap-1"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          View current file
        </a>
      )}
    </div>
  );
}

/**
 * Search input with search icon
 */
function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className = "",
}) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <svg
        className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pl-10"
      />
    </div>
  );
}

export { FormActions, FileUploadField, SearchInput };
export default FormField;
