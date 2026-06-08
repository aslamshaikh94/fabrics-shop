'use client';
import { TriangleAlert as AlertTriangle, X } from 'lucide-react';

export default function ConfirmModal({ message, onConfirm, onCancel, confirmLabel = 'Delete', danger = true }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm p-6 shadow-xl border border-gray-100 dark:border-gray-700">
        <div className="flex items-start gap-4">
          <div className={`p-2.5 rounded-xl ${danger ? 'bg-red-50 dark:bg-red-900/30' : 'bg-warning-50 dark:bg-warning-900/30'}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-warning-500'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Are you sure?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{message}</p>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="btn btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
