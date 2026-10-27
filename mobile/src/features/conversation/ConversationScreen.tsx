/**
 * The conversation: DutyGraph asks, the participant answers by voice or text.
 *
 * The server owns the conversation (turn order, follow-ups, when review is
 * ready). This screen renders `useConversation`, sends each answer with a
 * client-generated utterance id (so a retry can never duplicate a turn), and
 * uses the pure view-state machine for what the phone itself is doing.
 *
 * Microphone rules (PRD 13): it opens only after the participant chose voice,
 * and is released on Pause, when they type instead, when the screen loses
 * focus or unmounts, and when the app leaves the foreground.
 */
import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AppState, Linking, Platform, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useColors } from '@/theme';
import { BottomActionBar, Button, ErrorState, LoadingState, Screen, Text, errorMessage } from '@/components/common';
import {
  AcknowledgementLine,
  AgentPromptBubble,
  LiveTranscript,
  ParticipantBubble,
  StatusPanel,
  TextComposer,
  ThinkingIndicator,
  VoiceControls,
  type VoiceControlsMode,
} from '@/components/voice';
import { useConversation, useSendTurn, isNetworkError } from '@/hooks/queries';
import { useVoiceCapture, VoiceError } from '@/features/voice';
import { usePreferencesStore } from '@/state/preferences';
import { showToast } from '@/state/ui';
import { textDrafts } from '@/storage/drafts';
import { track } from '@/analytics/events';
import { newId } from '@/utils/id';
import { initialViewState, transition, type InputMode } from './machine';
import { doneHref, reviewHref } from './routes';

export interface ConversationScreenProps {
  sessionId: string;
  /** From the route's `input` param. Voice is only honoured once the participant consented. */
  initialInput: InputMode;
}

const AGENT_DELAY_VOICE_MS = 900;
const AGENT_DELAY_TEXT_MS = 350;
const CLOSING_MS = 1400;

