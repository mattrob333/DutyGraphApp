import { useLocalSearchParams } from "expo-router";
import { WrapUpScreen } from "@/features/participantExtras/WrapUpScreen";
/** Only this participant's owned or attributed items are returned by the repository. */
export default function MeetingWrapUpScreen() {
  const { meetingId } = useLocalSearchParams<{ meetingId: string }>();
  return <WrapUpScreen id={meetingId} />;
}
