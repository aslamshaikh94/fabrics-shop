"use client";
import { AlertCircle } from "lucide-react";

export default function Error({ error, reset }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-error-100 p-4 rounded-full">
              <AlertCircle className="w-8 h-8 text-error-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Something went wrong
          </h1>

          <p className="text-gray-600 mb-6">
            {error?.message ||
              "An unexpected error occurred. Please try again."}
          </p>

          <details className="mb-6 text-left bg-gray-50 p-4 rounded-lg">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
              Error details
            </summary>
            <pre className="text-xs text-gray-600 overflow-auto max-h-48 p-2 bg-white rounded border border-gray-200">
              {error?.stack || error?.message || "No details available"}
            </pre>
          </details>

          <div className="flex gap-3">
            <button
              onClick={() => reset()}
              className="flex-1 bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Go Home
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4">
            If the problem persists, please contact support.
          </p>
        </div>
      </div>
    </div>
  );
}
