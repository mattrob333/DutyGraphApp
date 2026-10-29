import React, { useState } from "react";
import { Share, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  Button,
  Card,
  Heading,
  Screen,
  SectionLabel,
  Text,
} from "@/components/common";
import { config } from "@/api/config";
import { BRING_WORK_PROMPT } from "./prompts";

/** The same OAuth connector URL the DutyGraph web client shows. */
export const connectorLink = (origin: string = config.apiBaseUrl) =>
  `${origin.replace(/\/+$/, "")}/api/mcp`;

export const CLAUDE_STEPS = [
  "Open Settings › Connectors. Press Add custom connector.",
  "Name: DutyGraph. URL: paste the link. Press Add.",
  "Press Connect. A DutyGraph page opens. Press Allow.",
  "Close that chat and open a new chat. In the + menu, turn on DutyGraph.",
  "Type: DutyGraph start.",
] as const;
export const CHATGPT_STEPS = [
  "Open Settings › Apps & Connectors › Advanced settings. Turn on Developer mode.",
  "Go back to Apps & Connectors. Press Create.",
  "Name: DutyGraph. URL: paste the link. Authentication: OAuth. Tick “I trust this application”. Press Create.",
  "A DutyGraph page opens. Press Allow.",
  "Close that chat and open a new chat. Type @DutyGraph, pick it, then type start.",
] as const;
export const WHAT_TO_SAY = [
  ["start", "what DutyGraph can do for you, in short."],
  [
    "Build my Task Cards",
    "your AI writes cards from your past chats, asks you about what is missing, then sends them here.",
  ],
  ["Find more tasks", "questions about all your work, also hands-on work."],
  [
    "Show my Task Cards",
    "pick a card and your AI runs it with you, so you do not type your instructions again.",
  ],
] as const;

/** Plain text for Share, so a person can open the steps on a computer. */
export function setupText(link: string) {
  const list = (steps: readonly string[]) =>
    steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return [
    "Connect your AI to DutyGraph",
    "",
    `Connector link: ${link}`,
    "Do not paste the link into a chat. Add it once in your AI's settings, in a web browser.",
    "",
    "Claude (claude.ai)",
    list(CLAUDE_STEPS),
    "",
    "ChatGPT (chatgpt.com)",
    list(CHATGPT_STEPS),
    "",
    "What to say",
    ...WHAT_TO_SAY.map(([say, does]) => `- ${say}: ${does}`),
  ].join("\n");
}

function Steps({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <Card level="surface">
      <Text variant="bodyStrong">{title}</Text>
      {steps.map((step, i) => (
        <Text key={step}>
          {i + 1}. {step}
        </Text>
      ))}
    </Card>
  );
}

export function ConnectAiScreen({ origin }: { origin?: string }) {
  const link = connectorLink(origin);
  const [message, setMessage] = useState("");
  const copy = async (text: string) => {
    try {
      if (await Clipboard.setStringAsync(text)) setMessage("Copied.");
      else setMessage("Copy did not work. Use Share instead.");
    } catch {
      setMessage("Copy did not work. Use Share instead.");
    }
  };
  const share = (text: string) =>
    void Share.share({ message: text }).catch(() =>
      setMessage("Share did not open. Try Copy."),
    );
  return (
    <Screen>
      <Button
        label="Back"
        kind="link"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/earn")
        }
      />
      <Heading>Connect your AI</Heading>
      <Text>
        Your AI writes Task Cards with you and sends them to DutyGraph. They
        arrive under From your AI. You still check and confirm each one.
      </Text>
      <SectionLabel>Copy this link and go</SectionLabel>
      <Card>
        <Text selectable accessibilityLabel="Connector link">
          {link}
        </Text>
        <Button
          label="Copy connector link"
          kind="primary"
          onPress={() => void copy(link)}
        />
        <Button
          label="Send the steps to my computer"
          kind="secondary"
          onPress={() => share(setupText(link))}
        />
      </Card>
      <Card tone="amber">
        <Text variant="bodyStrong">Do not paste the link into a chat.</Text>
        <Text>
          Your AI cannot connect from a chat. Add it once in your AI's
          settings, in a web browser. It then works in every new chat, also in
          the Claude and ChatGPT phone apps.
        </Text>
      </Card>
      <Steps title="Claude (claude.ai)" steps={CLAUDE_STEPS} />
      <Steps title="ChatGPT (chatgpt.com)" steps={CHATGPT_STEPS} />
      <SectionLabel>What to say</SectionLabel>
      {WHAT_TO_SAY.map(([say, does]) => (
        <Text key={say}>
          <Text variant="bodyStrong">{say}</Text>: {does}
        </Text>
      ))}
      <SectionLabel>No connector? Bring your AI work</SectionLabel>
      <Card level="surface">
        <Text>
          Copy this prompt into ChatGPT or Claude. It writes your tasks from
          your past chats. Upload the answer in the DutyGraph web app.
        </Text>
        <Button
          label="Copy bring-work prompt"
          onPress={() => void copy(BRING_WORK_PROMPT)}
        />
        <Button
          label="Share bring-work prompt"
          kind="secondary"
          onPress={() => share(BRING_WORK_PROMPT)}
        />
      </Card>
      {!!message && (
        <View>
          <Text accessibilityLiveRegion="polite">{message}</Text>
        </View>
      )}
    </Screen>
  );
}