export function ConversationScreen({ sessionId, initialInput }: ConversationScreenProps) {
  const c = useColors();
  const { data: session, error, isPending, refetch } = useConversation(sessionId);
  const sendTurn = useSendTurn();
  const capture = useVoiceCapture(sessionId);
  const micConsented = usePreferencesStore((s) => s.micConsented);

  const [vs, dispatch] = useReducer(
    transition,
    initialInput,
    (i) => initialViewState(i === 'voice' && usePreferencesStore.getState().micConsented ? 'voice' : 'text'),
  );
  const [typed, setTyped] = useState('');
  /** Transcript from a recorded clip, shown for the participant to check before sending. */
  const [heard, setHeard] = useState<string | null>(null);
  const [liveText, setLiveText] = useState('');
  const [transcribing, setTranscribing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const vsRef = useRef(vs);
  vsRef.current = vs;
  const typedRef = useRef(typed);
  typedRef.current = typed;
  const capturing = useRef(false);
  const inFlight = useRef<string | null>(null);
  const sourceRef = useRef<'VOICE' | 'TEXT'>('TEXT');
  const skipDraftFlush = useRef(false);
  const wantsVoice = useRef(false);
  const seenUtterances = useRef<Set<string> | null>(null);

  const lastUtterance = session?.utterances[session.utterances.length - 1];
  const agentAsked = !!lastUtterance && lastUtterance.speaker === 'DUTYGRAPH' && lastUtterance.kind !== 'ACKNOWLEDGEMENT';

  // --- Drafts -------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    textDrafts
      .get(sessionId)
      .then((t) => {
        if (!alive || !t) return;
        setTyped((cur) => cur || t);
        // A saved typed answer means they were typing; do not open the microphone over it.
        if (vsRef.current.inputMode === 'voice') dispatch({ type: 'SWITCH_TO_TEXT' });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const t = setTimeout(() => void textDrafts.set(sessionId, typed).catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [typed, sessionId]);

  useEffect(
    () => () => {
      if (!skipDraftFlush.current) void textDrafts.set(sessionId, typedRef.current).catch(() => {});
    },
    [sessionId],
  );

  // --- Server state → navigation -----------------------------------------
  useEffect(() => {
    if (!session || vs.phase === 'sending' || vs.phase === 'closing') return;
    if (session.state === 'REVIEW_READY' || session.state === 'REVIEWING') router.replace(reviewHref(session));
    else if (session.state === 'SUBMITTED') router.replace(doneHref(session));
  }, [session, vs.phase]);

  useEffect(() => {
    if (vs.phase !== 'closing' || !session) return;
    const t = setTimeout(() => router.replace(reviewHref(session)), CLOSING_MS);
    return () => clearTimeout(t);
  }, [vs.phase, session]);

  // --- DutyGraph's question is shown, then the answer opens ---------------
  useEffect(() => {
    if (vs.phase !== 'prompting' || !agentAsked) return;
    const t = setTimeout(() => dispatch({ type: 'AGENT_SHOWN' }), vs.inputMode === 'voice' ? AGENT_DELAY_VOICE_MS : AGENT_DELAY_TEXT_MS);
    return () => clearTimeout(t);
  }, [vs.phase, vs.inputMode, agentAsked, lastUtterance?.id]);

  // --- Follow-up analytics (no text) ---------------------------------------
  useEffect(() => {
    if (!session) return;
    if (!seenUtterances.current) {
      seenUtterances.current = new Set(session.utterances.map((u) => u.id));
      return;
    }
    for (const u of session.utterances) {
      if (seenUtterances.current.has(u.id)) continue;
      seenUtterances.current.add(u.id);
      if (u.speaker === 'DUTYGRAPH' && u.kind === 'FOLLOW_UP') track('follow_up_asked', { mode: session.mode });
    }
  }, [session]);

  // --- Microphone ------------------------------------------------------------
  useEffect(() => capture.onPartial(setLiveText), [capture]);

  const voiceOpen = vs.inputMode === 'voice' && (vs.phase === 'answering' || vs.phase === 'paused');
  useEffect(() => {
    if (voiceOpen && vs.phase === 'answering' && heard === null && !transcribing && !capturing.current) {
      capturing.current = true;
      capture.start().catch((e) => {
        capturing.current = false;
        if (!(e instanceof VoiceError) || e.code !== 'TRANSCRIPTION_FAILED') dispatch({ type: 'MIC_DENIED' });
      });
    }
    if (!voiceOpen && capturing.current) {
      capturing.current = false;
      capture.cancel();
      setLiveText('');
    }
  }, [voiceOpen, vs.phase, heard, transcribing, capture]);

  // Seconds of active listening.
  useEffect(() => {
    if (!(vs.phase === 'answering' && vs.inputMode === 'voice' && heard === null && !transcribing)) return;
    const t = setInterval(() => dispatch({ type: 'TICK', seconds: 1 }), 1000);
    return () => clearInterval(t);
  }, [vs.phase, vs.inputMode, heard, transcribing]);

  /** Stops listening without losing what was heard. Used for Pause, app background and losing focus. */
  const pauseIfListening = useCallback(() => {
    const s = vsRef.current;
    if (s.inputMode === 'voice' && s.phase === 'answering' && capturing.current) {
      capture.pause();
      dispatch({ type: 'PAUSE' });
    }
  }, [capture]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') pauseIfListening();
    });
    return () => sub.remove();
  }, [pauseIfListening]);
  useFocusEffect(useCallback(() => () => pauseIfListening(), [pauseIfListening]));

  // Returning from the consent screen after "Use voice".
  useEffect(() => {
    if (micConsented && wantsVoice.current) {
      wantsVoice.current = false;
      dispatch({ type: 'SWITCH_TO_VOICE' });
    }
  }, [micConsented]);

  // --- Sending a turn ---------------------------------------------------------
  const mutateRef = useRef(sendTurn.mutateAsync);
  mutateRef.current = sendTurn.mutateAsync;
  useEffect(() => {
    if (vs.phase !== 'sending' || !vs.pendingUtteranceId || !vs.pendingText) return;
    const id = vs.pendingUtteranceId;
    if (inFlight.current === id) return;
    inFlight.current = id;
    mutateRef
      .current({ sessionId, utteranceId: id, text: vs.pendingText, source: sourceRef.current })
      .then((res) => {
        inFlight.current = null;
        setTyped('');
        setHeard(null);
        void textDrafts.clear(sessionId).catch(() => {});
        dispatch({ type: 'TURN_ACK', reviewReady: res.reviewReady });
      })
      .catch((e) => {
        inFlight.current = null;
        const offline = isNetworkError(e);
        track('send_failed', { stage: 'turn', offline });
        dispatch({ type: 'TURN_FAILED', reason: offline ? 'offline' : 'provider' });
      });
  }, [vs.phase, vs.pendingUtteranceId, vs.pendingText, sessionId]);

  const sendAnswer = (text: string, source: 'VOICE' | 'TEXT') => {
    const t = text.trim();
    if (!t) return;
    // Re-sending the same words after a failure keeps the same id, so the server can dedupe.
    const id = vs.pendingUtteranceId && vs.pendingText === t ? vs.pendingUtteranceId : newId('utt');
    sourceRef.current = source;
    dispatch({ type: 'SUBMIT_ANSWER', utteranceId: id, text: t });
  };

  const doneAnswering = async () => {
    if (transcribing) return;
    setTranscribing(true);
    try {
      const res = await capture.stop();
      capturing.current = false;
      setLiveText('');
      if (!res) {
        showToast({ title: "We didn't catch that", body: 'Try again, or type your answer instead.' });
        return;
      }
      if (capture.hasLivePartials) sendAnswer(res.text, 'VOICE');
      else setHeard(res.text);
    } catch (e) {
      capturing.current = false;
      setLiveText('');
      showToast({ title: "Couldn't transcribe that", body: e instanceof VoiceError ? 'Try again, or type your answer instead.' : errorMessage(e) });
    } finally {
      setTranscribing(false);
    }
  };

  const switchToText = () => {
    const carry = heard ?? liveText;
    if (carry) setTyped((cur) => cur || carry);
    setHeard(null);
    if (vs.inputMode === 'voice') track('voice_switched_to_text', { mode: session?.mode });
    dispatch({ type: 'SWITCH_TO_TEXT' });
  };

  const chooseVoice = () => {
    if (!micConsented) {
      wantsVoice.current = true;
      router.push({ pathname: '/permissions/microphone', params: { sessionId, return: '1' } });
      return;
    }
    dispatch({ type: 'SWITCH_TO_VOICE' });
  };

  const continueByTyping = () => {
    if (vs.pendingText) setTyped(vs.pendingText);
    if (vs.inputMode === 'voice') track('voice_switched_to_text', { mode: session?.mode });
    dispatch({ type: 'SWITCH_TO_TEXT' });
  };

  const saveAndFinishLater = () => {
    const draft = vs.pendingText ?? (heard || typed);
    skipDraftFlush.current = true;
    void textDrafts.set(sessionId, draft ?? '').catch(() => {});
    showToast({ title: 'Saved on this device', body: 'Pick it up from Today whenever you like.' });
    router.replace('/today');
  };

  // --- Render ----------------------------------------------------------------
  if (isPending) return <LoadingState label="Opening your conversation…" />;
  if (error || !session) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const utterances = [...session.utterances].sort((a, b) => a.sequence - b.sequence);
  const lastAgentIndex = utterances.map((u) => u.speaker === 'DUTYGRAPH' && u.kind !== 'ACKNOWLEDGEMENT').lastIndexOf(true);
  const pendingVisible =
    (vs.phase === 'sending' || vs.phase === 'offlineDraft' || vs.phase === 'providerError') &&
    !!vs.pendingText &&
    !utterances.some((u) => u.id === vs.pendingUtteranceId);
  const listening = vs.inputMode === 'voice' && vs.phase === 'answering';
  const paused = vs.inputMode === 'voice' && vs.phase === 'paused';
  const showLive = vs.inputMode === 'voice' && (listening || paused) && heard === null;

  const voiceMode: VoiceControlsMode =
    vs.phase === 'sending' || vs.phase === 'closing' || transcribing ? 'busy' : paused ? 'paused' : listening ? 'listening' : 'idle';
  const liveLabel = transcribing ? 'Transcribing…' : paused ? 'Paused' : 'Listening…';
  const liveHint = transcribing
    ? 'This can take a few seconds.'
    : capture.hasLivePartials
      ? 'Go ahead — your words will appear here.'
      : "Speak when you're ready. We'll turn it into text when you tap Done answering.";

  let footer: React.ReactNode;
  if (vs.phase === 'micError') {
    footer = (
      <BottomActionBar>
        <StatusPanel tone="red" title="Microphone is blocked" body="Voice answers aren't available right now. Typing works just as well — DutyGraph treats your answer exactly the same." assertive />
        <Button label="Type my answer instead" kind="primary" onPress={switchToText} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Try again" full onPress={() => dispatch({ type: 'RETRY' })} style={{ flex: 1 }} />
          {Platform.OS !== 'web' ? <Button label="Open settings" full onPress={() => void Linking.openSettings()} style={{ flex: 1 }} /> : null}
        </View>
      </BottomActionBar>
    );
  } else if (vs.phase === 'offlineDraft') {
    footer = (
      <BottomActionBar>
        <StatusPanel tone="amber" title="No connection" body="Your answer is saved on this phone. Send it when you're back online." assertive />
        <Button label="Try again" kind="primary" onPress={() => dispatch({ type: 'RETRY' })} />
        <Button label="Save and finish later" full onPress={saveAndFinishLater} />
      </BottomActionBar>
    );
  } else if (vs.phase === 'providerError') {
    footer = (
      <BottomActionBar>
        <StatusPanel tone="red" title="That didn't go through" body="DutyGraph couldn't process your answer just now. Your answer is still here." assertive />
        <Button label="Retry" kind="primary" onPress={() => dispatch({ type: 'RETRY' })} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button label="Continue by typing" full onPress={continueByTyping} style={{ flex: 1 }} />
          <Button label="Save and finish later" full onPress={saveAndFinishLater} style={{ flex: 1 }} />
        </View>
      </BottomActionBar>
    );
  } else if (vs.inputMode === 'voice' && heard === null) {
    footer = (
      <BottomActionBar>
        <VoiceControls
          mode={voiceMode}
          seconds={vs.listeningSeconds}
          doneLabel={vs.phase === 'closing' ? 'Wrapping up…' : undefined}
          onPause={pauseIfListening}
          onResume={() => {
            capture.resume();
            dispatch({ type: 'RESUME' });
          }}
          onDone={() => void doneAnswering()}
          onTypeInstead={switchToText}
        />
      </BottomActionBar>
    );
  } else if (vs.inputMode === 'voice' && heard !== null) {
    footer = (
      <BottomActionBar>
        <Text variant="meta" color="muted" accessibilityLiveRegion="polite">
          Here's what we heard. Fix anything, then send it.
        </Text>
        <TextComposer
          value={heard}
          onChange={setHeard}
          onSend={() => sendAnswer(heard, 'VOICE')}
          sendDisabled={!heard.trim() || vs.phase !== 'answering'}
          voiceLabel="Record again"
          voiceAccessibilityLabel="Record your answer again"
          onUseVoice={() => setHeard(null)}
          accessibilityLabel="What we heard"
        />
      </BottomActionBar>
    );
  } else {
    const ready = vs.phase === 'answering';
    footer = (
      <BottomActionBar>
        <TextComposer
          value={vs.phase === 'sending' || vs.phase === 'closing' ? '' : typed}
          onChange={setTyped}
          editable={ready}
          onSend={() => sendAnswer(typed, 'TEXT')}
          sendLabel={ready ? 'Send answer' : vs.phase === 'sending' ? 'Understanding…' : vs.phase === 'closing' ? 'Wrapping up…' : 'Waiting…'}
          sendDisabled={!ready || !typed.trim()}
          onUseVoice={ready || vs.phase === 'prompting' ? chooseVoice : undefined}
        />
      </BottomActionBar>
    );
  }

  return (
    <Screen scroll={false} footer={footer}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            marginHorizontal: 20,
            marginTop: 18,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: c.line,
          }}
        >
          <Text variant="bodyStrong" accessibilityRole="header" style={{ fontSize: 15, flexShrink: 1 }}>
            {session.title}
          </Text>
          <Text variant="small" color="faint" style={{ flexShrink: 0 }}>
            {`Question ${session.progress.current} of ${session.progress.total}`}
          </Text>
        </View>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {utterances.map((u, i) => {
            if (u.speaker === 'PARTICIPANT') return <ParticipantBubble key={u.id} text={u.text} />;
            if (u.kind === 'ACKNOWLEDGEMENT') return <AcknowledgementLine key={u.id} text={u.text} />;
            return <AgentPromptBubble key={u.id} text={u.text} kind={u.kind} live={i === lastAgentIndex} />;
          })}
          {pendingVisible ? <ParticipantBubble text={vs.pendingText!} pending /> : null}
          {showLive ? <LiveTranscript label={liveLabel} text={liveText} emptyHint={liveHint} /> : null}
          {vs.phase === 'sending' ? <ThinkingIndicator /> : null}
          {vs.phase === 'closing' ? <ThinkingIndicator label="Wrapping up…" /> : null}
        </ScrollView>
      </View>
    </Screen>
  );
}
