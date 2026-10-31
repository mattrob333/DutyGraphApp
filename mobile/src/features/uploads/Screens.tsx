import React, { useCallback, useRef, useState } from "react";
import { Image, Platform, View } from "react-native";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import { Button, Card, Heading, LoadingState, Screen, SectionLabel, Text } from "@/components/common";
import { useUploadsRepository, type LocalUpload, type UploadsRepository, type TeamUpload } from "@/api/uploads";
import { useEarnResource } from "@/features/earn/hooks";
import { EarnError, Field } from "@/features/earn/Parts";
import { newIdempotencyKey } from "@/utils/id";
import { spacing } from "@/theme";
import { scanPdfHtml, sizeText, uploadName, uploadProblem, UPLOAD_TYPES, type ScanPage } from "./logic";

/** The longest side of a photo or scanned page. Enough to read a form; keeps a page near 300 KB. */
const PAGE_PX = 1800;

async function shrink(uri: string, base64 = false) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: PAGE_PX } }], {
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
    base64,
  });
  return out;
}

async function cameraAllowed(): Promise<boolean> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  return p.granted;
}

async function takePhoto() {
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  return shot.canceled ? null : shot.assets[0];
}

function back() {
  router.canGoBack() ? router.back() : router.replace("/today" as never);
}

/**
 * Upload (employee pilot app, October 30, 2026): send a photo of a form, a scan of several pages as one PDF,
 * or a file from the phone. The advisor reads it first; it joins the company files only if they add it.
 */
