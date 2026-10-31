import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { ThemeProvider } from "@/theme";
import { HttpUploadsRepository, SampleUploadsRepository } from "@/api/uploads";
import { scanPdfHtml, uploadName, uploadProblem } from "../logic";

const mockLaunchCamera = jest.fn();
const mockPickDocument = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useFocusEffect: (fn: () => void) => require("react").useEffect(fn, [fn]),
}));
jest.mock("@/api/index", () => ({ useRepository: () => ({}), getRepository: () => ({}) }));
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: async () => ({ granted: true }),
  launchCameraAsync: (...a: unknown[]) => mockLaunchCamera(...a),
}));
jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  manipulateAsync: async (uri: string, _a: unknown, o: { base64?: boolean }) => ({ uri: uri + ".small.jpg", width: 1800, height: 2400, ...(o.base64 ? { base64: "QUJD" } : {}) }),
}));
jest.mock("expo-print", () => ({ printToFileAsync: async () => ({ uri: "file:///cache/scan.pdf" }) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: (...a: unknown[]) => mockPickDocument(...a) }));

// Imported after the mocks.
const { UploadScreen } = require("../Screens") as typeof import("../Screens");

describe("Upload", () => {
  it("names photos and scans, and refuses big or unknown files", () => {
    const at = new Date(2026, 9, 30, 14, 5);
    expect(uploadName("scan", at)).toBe("Scan 2026-10-30 14.05.pdf");
    expect(uploadName("photo", at)).toBe("Photo 2026-10-30 14.05.jpg");
    expect(uploadProblem({ name: "form.pdf", size: 5 * 1024 * 1024 })).toMatch(/4 MB/);
    expect(uploadProblem({ name: "tool.exe", size: 10 })).toMatch(/Send a PDF/);
    expect(uploadProblem({ name: "form.pdf", size: 10 })).toBeNull();
  });
  it("puts each scanned page on its own PDF page", () => {
    const html = scanPdfHtml([{ base64: "AAA", width: 1, height: 1 }, { base64: "BBB", width: 1, height: 1 }]);
    expect(html.match(/<img /g)).toHaveLength(2);
    expect(html.match(/page-break-after:always/g)).toHaveLength(1);
  });
  it("posts the file as multipart with its note and key, and withdraws by id", async () => {
    const request = jest.fn(async () => ({ uploads: [] }));
    const repo = new HttpUploadsRepository({ request } as never);
    await repo.upload({ uri: "file:///a.pdf", name: "a.pdf", mimeType: "application/pdf" }, " the form ", "key-1");
    const [method, path, opts] = request.mock.calls[0] as unknown as [string, string, { formData: FormData; idempotencyKey: string }];
    expect([method, path, opts.idempotencyKey]).toEqual(["POST", "/uploads", "key-1"]);
    expect(opts.formData).toBeInstanceOf(FormData);
    await repo.withdraw("id 1", "key-2");
    expect(request).toHaveBeenLastCalledWith("DELETE", "/uploads/id%201", { idempotencyKey: "key-2" });
  });
  it("takes a photo, sends it with a note, and lists it as with your advisor", async () => {
    mockLaunchCamera.mockImplementation(async () => ({ canceled: false, assets: [{ uri: "file:///photo.jpg" }] }));
    const repo = new SampleUploadsRepository();
    await render(<ThemeProvider><UploadScreen repository={repo} /></ThemeProvider>);
    expect(await screen.findByText("Pump inspection checklist.pdf")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Take a photo" }));
    expect(await screen.findByText(/^Photo .*\.jpg$/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("What is this? (optional)"), "Parts order form");
    await fireEvent.press(screen.getByRole("button", { name: "Send to my advisor" }));
    expect(await screen.findByText(/Sent Photo .* to your advisor/)).toBeTruthy();
    expect((await repo.list())[0]).toMatchObject({ note: "Parts order form", state: "with_advisor" });
  });
  it("scans two pages into one PDF", async () => {
    mockLaunchCamera.mockImplementation(async () => ({ canceled: false, assets: [{ uri: "file:///page.jpg" }] }));
    await render(<ThemeProvider><UploadScreen repository={new SampleUploadsRepository()} /></ThemeProvider>);
    await fireEvent.press(await screen.findByRole("button", { name: "Scan pages to one PDF" }));
    expect(await screen.findByText("Scan · 1 page")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Add a page" }));
    expect(await screen.findByText("Scan · 2 pages")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Make one PDF" }));
    expect(await screen.findByText(/^Scan .*\.pdf$/)).toBeTruthy();
  });
  it("chooses a file from the phone", async () => {
    mockPickDocument.mockImplementation(async () => ({ canceled: false, assets: [{ uri: "file:///x.docx", name: "Opening steps.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 20480 }] }));
    await render(<ThemeProvider><UploadScreen repository={new SampleUploadsRepository()} /></ThemeProvider>);
    await fireEvent.press(await screen.findByRole("button", { name: "Choose a file" }));
    expect(await screen.findByText("Opening steps.docx")).toBeTruthy();
    expect(screen.getByText("20 KB")).toBeTruthy();
  });
});
