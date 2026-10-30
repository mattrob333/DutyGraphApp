/** Pure helpers for the Upload screen (tested in __tests__/uploads.test.ts). */
import { UPLOAD_MAX_BYTES } from "@/api/uploads";

export const UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  "text/markdown",
];

/** One scanned page: a JPEG as base64, with its size in pixels. */
export type ScanPage = { base64: string; width: number; height: number };

/** A Letter-size HTML page per photo; expo-print turns it into one PDF. */
export function scanPdfHtml(pages: ScanPage[]): string {
  const body = pages
    .map(
      (p, i) =>
        `<div class="page"${i < pages.length - 1 ? ' style="page-break-after:always"' : ""}><img src="data:image/jpeg;base64,${p.base64}" alt="Page ${i + 1}"/></div>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{margin:0}html,body{margin:0;padding:0}.page{width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}.page img{max-width:100%;max-height:100%;object-fit:contain}</style></head><body>${body}</body></html>`;
}

const two = (n: number) => String(n).padStart(2, "0");
/** "Scan 2026-10-30 14.05.pdf" or "Photo 2026-10-30 14.05.jpg", in local time. */
export function uploadName(kind: "scan" | "photo", at: Date): string {
  const stamp = `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}.${two(at.getMinutes())}`;
  return kind === "scan" ? `Scan ${stamp}.pdf` : `Photo ${stamp}.jpg`;
}

/** The message to show, or null when the file can be sent. */
export function uploadProblem(file: { name: string; size?: number; mimeType?: string }): string | null {
  if (file.size !== undefined && file.size > UPLOAD_MAX_BYTES)
    return "This file is larger than 4 MB. Scan fewer pages at a time, or send a smaller file.";
  if (!/\.(pdf|jpe?g|png|heic|webp|docx|xlsx|pptx|csv|txt|md)$/i.test(file.name))
    return "Send a PDF, a photo, a Word, Excel or PowerPoint file, or a CSV or text file.";
  return null;
}

export function sizeText(bytes: number): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
