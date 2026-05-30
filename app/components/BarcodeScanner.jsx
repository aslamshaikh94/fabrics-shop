'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function BarcodeScanner({ onScan, onClose }) {
  const instanceRef = useRef(null);
  const onScanRef = useRef(onScan);
  const elementId = useRef('qr-' + Math.random().toString(36).slice(2));
  onScanRef.current = onScan;

  useEffect(() => {
    const id = elementId.current;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      const scanner = new Html5Qrcode(id);
      instanceRef.current = scanner;
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 120 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          onScanRef.current(decodedText);
        },
        () => {}
      ).catch((err) => console.error('Scanner error:', err));
    });
    return () => {
      instanceRef.current?.stop().catch(() => {});
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
        <div id={elementId.current} style={{ minHeight: '200px' }} className="w-full rounded-lg" />
        <p className="text-xs text-gray-500 text-center mt-3">Point camera at the barcode on the fabric roll</p>
      </div>
    </div>
  );
}
