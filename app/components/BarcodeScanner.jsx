'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    let scanner;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      scanner = new Html5Qrcode('qr-reader');
      instanceRef.current = scanner;
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          scanner.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {}
      ).catch(() => {});
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
        <div id="qr-reader" ref={scannerRef} className="w-full rounded-lg overflow-hidden" />
        <p className="text-xs text-gray-500 text-center mt-3">Point camera at the barcode on the fabric roll</p>
      </div>
    </div>
  );
}