export function UploadScreen({ repository }: { repository?: UploadsRepository }) {
  const regular = useUploadsRepository();
  const repo = repository ?? regular;
  const list = useEarnResource(useCallback(() => repo.list(), [repo]));
  const [file, setFile] = useState<LocalUpload | null>(null);
  const [pages, setPages] = useState<ScanPage[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "camera" | "pdf" | "send" | string>("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const key = useRef(newIdempotencyKey());

  const choose = (next: LocalUpload | null) => {
    setFile(next);
    setMessage(next ? (uploadProblem(next) ? { tone: "error", text: uploadProblem(next)! } : null) : null);
    key.current = newIdempotencyKey();
  };
  const fail = (e: unknown) => setMessage({ tone: "error", text: (e as Error)?.message || "Something went wrong. Try again." });

  const photo = async () => {
    setBusy("camera");
    try {
      if (!(await cameraAllowed())) return setMessage({ tone: "error", text: "Allow the camera in Settings to take a photo, or choose a file instead." });
      const shot = await takePhoto();
      if (!shot) return;
      const small = await shrink(shot.uri);
      choose({ uri: small.uri, name: uploadName("photo", new Date()), mimeType: "image/jpeg" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const addPage = async () => {
    setBusy("camera");
    try {
      if (!(await cameraAllowed())) return setMessage({ tone: "error", text: "Allow the camera in Settings to scan pages, or choose a file instead." });
      const shot = await takePhoto();
      if (!shot) return;
      const small = await shrink(shot.uri, true);
      setPages((p) => [...(p ?? []), { base64: small.base64 ?? "", width: small.width, height: small.height }]);
      setMessage(null);
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const makePdf = async () => {
    if (!pages?.length) return;
    setBusy("pdf");
    try {
      const pdf = await Print.printToFileAsync({ html: scanPdfHtml(pages), width: 612, height: 792 });
      setPages(null);
      choose({ uri: pdf.uri, name: uploadName("scan", new Date()), mimeType: "application/pdf" });
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const pick = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: UPLOAD_TYPES, copyToCacheDirectory: true });
      if (r.canceled) return;
      const a = r.assets[0];
      choose({ uri: a.uri, name: a.name, mimeType: a.mimeType || "application/octet-stream", size: a.size });
    } catch (e) {
      fail(e);
    }
  };
  const send = async () => {
    if (!file) return;
    setBusy("send");
    try {
      const sent = await repo.upload(file, note, key.current);
      setFile(null);
      setNote("");
      key.current = newIdempotencyKey();
      setMessage({ tone: "ok", text: `Sent ${sent.filename} to your advisor.` });
      list.reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };
  const withdraw = async (u: TeamUpload) => {
    setBusy(u.id);
    try {
      await repo.withdraw(u.id, newIdempotencyKey());
      list.reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  const problem = file ? uploadProblem(file) : null;
  return (
    <Screen>
      <Button label="Back" kind="link" onPress={back} />
      <Heading>Upload</Heading>
      <Text color="muted">
        Send a form, a checklist, a screenshot or a document you use in your work. Your advisor reads it first. It joins the company files only if they add it.
      </Text>
      <Card tone="amber" style={{ marginTop: spacing.md }}>
        <Text variant="metaStrong">Do not send patient or customer details, passwords or card numbers. Cover them before you take a photo.</Text>
      </Card>

      {pages ? (
        <>
          <SectionLabel>Scan · {pages.length} page{pages.length === 1 ? "" : "s"}</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {pages.map((p, i) => (
              <Image
                key={i}
                accessibilityLabel={`Page ${i + 1}`}
                source={{ uri: `data:image/jpeg;base64,${p.base64}` }}
                style={{ width: 72, height: Math.round((72 * p.height) / Math.max(1, p.width)), borderRadius: 6 }}
              />
            ))}
          </View>
          <View style={{ gap: 8, marginTop: spacing.md }}>
            <Button label="Add a page" onPress={() => void addPage()} loading={busy === "camera"} disabled={!!busy} />
            <Button label="Make one PDF" kind="primary" onPress={() => void makePdf()} loading={busy === "pdf"} disabled={!!busy || !pages.length} />
            <Button label="Cancel scan" kind="link" onPress={() => setPages(null)} disabled={!!busy} />
          </View>
        </>
      ) : file ? (
        <>
          <SectionLabel>Ready to send</SectionLabel>
          <Card>
            <Text variant="bodyStrong">{file.name}</Text>
            {!!file.size && (
              <Text variant="small" color="muted">
                {sizeText(file.size)}
              </Text>
            )}
            {file.mimeType.startsWith("image/") && <Image accessibilityLabel="Photo preview" source={{ uri: file.uri }} style={{ width: "100%", height: 220, marginTop: 10, borderRadius: 8 }} resizeMode="contain" />}
          </Card>
          <Field label="What is this? (optional)" value={note} onChangeText={setNote} maxLength={500} placeholder="For example: the form we fill in to order parts" />
          <View style={{ gap: 8 }}>
            <Button label="Send to my advisor" kind="primary" onPress={() => void send()} loading={busy === "send"} disabled={!!busy || !!problem} />
            <Button label="Cancel" kind="link" onPress={() => choose(null)} disabled={busy === "send"} />
          </View>
        </>
      ) : (
        <View style={{ gap: 10, marginTop: spacing.lg }}>
          <Button label="Take a photo" kind="primary" onPress={() => void photo()} loading={busy === "camera"} disabled={!!busy} />
          {Platform.OS !== "web" && <Button label="Scan pages to one PDF" onPress={() => void addPage()} disabled={!!busy} />}
          <Button label="Choose a file" onPress={() => void pick()} disabled={!!busy} />
          <Text variant="small" color="muted">
            PDF, photo, Word, Excel, PowerPoint, CSV or text · up to 4 MB
          </Text>
        </View>
      )}

      {message && (
        <Text accessibilityRole={message.tone === "error" ? "alert" : "text"} color={message.tone === "error" ? "red" : "sage"} style={{ marginTop: spacing.md }}>
          {message.text}
        </Text>
      )}

      <SectionLabel>You sent</SectionLabel>
      {list.error ? (
        <EarnError error={list.error} retry={list.reload} />
      ) : !list.data ? (
        <LoadingState label="Loading your uploads…" />
      ) : list.data.length === 0 ? (
        <Card>
          <Text color="muted">You have not sent any files yet.</Text>
        </Card>
      ) : (
        list.data.map((u) => (
          <Card key={u.id} level="surface" style={{ marginBottom: 8 }}>
            <Text variant="bodyStrong">{u.filename}</Text>
            <Text variant="small" color="muted">
              {[new Date(u.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }), sizeText(u.size), u.note].filter(Boolean).join(" · ")}
            </Text>
            <Text variant="metaStrong" color={u.state === "added" ? "sage" : "muted"} style={{ marginTop: 6 }}>
              {u.state === "added" ? "In company files" : "With your advisor"}
            </Text>
            {u.state === "with_advisor" && (
              <Button label="Take back" kind="link" onPress={() => void withdraw(u)} loading={busy === u.id} disabled={!!busy} />
            )}
          </Card>
        ))
      )}
    </Screen>
  );
}
