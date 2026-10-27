import type { PcmCapture } from "./openai";
/** Browser capture is user initiated; every track and audio node is released on stop/failure. */
export function createBrowserPcmCapture(): PcmCapture {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  const stop = async () => {
    processor?.disconnect();
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    processor = null;
    source = null;
    stream = null;
    if (context) await context.close().catch(() => {});
    context = null;
  };
  return {
    available:
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof AudioContext !== "undefined",
    async start(onSamples) {
      await stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });
        context = new AudioContext();
        await context.resume();
        source = context.createMediaStreamSource(stream);
        // ScriptProcessor is retained as a compatible fallback; output is always zeros.
        processor = context.createScriptProcessor(4096, 1, 1);
        const rate = context.sampleRate;
        processor.onaudioprocess = (event) =>
          onSamples(
            new Float32Array(event.inputBuffer.getChannelData(0)),
            rate,
          );
        source.connect(processor);
        processor.connect(context.destination);
      } catch (error) {
        await stop();
        throw error;
      }
    },
    stop,
  };
}
