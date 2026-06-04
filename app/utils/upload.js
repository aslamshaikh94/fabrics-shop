/**
 * File upload validation utilities
 */

const ALLOWED_TYPES = {
  images: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  documents: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  spreadsheets: [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

const DEFAULT_LIMITS = {
  images: 5 * 1024 * 1024, // 5MB
  documents: 10 * 1024 * 1024, // 10MB
  spreadsheets: 10 * 1024 * 1024, // 10MB
  default: 10 * 1024 * 1024, // 10MB
};

export function validateFile(file, options = {}) {
  const errors = [];

  if (!file) {
    errors.push("No file provided");
    return { valid: false, errors };
  }

  const {
    maxSize = DEFAULT_LIMITS.default,
    allowedTypes = [],
    allowedExtensions = [],
  } = options;

  // Check file size
  if (file.size > maxSize) {
    errors.push(
      `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`,
    );
  }

  // Check file type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(
      `File type not allowed. Allowed types: ${allowedTypes.join(", ")}`,
    );
  }

  // Check file extension
  if (allowedExtensions.length > 0) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      errors.push(
        `File extension not allowed. Allowed: ${allowedExtensions.join(", ")}`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateInvoiceFile(file) {
  return validateFile(file, {
    maxSize: DEFAULT_LIMITS.documents,
    allowedTypes: [...ALLOWED_TYPES.images, ...ALLOWED_TYPES.documents],
    allowedExtensions: ["pdf", "jpg", "jpeg", "png", "doc", "docx"],
  });
}

export function validateImageFile(file) {
  return validateFile(file, {
    maxSize: DEFAULT_LIMITS.images,
    allowedTypes: ALLOWED_TYPES.images,
    allowedExtensions: ["jpg", "jpeg", "png", "gif", "webp"],
  });
}

export function getFileExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

export function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
