import multer from "multer";
import path from "path";
import fs from "fs";
import { env } from "./env";

const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"]);

export const upload = multer({
  storage,
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Check MIME type
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(new Error("Only PDF, JPEG, PNG, DOC, and DOCX files are allowed"));
      return;
    }
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error("File extension does not match allowed types"));
      return;
    }
    cb(null, true);
  },
});

/**
 * Magic byte signatures for file type validation.
 * Call this AFTER upload to verify file content matches claimed type.
 */
const MAGIC_BYTES: Record<string, Buffer[]> = {
  "application/pdf": [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  "image/jpeg": [Buffer.from([0xFF, 0xD8, 0xFF])],
  "image/png": [Buffer.from([0x89, 0x50, 0x4E, 0x47])], // .PNG
  "application/msword": [Buffer.from([0xD0, 0xCF, 0x11, 0xE0])], // OLE compound
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    Buffer.from([0x50, 0x4B, 0x03, 0x04]), // PK zip (docx is a zip)
  ],
};

/**
 * Validate that an uploaded file's content matches its claimed MIME type.
 * Returns true if valid, false if magic bytes don't match.
 */
export function validateFileSignature(filePath: string, claimedMime: string): boolean {
  const signatures = MAGIC_BYTES[claimedMime];
  if (!signatures) return true; // No signature to check — allow

  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);

    return signatures.some((sig) => buf.subarray(0, sig.length).equals(sig));
  } catch {
    return false;
  }
}
