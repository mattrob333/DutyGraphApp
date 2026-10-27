import React from "react";
import { afterEach, expect, test } from "@jest/globals";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RepositoryProvider } from "@/api";
import type { CompanionRepository } from "@/api/repository";
import { useUiStore } from "@/state/ui";
import { CompanionApiError } from "@/types/domain";
import { questionSet } from "../__fixtures__/handsFree";
import { useQuestionSet } from "../queries";
const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  useUiStore.setState({ offline: false });
});
function wrapper(
  getQuestionSet: () => Promise<ReturnType<typeof questionSet>>,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <RepositoryProvider
        repository={
          { kind: "mock", getQuestionSet } as unknown as CompanionRepository
        }
      >
        {children}
      </RepositoryProvider>
    </QueryClientProvider>
  );
}
test("question load clears stale offline state after reconnect", async () => {
  useUiStore.setState({ offline: true });
  const set = questionSet();
  const hook = await renderHook(() => useQuestionSet(set.requestId), {
    wrapper: wrapper(async () => set),
  });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(useUiStore.getState().offline).toBe(false);
  expect(hook.result.current.data).toEqual(set);
  await hook.unmount();
});
test("network failures keep cached deck offline while authorization errors retain their identity", async () => {
  const network = await renderHook(() => useQuestionSet("offline"), {
    wrapper: wrapper(async () => {
      throw new TypeError("No network");
    }),
  });
  await waitFor(() => expect(network.result.current.isError).toBe(true));
  expect(useUiStore.getState().offline).toBe(true);
  await network.unmount();
  useUiStore.setState({ offline: false });
  const denied = new CompanionApiError(
    "FORBIDDEN",
    "This request is unavailable.",
    403,
    false,
  );
  const authorized = await renderHook(() => useQuestionSet("denied"), {
    wrapper: wrapper(async () => {
      throw denied;
    }),
  });
  await waitFor(() => expect(authorized.result.current.error).toBe(denied));
  expect(useUiStore.getState().offline).toBe(false);
  await authorized.unmount();
});
