import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true,
});

const bucket = process.env.S3_BUCKET || "dubbl";

// Upload hardening: MIME allowlist + max size enforced at presign time. The
// presigned PUT also signs ContentLength (see getUploadUrl), so the actual
// uploaded body must match the declared size or the storage provider rejects it.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_UPLOAD_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/msword",
];

export function validateUpload(contentType: string, fileSize: number): string | null {
  if (fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) return "File size exceeds the maximum";
  if (!ALLOWED_UPLOAD_MIME.includes(contentType)) return "File type not allowed";
  return null;
}

// Content types that browsers render as active content (script-bearing HTML/SVG).
// These are always served as downloads, never inline.
const ACTIVE_CONTENT_TYPES = ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "application/xml"];

function isSafeInlineType(contentType: string): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  if (ACTIVE_CONTENT_TYPES.includes(mime)) return false;
  return mime.startsWith("image/") || mime === "application/pdf";
}

export async function getUploadUrl(key: string, contentType: string, contentLength?: number) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/**
 * True when an object key lives inside one of the organisation's own prefixes.
 * Object keys are assembled in three shapes across the codebase —
 * `documents/<orgId>/...`, `<orgId>/<id>/...` (attachments) and
 * `backups/<orgId>/...` — and a key that fits none of them belongs to another
 * organisation or to no one. Checked before signing any read or delete: the
 * caller can otherwise name any object in the bucket.
 */
export function isOrgOwnedKey(key: string, organizationId: string): boolean {
  if (!key || key.includes("..")) return false;
  return (
    key.startsWith(`documents/${organizationId}/`) ||
    key.startsWith(`${organizationId}/`) ||
    key.startsWith(`backups/${organizationId}/`)
  );
}

export async function getDownloadUrl(key: string, expiresIn = 300, opts?: { contentType?: string | null }) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    // Force download for content browsers execute (HTML/SVG); images and PDFs
    // stay inline so the app's preview panes keep working.
    ...(opts?.contentType && !isSafeInlineType(opts.contentType)
      ? { ResponseContentDisposition: "attachment" }
      : {}),
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteObject(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  return s3.send(command);
}
