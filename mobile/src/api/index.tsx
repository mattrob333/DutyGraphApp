import React, { createContext, useContext } from 'react';
import type { CompanionRepository } from './repository';
import { MockCompanionRepository } from './mock/MockCompanionRepository';
import { createHttpRepository } from './http/HttpCompanionRepository';
import { config } from './config';

export type { CompanionRepository } from './repository';

let singleton: CompanionRepository | null = null;

/** The app-wide repository chosen by EXPO_PUBLIC_DATA_SOURCE. */
export function getRepository(): CompanionRepository {
  if (!singleton) singleton = config.dataSource === 'http' ? createHttpRepository() : new MockCompanionRepository();
  return singleton;
}

/** Tests and the mock "Reset demo" action swap the instance. */
export function setRepository(r: CompanionRepository) {
  singleton = r;
}

const RepositoryContext = createContext<CompanionRepository | null>(null);

export function RepositoryProvider({ repository, children }: { repository?: CompanionRepository; children: React.ReactNode }) {
  return <RepositoryContext.Provider value={repository ?? getRepository()}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): CompanionRepository {
  const r = useContext(RepositoryContext);
  if (!r) throw new Error('useRepository must be used inside RepositoryProvider');
  return r;
}

export function asMock(r: CompanionRepository): MockCompanionRepository | null {
  return r.kind === 'mock' ? (r as MockCompanionRepository) : null;
}
