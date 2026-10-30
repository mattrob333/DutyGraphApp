import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { HttpFilesRepository, SampleFilesRepository } from "@/api/files";
import { FileScreen, FilesScreen, folderView } from "../Screens";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/api/index", () => ({ useRepository: () => ({}), getRepository: () => ({}) }));

describe("Files", () => {
  it("lists direct child folders and files", () => {
    const files = [
      { path: "a/x.md", folder: "a", title: "X", kind: "task", state: "proposed", summary: "", support: "", ownerName: "", mine: false },
      { path: "top.md", folder: "", title: "Top", kind: "company", state: "observed", summary: "", support: "", ownerName: "", mine: false },
    ];
    expect(folderView(["a", "a/b", "c"], files, "")).toEqual({ folders: ["a", "c"], files: [files[1]] });
    expect(folderView(["a", "a/b", "c"], files, "a")).toEqual({ folders: ["a/b"], files: [files[0]] });
  });
  it("calls the bearer files route with an encoded path", async () => {
    const get = jest.fn(async () => ({}));
    const repo = new HttpFilesRepository({ get } as never);
    await repo.getTree();
    await repo.getFile("departments/a b.md");
    expect(get).toHaveBeenNthCalledWith(1, "/files");
    expect(get).toHaveBeenNthCalledWith(2, "/files/file?path=departments%2Fa%20b.md");
  });
  it("browses folders, shows Mine and opens a file", async () => {
    await render(<ThemeProvider><FilesScreen repository={new SampleFilesRepository()} /></ThemeProvider>);
    fireEvent.press(await screen.findByRole("button", { name: /^Departments\// }));
    fireEvent.press(await screen.findByRole("button", { name: /^Maintenance\// }));
    expect(await screen.findByText("Maintenance")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Mine" }));
    fireEvent.press(await screen.findByRole("button", { name: /^Inspect the service pump/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/files/view", params: { path: "departments/maintenance/tasks/inspect-the-service-pump.md" } });
  });
  it("shows one file's content", async () => {
    await render(<ThemeProvider><FileScreen repository={new SampleFilesRepository()} path="company/profile.md" /></ThemeProvider>);
    expect(await screen.findByText("Company profile")).toBeTruthy();
    expect(screen.getByText(/A fictional pump service company/)).toBeTruthy();
  });
});
