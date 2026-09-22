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

// E1b — a refused upload is the CLIENT's error, and it must reach the client as
// one. These carry code + status so errorHandler answers 400 instead of falling
// to its default branch, which logged every refused MIME type as UNHANDLED,
// counted it toward the spike alert, sent it to Sentry, and told the uploader
// "Internal server error". Size refusals arrive as multer.MulterError
// (LIMIT_FILE_SIZE) and errorHandler maps those to 413 itself.
export const UNSUPPORTED_FILE_TYPE = "UNSUPPORTED_FILE_TYPE";
function refusal(message: string): Error {
  return Object.assign(new Error(message), { status: 400, code: UNSUPPORTED_FILE_TYPE });
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    // Check MIME type
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      cb(refusal("Only PDF, JPEG, PNG, DOC, and DOCX files are allowed"));
      return;
    }
    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(refusal("File extension does not match allowed types"));
      return;
    }
    cb(null, true);
  },
});
