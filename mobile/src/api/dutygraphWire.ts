/** These aliases come only from the actual V2 server's separately served contracts. */
import type { operations as Advisor } from "./generated/advisor-mobile-v1";
import type { operations as Extras } from "./generated/participant-extras-v1";
type Success<T> = T extends { responses: infer Responses }
  ? {
      [
        Status in keyof Responses
      ]: `${Status & (string | number)}` extends `2${string}`
        ? Responses[Status] extends {
            content: { "application/json": infer Body };
          }
          ? Body
          : never
        : never;
    }[keyof Responses]
  : never;
type Body<T> = T extends {
  requestBody: { content: { "application/json": infer Input } };
}
  ? Input
  : never;
export type AdvisorSessionWire = Success<
  Advisor["post_api_mobile_meetings_v1_advisor_pair"]
>;
export type MeetingWire = Success<
  Advisor["get_api_mobile_meetings_v1_meetings_id"]
>;
export type SessionWire = Success<
  Advisor["get_api_mobile_meetings_v1_sessions_id"]
>;
export type PeopleWire = Success<Advisor["get_api_mobile_meetings_v1_people"]>;
export type MeetingRouteWire = Body<
  Advisor["post_api_mobile_meetings_v1_meetings_id_route"]
>;
export type PulseWire = Success<Extras["get_api_mobile_v1x_pulses_id"]>;
export type ConfigWire = Success<Extras["get_api_mobile_v1x_config"]>;
