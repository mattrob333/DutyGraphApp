package com.dutygraph.pcmmic

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.concurrent.thread
import kotlin.math.max

/** The module owns one foreground microphone. Encoded backup recorders must not run alongside it. */
class DutyGraphPcmMicModule : Module() {
  @Volatile private var recorder: AudioRecord? = null
  @Volatile private var generation = 0
  private var worker: Thread? = null
  private var backups: PcmWavBackups? = null
  private var echoCanceler: AcousticEchoCanceler? = null
  private var noiseSuppressor: NoiseSuppressor? = null

  override fun definition() = ModuleDefinition {
    Name("DutyGraphPcmMic")
    Constant("isSupported") { true }
    Events("samples", "error")

    AsyncFunction("startAsync") { runId: Int -> startCapture(runId) }
    AsyncFunction("stopAsync") { stopCapture() }
    AsyncFunction("beginBackupAsync") { id: String -> backupStore().begin(id) }
    AsyncFunction("finishBackupAsync") { id: String -> backupStore().apply { finish(id) }.collect(id) }
    AsyncFunction("recoverBackupsAsync") { backupStore().collect() }
    AsyncFunction("clearBackupsAsync") { stopCapture(); backupStore().clear() }

    OnActivityEntersBackground { stopCapture() }
    OnDestroy { stopCapture() }
  }

  @Synchronized
  private fun startCapture(runId: Int) {
    stopCapture()
    val context = appContext.reactContext ?: throw IllegalStateException("The app is unavailable")
    check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      "Microphone permission is required"
    }
    val rate = 24000
    val minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minimum > 0) { "24 kHz microphone capture is unavailable on this device" }
    val current = AudioRecord.Builder()
      .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
      .setAudioFormat(AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(rate)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build())
      .setBufferSizeInBytes(max(minimum * 2, 9600))
      .build()
    if (current.state != AudioRecord.STATE_INITIALIZED) {
      current.release()
      throw IllegalStateException("The microphone could not be initialized")
    }
    try {
      if (AcousticEchoCanceler.isAvailable()) echoCanceler = AcousticEchoCanceler.create(current.audioSessionId)?.apply { enabled = true }
      if (NoiseSuppressor.isAvailable()) noiseSuppressor = NoiseSuppressor.create(current.audioSessionId)?.apply { enabled = true }
      current.startRecording()
      check(current.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "The microphone did not start" }
      recorder = current
      val token = generation
      worker = thread(name = "DutyGraphPcmMic", isDaemon = true) {
        android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO)
        val frame = ShortArray(rate / 10)
        try {
          while (recorder === current && generation == token) {
            var used = 0
            while (used < frame.size && recorder === current && generation == token) {
              val count = current.read(frame, used, frame.size - used, AudioRecord.READ_BLOCKING)
              if (count < 0) throw IllegalStateException("Microphone read failed ($count)")
              if (count == 0) continue
              used += count
            }
            if (used > 0 && recorder === current && generation == token) {
              backups?.append(frame, used)
              // Expo's typed numeric arrays cross the event bridge; JS encodes PCM16 little-endian.
              sendEvent("samples", mapOf("runId" to runId, "sampleRate" to rate, "samples" to frame.take(used).map { it.toDouble() / 32768.0 }))
            }
          }
        } catch (_: Exception) {
          if (recorder === current && generation == token) {
            sendEvent("error", mapOf("runId" to runId, "code" to "capture_failed"))
            stopCapture()
          }
        }
      }
    } catch (error: Exception) {
      if (recorder === current) recorder = null
      try { current.stop() } catch (_: Exception) { }
      current.release()
      echoCanceler?.release(); echoCanceler = null
      noiseSuppressor?.release(); noiseSuppressor = null
      throw error
    }
  }

  @Synchronized
  private fun backupStore(): PcmWavBackups {
    val context = appContext.reactContext ?: throw IllegalStateException("The app is unavailable")
    return backups ?: PcmWavBackups(java.io.File(context.noBackupFilesDir, "dutygraph-pcm-backups")).also { backups = it }
  }

  @Synchronized
  private fun stopCapture() {
    generation += 1
    val current = recorder
    recorder = null
    try { current?.stop() } catch (_: Exception) { }
    current?.release()
    echoCanceler?.release(); echoCanceler = null
    noiseSuppressor?.release(); noiseSuppressor = null
    try { backups?.finish() } catch (_: Exception) { }
    worker?.interrupt()
    worker = null
  }
}
