'use client';
import { useEffect, useRef, useState } from 'react';
import { X, ScanLine } from 'lucide-react';

export default function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let stopped = false;

    async function start() {
      try {
        // Check BarcodeDetector support
        if (!('BarcodeDetector' in window)) {
          setError('Your browser does not support barcode scanning. Please use Chrome on Android or Safari 17+ on iOS.');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });

        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'data_matrix'],
        });

        setScanning(true);

        async function detect() {
          if (stopped || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              stopped = true;
              stopStream();
              onScanRef.current(barcodes[0].rawValue);
              return;
            }
          } catch (_) {}
          rafRef.current = requestAnimationFrame(detect);
        }

        rafRef.current = requestAnimationFrame(detect);
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please allow camera access and try again.');
        } else {
          setError('Could not access camera: ' + err.message);
        }
      }
    }

    function stopStream() {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
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
              className="w-full h-full object-cover"
              style={{ minHeight: '220px' }}
            />
            {/* Scanning overlay */}
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
