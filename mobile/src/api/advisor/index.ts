import { config } from "@/api/config";
import { MockAdvisorRepository } from "./MockAdvisorRepository";
import { HttpAdvisorRepository } from "./HttpAdvisorRepository";
import type { AdvisorRepository } from "./types";
export * from "./types";
let singleton: AdvisorRepository | null = null;
export const getAdvisorRepository = (): AdvisorRepository =>
  (singleton ??=
    config.dataSource === "mock"
      ? new MockAdvisorRepository()
      : new HttpAdvisorRepository(
          config.meetingsApiBaseUrl,
        ));
export const setAdvisorRepository = (repository: AdvisorRepository) => {
  singleton = repository;
};
