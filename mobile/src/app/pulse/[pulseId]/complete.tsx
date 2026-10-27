import { router, useLocalSearchParams } from "expo-router";
import {
  BottomActionBar,
  Button,
  ErrorState,
  Heading,
  LoadingState,
  Screen,
  Text,
} from "@/components/common";
import { usePulse } from "@/hooks/queries";
export default function PulseCompleteRoute() {
  const { pulseId } = useLocalSearchParams<{ pulseId: string }>();
  const q = usePulse(pulseId);
  if (q.isPending) return <LoadingState />;
  if (q.isError || !q.data)
    return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const done = q.data.status === "COMPLETE";
  return (
    <Screen
      footer={
        <BottomActionBar>
          {done && q.data.teamStatusVisible ? (
            <Button
              label="See team status"
              kind="primary"
              onPress={() =>
                router.replace({
                  pathname: "/pulse/[pulseId]/team-status",
                  params: { pulseId },
                })
              }
            />
          ) : null}
          <Button
            label={done ? "Back to Today" : "Back to your Pulse"}
            full
            onPress={() =>
              router.replace(
                done
                  ? "/today"
                  : { pathname: "/pulse/[pulseId]", params: { pulseId } },
              )
            }
          />
        </BottomActionBar>
      }
    >
      <Heading>
        {done ? "Your Pulse is in. Thank you." : "Your Pulse is not sent yet"}
      </Heading>
      <Text color="muted">
        {done
          ? "You reviewed and sent this yourself."
          : "Review your answers and send when you are ready."}
      </Text>
    </Screen>
  );
}
