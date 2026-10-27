/**
 * Product analytics (PRD 29). Events carry ids and counts, never the
 * participant's words, transcripts or tokens. The default sink logs event
 * names in development only; wire a real sink in `setAnalyticsSink`.
 */
export type AnalyticsEvent =
  | 'request_viewed'
  | 'pulse_started'
  | 'pulse_completed'
  | 'voice_started'
  | 'voice_switched_to_text'
  | 'follow_up_asked'
  | 'review_item_changed'
  | 'review_submitted'
  | 'meeting_avoided_viewed'
  | 'meeting_shortened_viewed'
  | 'premeeting_brief_viewed'
  | 'commitment_confirmed'
  | 'commitment_completed'
  | 'clarification_completed'
  | 'something_changed_submitted'
  | 'send_failed';

export type AnalyticsProps = Record<string, string | number | boolean | undefined>;
type Sink = (event: AnalyticsEvent, props: AnalyticsProps) => void;

let sink: Sink = (event, props) => {
  if (__DEV__) console.debug('[analytics]', event, props);
};

export function setAnalyticsSink(s: Sink) {
  sink = s;
}

export function track(event: AnalyticsEvent, props: AnalyticsProps = {}) {
  try {
    sink(event, props);
  } catch {
    // Analytics must never break a participant flow.
  }
}
