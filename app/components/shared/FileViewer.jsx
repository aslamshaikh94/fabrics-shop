"use client";
import { memo, useState, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCw, ExternalLink, FileText } from "lucide-react";

/**
 * View an uploaded document in a popup: images (zoom/rotate) and PDFs
 * (embedded), with an "open in new tab" escape hatch for anything the browser
 * can't render inline (doc/docx, unknown types).
 *
 * Replaces ImageViewer, which only ever rendered <img> and so silently failed
 * on the PDF invoices that both the Purchases and Expenses forms accept
 * (accept="image/*,.pdf").
 *
 * Accepts either `src` (legacy) or `url`.
 */
const FileViewer = memo(function FileViewer({
  src,
  url,
  alt = "Document",
  title,
  onClose,
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const fileUrl = src || url;

  const isPdf = /\.pdf($|[?#])/i.test(fileUrl || "");
  const isImage =
    /\.(jpe?g|png|gif|webp|avif|bmp|svg)($|[?#])/i.test(fileUrl || "") ||
    // Signed/public URLs sometimes have no extension; treat those as images so
    // we attempt a render rather than refusing outright.
    (!isPdf && !/\.(docx?|xlsx?)$/i.test(fileUrl || ""));

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(z + 0.25, 3)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(z - 0.25, 0.5)),
    [],
  );
  const handleRotate = useCallback(() => setRotation((r) => r + 90), []);

  // Reset the transform whenever a different document is opened.
  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [fileUrl]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") onClose?.();
    },
    [onClose],
  );

  useEffect(() => {
    if (!fileUrl) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [fileUrl, handleKeyDown]);

  if (!fileUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div
        className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <span className="text-white text-sm font-medium truncate">{title}</span>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {isImage && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white text-sm font-medium min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                title="Rotate"
              >
                <RotateCw className="w-5 h-5" />
              </button>
            </>
          )}
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Open in new tab"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        className="w-full h-full flex items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {isImage ? (
          <img
            src={fileUrl}
            alt={alt}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          />
        ) : isPdf ? (
          <iframe
            src={fileUrl}
            title={title || alt}
            className="w-full h-full bg-white rounded-lg"
          />
        ) : (
          // doc/docx and anything else: browsers can't render these inline.
          <div className="text-center text-white">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-60" />
            <p className="text-sm font-medium mb-1">
              This file type can&apos;t be previewed here
            </p>
            <p className="text-xs opacity-70 mb-4">
              Use “Open in new tab” to view or download it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default FileViewer;
