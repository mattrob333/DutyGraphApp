import { createVoiceOut } from "@/features/voice/out";
import { getAdvisorRepository } from "@/api/advisor";
import { advisorTokens } from "@/storage/advisor";
import { config } from "@/api/config";
import { newIdempotencyKey } from "@/utils/id";
/** Server TTS uses the advisor credential. Missing audio falls back to device speech. */
export function createAdvisorVoiceOut() {
  const repository = getAdvisorRepository();
  return createVoiceOut({
    ...(repository.kind === "http"
      ? {
          repository: {
            getVoiceLines: (input) =>
              repository.voiceLines(
                { lines: input.lines, speed: input.speed },
                newIdempotencyKey(),
              ),
          },
        }
      : {}),
    allowedAudioOrigin: config.meetingsApiBaseUrl,
    downloadHeaders: async (): Promise<Record<string, string>> => {
      const session = await advisorTokens.get();
      return session ? { Authorization: `Bearer ${session.accessToken}` } : {};
    },
  });
}
