import { useMemo } from "react";
import { getRepository, useRepository } from "../index";
import type { CompanionRepository } from "../repository";
import type { ApiClient } from "../http/client";
import { HttpCompanionRepository } from "../http/HttpCompanionRepository";

/** Mirrors DutyGraphV2 server/team-uploads.ts (/api/mobile/v1/uploads, migration 0115). */
export type TeamUpload = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  note: string;
  createdAt: string;
  /** with_advisor: sent, not added yet. added: the advisor added it to the company files. */
  state: "with_advisor" | "added";
};
/** A local file to send: a photo, a scanned PDF or a picked document. */
export type LocalUpload = { uri: string; name: string; mimeType: string; size?: number };

/** 4 MB, the server's limit (TEAM_UPLOAD_LIMITS). */
export const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export interface UploadsRepository {
  list(): Promise<TeamUpload[]>;
  upload(file: LocalUpload, note: string, idempotencyKey: string): Promise<TeamUpload>;
  withdraw(id: string, idempotencyKey: string): Promise<{ removed: true }>;
}

export class HttpUploadsRepository implements UploadsRepository {
  constructor(private client: Pick<ApiClient, "request">) {}
  async list() {
    return (await this.client.request<{ uploads: TeamUpload[] }>("GET", "/uploads")).uploads;
  }
  upload(file: LocalUpload, note: string, idempotencyKey: string) {
    // React Native sends a { uri, name, type } part straight from the file; nothing is read into JS memory.
    const form = new FormData();
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    if (note.trim()) form.append("note", note.trim());
    return this.client.request<TeamUpload>("POST", "/uploads", { formData: form, idempotencyKey, timeoutMs: 120_000 });
  }
  withdraw(id: string, idempotencyKey: string) {
    return this.client.request<{ removed: true }>("DELETE", `/uploads/${encodeURIComponent(id)}`, { idempotencyKey });
  }
}

/** Mock mode: kept in memory on this phone, nothing is sent. */
export class SampleUploadsRepository implements UploadsRepository {
  private items: TeamUpload[] = [
    {
      id: "sample-upload-1",
      filename: "Pump inspection checklist.pdf",
      mime: "application/pdf",
      size: 182_000,
      note: "The sheet we fill in at bench 2",
      createdAt: "2026-10-29T15:10:00.000Z",
      state: "added",
    },
  ];
  async list() {
    return [...this.items];
  }
  async upload(file: LocalUpload, note: string) {
    const item: TeamUpload = {
      id: `sample-${Date.now()}`,
      filename: file.name,
      mime: file.mimeType,
      size: file.size ?? 0,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      state: "with_advisor",
    };
    this.items = [item, ...this.items];
    return item;
  }
  async withdraw(id: string) {
    this.items = this.items.filter((u) => u.id !== id);
    return { removed: true as const };
  }
}

let injected: UploadsRepository | null = null;
const repositories = new WeakMap<CompanionRepository, UploadsRepository>();
export function getUploadsRepository(companion: CompanionRepository = getRepository()): UploadsRepository {
  if (injected) return injected;
  const saved = repositories.get(companion);
  if (saved) return saved;
  const value =
    companion instanceof HttpCompanionRepository
      ? new HttpUploadsRepository(companion.getExtensionApiClient())
      : new SampleUploadsRepository();
  repositories.set(companion, value);
  return value;
}
export function useUploadsRepository(): UploadsRepository {
  const companion = useRepository();
  return useMemo(() => getUploadsRepository(companion), [companion]);
}
export function setUploadsRepository(value: UploadsRepository | null) {
  injected = value;
}
