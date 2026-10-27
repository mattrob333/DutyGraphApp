import { useLocalSearchParams } from "expo-router";
import { TaskCheckScreen } from "@/features/taskCards/TaskCheckScreen";
import { WrapUpScreen } from '@/features/participantExtras/WrapUpScreen';
export default function ConfirmationRoute() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  if (requestId.startsWith('wrapup:')) return <WrapUpScreen id={requestId.slice(7)} />;
  return <TaskCheckScreen requestId={requestId} />;
}
