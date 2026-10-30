import { describe, it, expect, jest } from "@jest/globals";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { ThemeProvider } from "@/theme";
import { ConnectAiScreen, connectorLink, setupText } from "../ConnectAiScreen";

jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock("expo-router", () => ({ router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn() } }));

describe("Connect your AI", () => {
  it("builds the plain OAuth connector link from the backend origin", () => {
    expect(connectorLink("https://dutygraph.example/")).toBe("https://dutygraph.example/api/mcp");
  });
  it("puts the link and both setup guides in the shared text", () => {
    const text = setupText("https://dutygraph.example/api/mcp");
    expect(text).toContain("Connector link: https://dutygraph.example/api/mcp");
    expect(text).toContain("Claude (claude.ai)");
    expect(text).toContain("ChatGPT (chatgpt.com)");
    expect(text).toContain("Do not paste the link into a chat.");
  });
  it("shows the link and copies it", async () => {
    await render(<ThemeProvider><ConnectAiScreen origin="https://dutygraph.example" /></ThemeProvider>);
    expect(screen.getByText("https://dutygraph.example/api/mcp")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Copy connector link" }));
    await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://dutygraph.example/api/mcp"));
    expect(await screen.findByText("Copied.")).toBeTruthy();
  });
});
