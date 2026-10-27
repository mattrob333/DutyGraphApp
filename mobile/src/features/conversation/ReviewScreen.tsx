/**
 * "Here's what we understood": the participant checks, changes and submits.
 *
 * DutyGraph's interpretation is a proposal. Nothing counts as the
 * participant's confirmed answer until they act on it and send it. Edits are
 * kept in a local copy (and sent to the server as they happen); the submit
 * sends that reviewed copy with an idempotency key that is created once per
 * review and saved on the phone BEFORE the first attempt, so a retry, or the
 * background retry after a lost connection, can never send it twice.
 * Completion is shown only after the server acknowledges.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { radius, useColors } from '@/theme';
import { BottomActionBar, Button, ErrorState, Heading, Screen, StatusChip, Text, errorMessage } from '@/components/common';
import { AddItemButton, EditWordingSheet, InterpretationCard } from '@/components/review';
import { StatusPanel, useReducedMotion } from '@/components/voice';
import { useConversation, useReview, useSubmitReview, useUpdateReviewItem, isNetworkError } from '@/hooks/queries';
import { CompanionApiError, type InterpretationItem } from '@/types/domain';
import { pendingSubmissions, textDrafts } from '@/storage/drafts';
import { showToast } from '@/state/ui';
import { track } from '@/analytics/events';
import { newId, newIdempotencyKey } from '@/utils/id';
import { doneHref } from './routes';
import { inFlightSubmissions, isTerminalSubmitError } from './pendingSync';
import { useResultStore } from './resultStore';
import {
  buildSubmitInput,
  changeItemWording,
  checkedCount,
  confirmItem,
  effectiveText,
  newParticipantItem,
  reviewSummary,
} from './reviewLogic';

type Editing = { kind: 'item'; id: string } | { kind: 'add' } | null;

export function ReviewScreen({ sessionId }: { sessionId: string }) {
  const review = useReview(sessionId);
  const conv = useConversation(sessionId);
  const updateItem = useUpdateReviewItem(sessionId);
  const submit = useSubmitReview();

  const [items, setItems] = useState<InterpretationItem[] | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [savedLocal, setSavedLocal] = useState(false);
  /** One key per review; restored from a saved submission so retries reuse it. */
  const keyRef = useRef<string | null>(null);

  // Seed the local copy once: a saved (unsent) submission wins over the server's proposal.
  useEffect(() => {
    if (!review.data || items !== null) return;
    let alive = true;
    pendingSubmissions
      .get(sessionId)
      .catch(() => null)
      .then((p) => {
        if (!alive) return;
        if (p) {
          keyRef.current = p.idempotencyKey;
          setSavedLocal(true);
          setItems(p.items);
        } else {
          setItems(review.data.items);
        }
      });
    return () => {
      alive = false;
    };
  }, [review.data, items, sessionId]);

  if (review.error) return <ErrorState error={review.error} onRetry={() => void review.refetch()} />;
  if (!review.data || items === null) return <ProcessingState />;

  const copy = review.data.copy;
  const session = conv.data;
  const mode = review.data.mode;
  const editingItem = editing?.kind === 'item' ? items.find((i) => i.id === editing.id) : undefined;

  const persist = (item: InterpretationItem, previous?: InterpretationItem) => {
    updateItem.mutateAsync(item).catch((e) => {
      // The server refused this change (e.g. wording not allowed): show what it decided.
      if (e instanceof CompanionApiError && !isNetworkError(e) && e.status >= 400 && e.status < 500) {
        setItems((cur) => (cur ? (previous ? cur.map((i) => (i.id === item.id ? previous : i)) : cur.filter((i) => i.id !== item.id)) : cur));
        showToast({ title: "Couldn't save that change", body: errorMessage(e) });
      }
      // Network failures are fine: the reviewed copy is what gets submitted.
    });
  };

  const onConfirm = (id: string) => {
    const previous = items.find((i) => i.id === id);
    const next = confirmItem(items, id);
    setItems(next);
    const updated = next.find((i) => i.id === id);
    if (previous && updated && updated !== previous) {
      track('review_item_changed', { mode, action: 'confirm' });
      persist(updated, previous);
    }
  };

  const onSaveWording = (text: string) => {
    if (!editing) return;
    if (editing.kind === 'add') {
      const added = newParticipantItem(sessionId, newId('item'), text);
      setItems([...items, added]);
      track('review_item_changed', { mode, action: 'add' });
      persist(added);
    } else {
      const previous = items.find((i) => i.id === editing.id);
      const next = changeItemWording(items, editing.id, text);
      setItems(next);
      const updated = next.find((i) => i.id === editing.id);
      if (previous && updated && updated !== previous) {
        track('review_item_changed', { mode, action: 'change' });
        persist(updated, previous);
      }
    }
    setEditing(null);
  };

  const finishLater = () => {
    showToast({ title: 'Saved on this device', body: 'Pick it up from Today whenever you like.' });
    router.replace('/today');
  };

  const send = async () => {
    if (sending) return;
    setSending(true);
    setSendError(null);
    const key = (keyRef.current ??= newIdempotencyKey());
    inFlightSubmissions.add(sessionId);
    try {
      // Saved BEFORE the call: if the app dies or the network drops mid-send, the
      // reviewed answers and the key survive and are retried on the same key.
      try {
        const prior = await pendingSubmissions.get(sessionId);
        await pendingSubmissions.save({ sessionId, idempotencyKey: key, items, savedAt: new Date().toISOString(), attempts: (prior?.attempts ?? 0) + 1 });
        setSavedLocal(true);
      } catch {
        // Secure storage unavailable: still send, without the local safety copy.
      }
      const result = await submit.mutateAsync(buildSubmitInput(sessionId, key, items));
      await pendingSubmissions.remove(sessionId).catch(() => {});
      await textDrafts.clear(sessionId).catch(() => {});

      const summary = reviewSummary(items);
      const elapsedMs = session?.startedAt ? Math.max(0, Date.parse(result.acknowledgedAt) - Date.parse(session.startedAt)) : undefined;
      useResultStore.getState().put(sessionId, { result, summary, elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : undefined });
      track('review_submitted', { mode, total: summary.total, confirmed: summary.confirmed, changed: summary.changed, unchecked: summary.unchecked });
      if (mode === 'PULSE') track('pulse_completed');

      if (mode === 'MEETING_WRAP_UP') {
        showToast({ title: 'Added to your commitments', body: "You'll find it in My Work." });
        router.replace((result.nextRoute ?? '/work') as Href);
      } else if (session) {
        router.replace(doneHref(session));
      } else {
        router.replace((result.nextRoute ?? '/today') as Href);
      }
    } catch (e) {
      if (isTerminalSubmitError(e)) await pendingSubmissions.remove(sessionId).catch(() => {});
      track('send_failed', { stage: 'submit', offline: isNetworkError(e), mode });
      setSendError(e);
      setSending(false);
    } finally {
      inFlightSubmissions.delete(sessionId);
    }
  };

  const total = items.length;
  const checked = checkedCount(items);
  const terminal = isTerminalSubmitError(sendError);

  return (
    <>
      <Screen
        footer={
          <BottomActionBar>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="small" color="faint" accessibilityLiveRegion="polite">
                {`${checked} of ${total} checked`}
              </Text>
              {savedLocal && sendError ? (
                <Text variant="small" color="sage" style={{ fontFamily: 'DMSans_500Medium' }}>
                  Saved on this device
                </Text>
              ) : null}
            </View>
            <Button label={sending ? 'Sending…' : sendError && !terminal ? 'Try again' : copy.submitLabel} kind="primary" onPress={() => void send()} loading={sending} disabled={terminal} />
            <Button label="Finish later" full onPress={finishLater} disabled={sending} />
          </BottomActionBar>
        }
      >
        <View style={{ marginBottom: 12 }}>
          <StatusChip label={copy.chip} tone="violet" />
        </View>
        <Heading style={{ marginBottom: 10 }}>{copy.title}</Heading>
        <Text variant="body" color="muted" style={{ marginBottom: 20 }}>
          {copy.subtitle}
        </Text>
        {items.map((item) => (
          <InterpretationCard key={item.id} item={item} onConfirm={() => onConfirm(item.id)} onChange={() => setEditing({ kind: 'item', id: item.id })} />
        ))}
        {review.data.canAddItems ? <AddItemButton onPress={() => setEditing({ kind: 'add' })} /> : null}
        {sendError ? (
          <View style={{ marginTop: 16 }}>
            <StatusPanel
              tone="red"
              assertive
              title="Couldn't send"
              body={terminal ? errorMessage(sendError) : "Your answers are saved on this phone. Try again when you have a connection — nothing is lost."}
            />
          </View>
        ) : null}
      </Screen>
      <EditWordingSheet
        visible={!!editing}
        initialText={editingItem ? effectiveText(editingItem) : ''}
        title={editing?.kind === 'add' ? 'Add something we missed' : 'Say it your way'}
        subtitle={editing?.kind === 'add' ? 'In your own words.' : 'Your wording replaces ours.'}
        saveLabel={editing?.kind === 'add' ? 'Add' : 'Save wording'}
        onCancel={() => setEditing(null)}
        onSave={onSaveWording}
      />
    </>
  );
}

/** While the server turns the answers into plain sentences (prototype `isProcessing`). */
function ProcessingState() {
  return (
    <Screen>
      <View accessibilityLiveRegion="polite" style={{ paddingTop: 18 }}>
        <Text variant="title" accessibilityRole="header" style={{ marginBottom: 8 }}>
          Putting it together…
        </Text>
        <Text variant="meta" color="muted" style={{ marginBottom: 26, fontSize: 15, lineHeight: 22 }}>
          Turning what you said into plain sentences you can check.
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} delay={i * 200} />
        ))}
      </View>
    </Screen>
  );
}

function Skeleton({ delay }: { delay: number }) {
  const c = useColors();
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0.5)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 650, delay, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(v, { toValue: 0.5, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, delay, v]);
  return <Animated.View style={{ height: 86, borderRadius: radius.card, backgroundColor: c.soft, opacity: v }} />;
}
