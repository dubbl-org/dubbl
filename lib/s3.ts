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

export async function getUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

/** Short-lived read link. Pass `saveAs` to make browsers download it under that name. */
export async function getDownloadUrl(key: string, expiresIn = 300, saveAs?: string) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(saveAs
      ? { ResponseContentDisposition: `attachment; filename="${saveAs.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(saveAs)}` }
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

/** Upload bytes straight from the server (used when the browser never sees a presigned URL). */
export async function putObject(key: string, body: Uint8Array, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return s3.send(command);
}

/** Read an object's bytes on the server. */
export async function getObjectBytes(key: string) {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  const res = await s3.send(command);
  if (!res.Body) throw new Error("Empty object");
  return res.Body.transformToByteArray();
}
