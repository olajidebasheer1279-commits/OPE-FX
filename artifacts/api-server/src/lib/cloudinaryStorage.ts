/**
 * Cloudinary storage backend — portable alternative to Replit Object Storage.
 *
 * Activated when CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET
 * are all set. Uses only Node's built-in `crypto` module (no SDK required).
 *
 * Upload flow:
 *  1. API server generates a signed param set (timestamp + signature).
 *  2. Browser POSTs FormData directly to Cloudinary's upload endpoint.
 *  3. Cloudinary returns { secure_url } which the browser stores in the DB.
 *  4. Images served directly from Cloudinary CDN — no server proxy needed.
 */

import crypto from 'crypto';

export interface CloudinaryUploadParams {
  uploadType: 'cloudinary';
  /** Cloudinary REST upload endpoint for the configured cloud. */
  uploadURL: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Returns true when all three Cloudinary env vars are present.
 * Used to select the upload backend at runtime.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  );
}

/**
 * Generates a signed upload parameter set for a direct-from-browser upload.
 * The client must POST these as FormData fields alongside the file.
 */
export function getCloudinaryUploadParams(
  folder = 'ope-fx-trades',
): CloudinaryUploadParams {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!;
  const apiKey = process.env.CLOUDINARY_API_KEY!;
  const apiSecret = process.env.CLOUDINARY_API_SECRET!;

  const timestamp = Math.round(Date.now() / 1000);

  // Signature: SHA-1 of alphabetically sorted "key=value" pairs + api_secret.
  // Parameters excluded from signing: file, resource_type, type, api_key.
  const paramsToSign: Record<string, string | number> = { folder, timestamp };
  const paramString = Object.keys(paramsToSign)
    .sort()
    .map((k) => `${k}=${paramsToSign[k]}`)
    .join('&');

  const signature = crypto
    .createHash('sha1')
    .update(paramString + apiSecret)
    .digest('hex');

  return {
    uploadType: 'cloudinary',
    uploadURL: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    apiKey,
    timestamp,
    signature,
    folder,
  };
}
