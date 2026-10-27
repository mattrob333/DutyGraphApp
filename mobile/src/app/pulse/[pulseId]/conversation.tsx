import { useLocalSearchParams } from "expo-router";
import { DeckScreen } from "@/features/handsfree/DeckScreen";
import { pulseRequestId } from "@/api/extras";
export default function PulseConversationRoute() {
  const { pulseId, mode } = useLocalSearchParams<{
    pulseId: string;
    mode?: string;
  }>();
  return (
    <DeckScreen
      requestId={pulseRequestId(pulseId)}
      mode={mode === "voice" ? "voice" : "text"}
    />
  );
}
