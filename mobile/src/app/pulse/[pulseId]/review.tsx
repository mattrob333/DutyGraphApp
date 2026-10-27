import { useLocalSearchParams } from "expo-router";
import { ReviewScreen } from "@/features/handsfree/ReviewScreen";
import { pulseRequestId } from "@/api/extras";
export default function PulseReviewRoute() {
  const { pulseId } = useLocalSearchParams<{ pulseId: string }>();
  return <ReviewScreen requestId={pulseRequestId(pulseId)} />;
}
