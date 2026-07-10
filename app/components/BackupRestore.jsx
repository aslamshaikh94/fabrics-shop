"use client";
import { useState } from "react";
import {
  Download,
  Upload,
  Database,
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
  X,
  FileJson,
} from "lucide-react";
import {
  exportBackup,
  downloadBackup,
  restoreBackup,
  validateBackup,
  parseBackupFile,
  estimateBackupSize,
  getBackupScheduleInfo,
} from "../utils/backup";
import { useToast } from "./Toast";
import Modal from "./shared/Modal";

export default function BackupRestore() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [backupFile, setBackupFile] = useState(null);
  const [backupPreview, setBackupPreview] = useState(null);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [clearExisting, setClearExisting] = useState(false);

  const scheduleInfo = getBackupScheduleInfo();

  async function handleExport() {
    setExporting(true);
    try {
      const backup = await exportBackup();
      downloadBackup(backup);
      toast(
        `Backup downloaded successfully (${estimateBackupSize(backup.stats)})`,
      );
    } catch (error) {
      toast("Failed to create backup", "error");
      console.error(error);
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast("Please select a JSON backup file", "error");
      return;
    }

    try {
      const backup = await parseBackupFile(file);
      const validation = validateBackup(backup);

      if (!validation.valid) {
        toast(`Invalid backup file: ${validation.errors.join(", ")}`, "error");
        return;
      }

      setBackupFile(file);
      setBackupPreview(backup);
      toast("Backup file loaded successfully");
    } catch (error) {
      toast("Failed to parse backup file", "error");
      console.error(error);
    }
  }

  async function handleRestore() {
    if (!backupPreview) return;

    setRestoring(true);
    setRestoreProgress({ step: 0, total: 10, action: "Starting restore..." });

    try {
      await restoreBackup(backupPreview, {
        clearExisting,
        onProgress: (progress) => {
          setRestoreProgress(progress);
        },
      });

      toast("Data restored successfully!");
      setShowRestoreConfirm(false);
      setBackupFile(null);
      setBackupPreview(null);
      setClearExisting(false);

      // Reload page to refresh data
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      toast(`Restore failed: ${error.message}`, "error");
      console.error(error);
    } finally {
      setRestoring(false);
      setRestoreProgress(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backup & Restore</h1>
        <p className="text-gray-500 mt-1">
          Export and restore your business data
        </p>
      </div>

      {/* Info Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-2">
              Backup Best Practices
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Create backups {scheduleInfo.recommended.toLowerCase()}</li>
              <li>• Store backups in multiple locations (local + cloud)</li>
              <li>• Test restore process periodically</li>
              <li>• Keep at least {scheduleInfo.retention.toLowerCase()}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Export Section */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-3 rounded-xl">
              <Download className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Export Backup
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Download all your data as a JSON file
              </p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn btn-primary"
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Create Backup
              </>
            )}
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Backup includes:</span>
            <span className="font-medium">All tables and data</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Format:</span>
            <span className="font-medium">JSON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">File name:</span>
            <span className="font-medium text-xs">
              fabrics-shop-backup-{new Date().toISOString().split("T")[0]}.json
            </span>
          </div>
        </div>
      </div>

      {/* Restore Section */}
      <div className="card p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="bg-orange-100 p-3 rounded-xl">
            <Upload className="w-6 h-6 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Restore from Backup
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Upload a backup file to restore your data
            </p>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-1">
                Important Warning
              </h3>
              <p className="text-sm text-red-800">
                Restoring will add backup data to your database. If "Clear
                existing data" is enabled, all current data will be permanently
                deleted first. Create a backup before proceeding!
              </p>
            </div>
          </div>
        </div>

        {/* File Upload */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Backup File
          </label>
          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              id="backup-file-input"
              disabled={restoring}
            />
            <label
              htmlFor="backup-file-input"
              className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                backupFile
                  ? "border-green-300 bg-green-50"
                  : "border-gray-300 hover:border-gray-400 bg-gray-50"
              } ${restoring ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <FileJson
                className={`w-5 h-5 ${backupFile ? "text-green-600" : "text-gray-400"}`}
              />
              <span
                className={`text-sm ${backupFile ? "text-green-700 font-medium" : "text-gray-600"}`}
              >
                {backupFile
                  ? backupFile.name
                  : "Click to select backup file (.json)"}
              </span>
            </label>
          </div>
        </div>

        {/* Backup Preview */}
        {backupPreview && (
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Backup Details</h3>
              <span className="text-xs text-gray-500">
                {new Date(backupPreview.metadata.timestamp).toLocaleString(
                  "en-IN",
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              {Object.entries(backupPreview.stats).map(([table, count]) => (
                <div key={table} className="bg-white rounded-lg p-2">
                  <p className="text-xs text-gray-500 capitalize mb-0.5">
                    {table.replace(/_/g, " ")}
                  </p>
                  <p className="font-semibold text-gray-900">{count}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between text-xs">
              <span className="text-gray-600">
                Estimated size: {estimateBackupSize(backupPreview.stats)}
              </span>
              <span className="text-gray-600">
                Version: {backupPreview.metadata.version}
              </span>
            </div>
          </div>
        )}

        {/* Clear Data Option */}
        {backupPreview && (
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={clearExisting}
                onChange={(e) => setClearExisting(e.target.checked)}
                disabled={restoring}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Clear existing data before restore (DANGEROUS)
              </span>
            </label>
            {clearExisting && (
              <p className="text-xs text-red-600 mt-1 ml-6">
                ⚠️ All current data will be permanently deleted!
              </p>
            )}
          </div>
        )}

        {/* Restore Button */}
        <button
          onClick={() => setShowRestoreConfirm(true)}
          disabled={!backupPreview || restoring}
          className="btn btn-warning w-full"
        >
          {restoring ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
              Restoring...
            </>
          ) : (
            <>
              <Database className="w-4 h-4 mr-2" />
              Restore Data
            </>
          )}
        </button>
      </div>

      {/* Restore Progress Modal */}
      {restoreProgress && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Restoring Data...
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{restoreProgress.action}</span>
                <span className="font-medium">
                  {restoreProgress.step}/{restoreProgress.total}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(restoreProgress.step / restoreProgress.total) * 100}%`,
                  }}
                />
              </div>
              {restoreProgress.done && (
                <div className="flex items-center gap-2 text-green-600 text-sm mt-4">
                  <CheckCircle className="w-5 h-5" />
                  <span>Restore completed! Reloading page...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Restore Modal */}
      <Modal
        isOpen={showRestoreConfirm}
        onClose={() => setShowRestoreConfirm(false)}
        title="Confirm Restore"
      >
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-orange-900 mb-2">
                  {clearExisting
                    ? "This will DELETE all existing data!"
                    : "This will ADD backup data to your database"}
                </h4>
                <p className="text-sm text-orange-800">
                  {clearExisting
                    ? "All current data will be permanently deleted and replaced with the backup. This action cannot be undone!"
                    : "Backup data will be added to your existing data. Duplicate entries may occur if IDs match."}
                </p>
              </div>
            </div>
          </div>

          {backupPreview && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600 mb-2">
                Data to restore from:
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {backupPreview.metadata.date} backup
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {Object.values(backupPreview.stats).reduce((a, b) => a + b, 0)}{" "}
                total records
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowRestoreConfirm(false)}
              className="btn btn-secondary flex-1"
              disabled={restoring}
            >
              Cancel
            </button>
            <button
              onClick={handleRestore}
              disabled={restoring}
              className={`btn flex-1 ${clearExisting ? "bg-red-600 hover:bg-red-700 text-white" : "btn-warning"}`}
            >
              {restoring ? "Restoring..." : "Confirm Restore"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
