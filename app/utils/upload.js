/**
 * File upload validation + Supabase Storage upload helpers.
 */
import { supabase } from "../lib/supabase";

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

/**
 * Upload a file to a Supabase Storage bucket, classifying any failure.
 *
 * Five call sites (purchase invoices, sale invoices on create + edit, expense
 * proofs, and the generic useCrud uploader) each had their own copy of this
 * try/catch, and they had drifted — one of them reported a permissions problem
 * as "run migration 043", which sends you down the wrong path.
 *
 * @returns {Promise<{url: string|null, infraMessage: string|null}>}
 *   - `url`          the public URL on success, else null
 *   - `infraMessage` set when the failure is a bucket/policy problem the user
 *                   must fix; null when the upload succeeded. The caller
 *                   decides whether an infra failure should abort the save
 *                   (useCrud) or only be toasted (invoice/proof uploads).
 */
export async function uploadToBucket(bucket, file, path, { upsert = true } = {}) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert });

  if (error) {
    // Return the raw error too: callers that abort need something to throw
    // with a real `cause`, and log output stays debuggable.
    return {
      url: null,
      error,
      infraMessage: describeStorageFailure(error, bucket),
    };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(path);

  return { url: publicUrl, error: null, infraMessage: null };
}

/**
 * Build a timestamped, extension-suffixed object key.
 *
 * @param prefix folder to place the file in (e.g. "sales-invoices"). Pass an
 *   empty string to upload at the bucket root.
 */
export function buildUploadPath(prefix, file) {
  const ext = String(file?.name || "").split(".").pop()?.toLowerCase() || "bin";
  const name = `${Date.now()}.${ext}`;
  return prefix ? `${prefix}/${name}` : name;
}


/**
 * Detect a Supabase Storage failure caused by the target bucket not existing
 * (migration 043 not applied in this project).
 *
 * Kept deliberately narrow: it matches ONLY the explicit bucket-missing
 * messages. An RLS violation must NOT be treated as a missing bucket — a real
 * permission regression (revoked policy, expired session, wrong role) is a
 * different problem with a different fix, and silently reclassifying it here
 * would point the user at the wrong migration. See isStorageRlsError for that
 * case.
 */
export function isMissingBucketError(err) {
  const msg = (err?.message || "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("bucket not found") ||
    msg.includes("bucket not exist") ||
    msg.includes("bucketnotfound")
  );
}

/**
 * Detect a genuine Storage RLS denial (bucket exists, but the policies reject
 * this write). Surfaces on projects where migration 043 created the buckets but
 * the policies are missing/wrong.
 *
 * Distinct from isMissingBucketError: this one means "check the storage
 * policies", not "run migration 043".
 */
export function isStorageRlsError(err) {
  const msg = (err?.message || "").toLowerCase();
  return msg.includes("row-level security") || msg.includes("row level security");
}

/** True when the upload failed for infrastructure reasons, not user error. */
export function isStorageInfraError(err) {
  return isMissingBucketError(err) || isStorageRlsError(err);
}

/** Human-readable message for a missing storage bucket. */
export function missingBucketMessage(bucket) {
  return `Storage bucket '${bucket}' does not exist in Supabase — run migration 043 to create it.`;
}

/** Human-readable message for a storage permission failure. */
export function storageRlsMessage(bucket) {
  return `Upload to '${bucket}' was blocked by Supabase storage policies — check the policies in migration 043.`;
}

/**
 * Message for a storage failure, distinguishing the two infra causes so the
 * user is pointed at the right fix.
 *
 * @returns {string|null} the message, or null if this isn't an infra failure
 *   (i.e. a genuine user/upload error that should abort the save).
 */
export function describeStorageFailure(err, bucket) {
  if (isMissingBucketError(err)) return missingBucketMessage(bucket);
  if (isStorageRlsError(err)) return storageRlsMessage(bucket);
  return null;
}

export function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
