import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  Button,
  Card,
  Heading,
  LoadingState,
  Screen,
  SectionLabel,
  Text,
} from "@/components/common";
import {
  useFilesRepository,
  type FilesRepository,
  type SharedFile,
} from "@/api/files";
import { useEarnResource } from "@/features/earn/hooks";
import { EarnError, Row } from "@/features/earn/Parts";

const STATE_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  observed: "Checked, not confirmed",
  inferred: "From one source",
  disputed: "Sources disagree",
  unknown: "Not known yet",
  proposed: "Draft",
  generated: "Built by DutyGraph",
  slot: "Nothing captured yet",
};
export const stateLabel = (state: string) => STATE_LABELS[state] ?? state;
const leaf = (folder: string) => folder.slice(folder.lastIndexOf("/") + 1);
const label = (folder: string) =>
  leaf(folder).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Child folders and files directly in `folder` ("" is the top). Pure, exported for tests. */
export function folderView(
  folders: string[],
  files: SharedFile[],
  folder: string,
) {
  const depth = folder ? folder.split("/").length + 1 : 1;
  const inside = (path: string) => !folder || path.startsWith(folder + "/");
  return {
    folders: folders.filter((f) => inside(f) && f.split("/").length === depth),
    files: files.filter((f) => f.folder === folder),
  };
}

function open(path: string) {
  router.push({ pathname: "/files/view", params: { path } } as never);
}
function back(fallback: string) {
  router.canGoBack() ? router.back() : router.replace(fallback as never);
}

export function FilesScreen({ repository }: { repository?: FilesRepository }) {
  const regular = useFilesRepository();
  const repo = repository ?? regular;
  const tree = useEarnResource(useCallback(() => repo.getTree(), [repo]));
  const [tab, setTab] = useState<"company" | "mine">("company");
  const [folder, setFolder] = useState("");
  const crumbs = folder ? folder.split("/") : [];
  const view = tree.data
    ? folderView(tree.data.folders, tree.data.files, folder)
    : null;
  const mine = tree.data?.files.filter((f) => f.mine) ?? [];
  return (
    <Screen>
      <Button label="Back" kind="link" onPress={() => back("/me")} />
      <Heading>Files</Heading>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="Company"
          kind={tab === "company" ? "primary" : "secondary"}
          accessibilityState={{ selected: tab === "company" }}
          onPress={() => setTab("company")}
        />
        <Button
          label="Mine"
          kind={tab === "mine" ? "primary" : "secondary"}
          accessibilityState={{ selected: tab === "mine" }}
          onPress={() => setTab("mine")}
        />
      </View>
      {tree.error ? (
        <EarnError error={tree.error} retry={tree.reload} />
      ) : !tree.data || !view ? (
        <LoadingState label="Loading company files…" />
      ) : tab === "mine" ? (
        <>
          <Text color="muted">Files you own or approve.</Text>
          {mine.length === 0 ? (
            <Card>
              <Text>No files are linked to you yet.</Text>
            </Card>
          ) : (
            mine.map((f) => (
              <Row
                key={f.path}
                label={f.title}
                detail={`${f.folder || "Top"} · ${stateLabel(f.state)}`}
                onPress={() => open(f.path)}
              />
            ))
          )}
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Button
              label={tree.data.company.name}
              kind="link"
              onPress={() => setFolder("")}
            />
            {crumbs.map((part, i) => (
              <Button
                key={i}
                label={`› ${label(part)}`}
                kind="link"
                onPress={() => setFolder(crumbs.slice(0, i + 1).join("/"))}
              />
            ))}
          </View>
          {view.folders.map((f) => (
            <Row
              key={f}
              label={`${label(f)}/`}
              detail={`${tree.data!.files.filter((x) => x.folder === f || x.folder.startsWith(f + "/")).length} files`}
              onPress={() => setFolder(f)}
            />
          ))}
          {view.files.map((f) => (
            <Row
              key={f.path}
              label={f.title}
              detail={`${stateLabel(f.state)}${f.mine ? " · Yours" : ""}`}
              onPress={() => open(f.path)}
            />
          ))}
          {view.folders.length === 0 && view.files.length === 0 && (
            <Card>
              <Text>Nothing shared here yet.</Text>
            </Card>
          )}
          <Text variant="small" color="muted">
            You see the files your company shares with the team. Upload
            documents in the DutyGraph web app.
          </Text>
        </>
      )}
    </Screen>
  );
}

export function FileScreen({
  repository,
  path: injectedPath,
}: {
  repository?: FilesRepository;
  path?: string;
}) {
  const regular = useFilesRepository();
  const repo = repository ?? regular;
  const params = useLocalSearchParams<{ path?: string }>();
  const path = injectedPath ?? params.path ?? "";
  const file = useEarnResource(useCallback(() => repo.getFile(path), [repo, path]));
  return (
    <Screen>
      <Button label="Back" kind="link" onPress={() => back("/files")} />
      {file.error ? (
        <EarnError error={file.error} retry={file.reload} />
      ) : !file.data ? (
        <LoadingState label="Opening the file…" />
      ) : (
        <>
          <Heading>{file.data.title}</Heading>
          <Text variant="meta" color="muted">
            {file.data.folder || "Top"} · {stateLabel(file.data.state)}
            {file.data.ownerName ? ` · Owner: ${file.data.ownerName}` : ""}
          </Text>
          {!!file.data.support && (
            <Text variant="small" color="muted">
              {file.data.support}
            </Text>
          )}
          <Card level="surface">
            <Text selectable>{file.data.content}</Text>
          </Card>
          {file.data.links.length > 0 && (
            <>
              <SectionLabel>Linked files</SectionLabel>
              {file.data.links.map((l) => (
                <Row
                  key={`${l.rel}:${l.path}`}
                  label={l.title}
                  detail={l.rel.replace(/_/g, " ")}
                  onPress={() => open(l.path)}
                />
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
