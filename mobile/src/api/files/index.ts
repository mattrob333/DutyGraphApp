import { useMemo } from "react";
import { getRepository, useRepository } from "../index";
import type { CompanionRepository } from "../repository";
import type { ApiClient } from "../http/client";
import { HttpCompanionRepository } from "../http/HttpCompanionRepository";

/** Mirrors DutyGraphV2 server/mobile-files.ts (GET /api/mobile/v1/files). */
export type SharedFile = {
  path: string;
  folder: string;
  title: string;
  kind: string;
  state: string;
  summary: string;
  support: string;
  ownerName: string;
  mine: boolean;
};
export type SharedTree = {
  company: { name: string };
  folders: string[];
  files: SharedFile[];
};
export type SharedFileBody = SharedFile & {
  content: string;
  mediaType: string;
  links: { rel: string; dir: string; path: string; title: string }[];
};
export interface FilesRepository {
  getTree(): Promise<SharedTree>;
  getFile(path: string): Promise<SharedFileBody>;
}

export class HttpFilesRepository implements FilesRepository {
  constructor(private client: Pick<ApiClient, "get">) {}
  getTree() {
    return this.client.get<SharedTree>("/files");
  }
  getFile(path: string) {
    return this.client.get<SharedFileBody>(
      `/files/file?path=${encodeURIComponent(path)}`,
    );
  }
}

const SAMPLE: SharedFileBody[] = [
  {
    path: "company/profile.md",
    folder: "company",
    title: "Company profile",
    kind: "company",
    state: "observed",
    summary: "What the company does and who it serves.",
    support: "2 of 3 key fields confirmed",
    ownerName: "",
    mine: false,
    content:
      "# Company profile\n\nA fictional pump service company. Field teams keep customer pumps safe and running.",
    mediaType: "text/markdown",
    links: [],
  },
  {
    path: "departments/maintenance/README.md",
    folder: "departments/maintenance",
    title: "Maintenance",
    kind: "department",
    state: "confirmed",
    summary: "Keeps service pumps safe and running.",
    support: "1 of 1 confirmed",
    ownerName: "Dana Reed",
    mine: false,
    content: "# Maintenance\n\nNorth Star: no unplanned pump stops for key customers.",
    mediaType: "text/markdown",
    links: [],
  },
  {
    path: "departments/maintenance/tasks/inspect-the-service-pump.md",
    folder: "departments/maintenance/tasks",
    title: "Inspect the service pump",
    kind: "task",
    state: "proposed",
    summary: "Weekly seal and pressure check.",
    support: "derived from 2 records",
    ownerName: "You",
    mine: true,
    content:
      "# Inspect the service pump\n\n1. Lock the power switch at bench 2.\n2. Check the seal.\n3. Record the result.",
    mediaType: "text/markdown",
    links: [],
  },
];
/** Mock mode: fictional files only, no connection. */
export class SampleFilesRepository implements FilesRepository {
  async getTree(): Promise<SharedTree> {
    const files = SAMPLE.map(({ content: _c, mediaType: _m, links: _l, ...f }) => f);
    const folders = [
      ...new Set(
        files.flatMap((f) =>
          f.folder.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/")),
        ),
      ),
    ].sort();
    return { company: { name: "Fictional Pump Works" }, folders, files };
  }
  async getFile(path: string) {
    const file = SAMPLE.find((f) => f.path === path);
    if (!file) throw new Error("No shared file at this path.");
    return file;
  }
}

let injected: FilesRepository | null = null;
const repositories = new WeakMap<CompanionRepository, FilesRepository>();
export function getFilesRepository(
  companion: CompanionRepository = getRepository(),
): FilesRepository {
  if (injected) return injected;
  const saved = repositories.get(companion);
  if (saved) return saved;
  const value =
    companion instanceof HttpCompanionRepository
      ? new HttpFilesRepository(companion.getExtensionApiClient())
      : new SampleFilesRepository();
  repositories.set(companion, value);
  return value;
}
export function useFilesRepository(): FilesRepository {
  const companion = useRepository();
  return useMemo(() => getFilesRepository(companion), [companion]);
}
export function setFilesRepository(value: FilesRepository | null) {
  injected = value;
}
