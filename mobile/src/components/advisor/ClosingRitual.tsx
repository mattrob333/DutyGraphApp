import React, { useState } from "react";
import { View } from "react-native";
import { Button, Card, SectionLabel, Text } from "@/components/common";
import { Field, ListRow, Notice } from "./Parts";
import type {
  ClosingOutcomeReview,
  MeetingDefinition,
  SaveClosing,
  SessionDetail,
} from "@/api/advisor";

const labels = {
  met: "Met",
  partly_met: "Partly met",
  deferred: "Deferred",
  dropped: "Dropped",
} as const;

/** Local selections are drafts. Only the server can acknowledge completion. */
export function ClosingRitual({
  meeting,
  session,
  busy,
  onSave,
  onComplete,
}: {
  meeting: MeetingDefinition;
  session: SessionDetail;
  busy: boolean;
  onSave(input: SaveClosing): Promise<boolean>;
  onComplete(): void;
}) {
  const [draft, setDraft] = useState<ClosingOutcomeReview[] | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [reviewedVersion, setReviewedVersion] = useState<{
    version: number;
    hash: string;
  } | null>(null);
  const saved = session.outcomeReviews ?? [];
  const current = draft ?? saved;
  const followUpPlan = plan ?? session.followUpPlan ?? "";
  const dirty =
    JSON.stringify(current) !== JSON.stringify(saved) ||
    followUpPlan !== (session.followUpPlan ?? "");
  const staleDraft = !!(
    dirty &&
    reviewedVersion &&
    (reviewedVersion.version !== session.version ||
      reviewedVersion.hash !== session.hash)
  );
  const complete = meeting.state === "COMPLETE";
  const candidates = session.consents.filter(
    (person) => person.state === "consented",
  );
  const beginEdit = () => {
    if (!dirty || !reviewedVersion)
      setReviewedVersion({ version: session.version, hash: session.hash });
  };
  const update = (outcomeId: string, patch: Partial<ClosingOutcomeReview>) => {
    if (busy || complete) return;
    beginEdit();
    const previous = current.find((review) => review.outcomeId === outcomeId);
    setDraft([
      ...current.filter((review) => review.outcomeId !== outcomeId),
      {
        outcomeId,
        status: "met",
        ownerPersonKey: null,
        dueAt: null,
        ...previous,
        ...patch,
      },
    ]);
  };
  const incomplete = meeting.power.outcomes.some((_, index) => {
    const review = current.find(
      (item) => item.outcomeId === `outcome-${index + 1}`,
    );
    return (
      !review ||
      (review.status === "deferred" &&
        (!review.ownerPersonKey ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
            review.dueAt ?? "",
          ) ||
          !Number.isFinite(Date.parse(review.dueAt ?? "")))) ||
      (review.status === "partly_met" && !followUpPlan.trim())
    );
  });
  return (
    <View>
      <SectionLabel>Meeting outcomes</SectionLabel>
      <Notice>
        Record what happened for each outcome. Deferred work needs an owner and
        a date.
      </Notice>
      {meeting.power.outcomes.map((title, index) => {
        const outcomeId = `outcome-${index + 1}`;
        const review = current.find((item) => item.outcomeId === outcomeId);
        return (
          <Card key={outcomeId}>
            <Text variant="bodyStrong">{title}</Text>
            <Notice>{review ? labels[review.status] : "Not reviewed"}</Notice>
            {!complete ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(Object.keys(labels) as (keyof typeof labels)[]).map(
                  (status) => (
                    <Button
                      key={status}
                      label={labels[status]}
                      accessibilityLabel={`${labels[status]}: ${title}`}
                      disabled={busy}
                      onPress={() => update(outcomeId, { status })}
                    />
                  ),
                )}
              </View>
            ) : null}
            {review?.status === "deferred" ? (
              <View>
                <Text variant="metaStrong">Follow-up owner</Text>
                {candidates.map((person) => (
                  <ListRow
                    key={person.personKey}
                    title={person.name}
                    selected={review.ownerPersonKey === person.personKey}
                    onPress={
                      !complete && !busy
                        ? () =>
                            update(outcomeId, {
                              ownerPersonKey: person.personKey,
                            })
                        : undefined
                    }
                  />
                ))}
                {complete ? (
                  <Notice>Due: {review.dueAt ?? "Not stated"}</Notice>
                ) : (
                  <Field
                    label={`Follow-up date: ${title}`}
                    editable={!busy}
                    placeholder="2026-11-03T14:00:00-05:00"
                    value={review.dueAt ?? ""}
                    onChange={(dueAt) => update(outcomeId, { dueAt })}
                    multiline={false}
                    maxLength={50}
                  />
                )}
                <Notice>
                  Use a full date and time, including the time zone. Deferred
                  work carries into a linked next meeting.
                </Notice>
              </View>
            ) : null}
          </Card>
        );
      })}
      {!complete ? (
        <Field
          label="Follow-up plan"
          editable={!busy}
          placeholder="What remains, who will follow up, and when? Required for partly met outcomes."
          value={followUpPlan}
          onChange={(value) => {
            if (!busy) {
              beginEdit();
              setPlan(value);
            }
          }}
          maxLength={4000}
        />
      ) : null}
      {!complete ? (
        <Button
          label="Save outcome review"
          disabled={busy || incomplete || !dirty || staleDraft}
          loading={busy}
          onPress={async () => {
            const outcomes = current.map((review) => ({
              ...review,
              dueAt:
                review.status === "deferred" && review.dueAt
                  ? new Date(review.dueAt).toISOString()
                  : null,
              ownerPersonKey:
                review.status === "deferred" ? review.ownerPersonKey : null,
            }));
            if (
              await onSave({
                outcomes,
                followUpPlan,
                expectedVersion: reviewedVersion?.version ?? session.version,
                contentHash: reviewedVersion?.hash ?? session.hash,
              })
            ) {
              setDraft(null);
              setPlan(null);
              setReviewedVersion(null);
            }
          }}
        />
      ) : null}
      {staleDraft ? (
        <View>
          <Notice tone="amber">
            The server review changed while you were editing. Reload it before
            saving again.
          </Notice>
          <Button
            label="Reload outcome review"
            disabled={busy}
            onPress={() => {
              setDraft(null);
              setPlan(null);
              setReviewedVersion(null);
            }}
          />
        </View>
      ) : null}
      {session.closingReadiness ? (
        <Notice>
          {session.closingReadiness.missingOutcomes} outcomes still need review.{" "}
          {session.closingReadiness.unconfirmedActions} actions still need an
          owner, date or confirmation.
        </Notice>
      ) : (
        <Notice>
          Save the review, then check the server’s closing requirements.
        </Notice>
      )}
      {complete ? (
        <Notice tone="sage">
          Meeting complete. The server acknowledged the closing review.
        </Notice>
      ) : (
        <Button
          label="Complete meeting"
          kind="primary"
          loading={busy}
          disabled={busy || dirty || !session.closingReadiness?.complete}
          onPress={onComplete}
        />
      )}
      {!complete ? (
        <Notice>
          Review all proposals and confirm each accepted action before
          completing the meeting.
        </Notice>
      ) : null}
    </View>
  );
}
