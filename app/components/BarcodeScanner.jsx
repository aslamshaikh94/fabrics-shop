'use client';
import { useEffect, useRef, useState } from 'react';
import { X, ScanLine } from 'lucide-react';

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function start() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/library');
        if (stopped) return;

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        setScanning(true);

        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result, err) => {
            if (result && !stopped) {
              stopped = true;
              reader.reset();
              onScanRef.current(result.getText());
            }
          }
        );
      } catch (err) {
        if (stopped) return;
        if (err?.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access and try again.');
        } else {
          setError('Could not start camera: ' + (err?.message || err));
        }
      }
    }

    start();

    return () => {
      stopped = true;
      readerRef.current?.reset();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl w-full max-w-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-900">Scan Barcode</p>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 text-center">
            {error}
          </div>
        ) : (
          <div className="relative rounded-lg overflow-hidden bg-black" style={{ minHeight: '220px' }}>
            <video
              ref={videoRef}
              muted
              playsInline
              className="w-full object-cover"
              style={{ minHeight: '220px' }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-primary-400 rounded-lg w-56 h-24 relative">
                <ScanLine className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 text-primary-400 animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 text-center mt-3">
          {scanning ? 'Point camera at the barcode on the fabric roll' : 'Starting camera...'}
        </p>
      </div>
    </div>
  );
}
