import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  const key = process.env.EMAIL_ENCRYPTION_KEY;
  if (!key) throw new Error("EMAIL_ENCRYPTION_KEY not set");
  return Buffer.from(key, "hex");
}

export function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(password, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptPassword(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, data] = encrypted.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string; // encrypted
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
  useTls: boolean;
}

function createTransporter(config: SmtpConfig) {
  const password = decryptPassword(config.smtpPassword);
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUsername, pass: password },
    tls: config.useTls ? { rejectUnauthorized: false } : undefined,
  });
}

export async function sendEmail(
  config: SmtpConfig,
  options: {
    to: string;
    subject: string;
    html: string;
    attachments?: { filename: string; content: Buffer }[];
  }
) {
  const transporter = createTransporter(config);
  const from = config.fromName
    ? `"${config.fromName}" <${config.fromEmail}>`
    : config.fromEmail;

  await transporter.sendMail({
    from,
    replyTo: config.replyTo || undefined,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
}

export async function verifyConnection(config: SmtpConfig): Promise<boolean> {
  const transporter = createTransporter(config);
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}
