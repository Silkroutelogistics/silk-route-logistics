import multer from "multer";
import path from "path";
import { env } from "./env";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"]);

export const upload = multer({
  storage: multer.memoryStorage(),
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
