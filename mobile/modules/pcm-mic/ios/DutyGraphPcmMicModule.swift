import AVFoundation
import ExpoModulesCore

/** Foreground PCM capture. Device routing, Bluetooth, and echo cancellation still need device QA. */
public class DutyGraphPcmMicModule: Module {
  private var engine: AVAudioEngine?
  private var observer: NSObjectProtocol?
  private var generation = 0
  private let stateLock = NSLock()
  private let backups = PcmWavBackups()
  private let conversionQueue = DispatchQueue(label: "com.dutygraph.pcm-conversion")

  public func definition() -> ModuleDefinition {
    Name("DutyGraphPcmMic")
    Constant("isSupported") { true }
    Events("samples", "error")
    AsyncFunction("startAsync") { (runId: Int) throws in
      try self.startCapture(runId: runId)
    }.runOnQueue(.main)
    AsyncFunction("stopAsync") {
      self.stopCapture()
    }.runOnQueue(.main)
    AsyncFunction("beginBackupAsync") { (id: String) throws in try self.backups.begin(id) }
    AsyncFunction("finishBackupAsync") { (id: String) throws -> [[String: Any]] in
      try self.backups.finish(id)
      return try self.backups.collect(id)
    }
    AsyncFunction("recoverBackupsAsync") { () throws -> [[String: Any]] in try self.backups.collect() }
    AsyncFunction("clearBackupsAsync") { () throws in self.stopCapture(); try self.backups.clear() }.runOnQueue(.main)
    OnAppEntersBackground { self.stopCapture() }
    OnDestroy { DispatchQueue.main.async { self.stopCapture() } }
  }

  private func startCapture(runId: Int) throws {
    stopCapture()
    let session = AVAudioSession.sharedInstance()
    guard session.recordPermission == .granted else {
      throw captureError("Microphone permission is required")
    }
    var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
#if compiler(>=6.2)
    options.insert(.allowBluetoothHFP)
#else
    options.insert(.allowBluetooth)
#endif
    try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
    try session.setPreferredSampleRate(24000)
    try session.setPreferredIOBufferDuration(0.1)
    try session.setActive(true)
    let current = AVAudioEngine()
    let input = current.inputNode
    if input.isVoiceProcessingEnabled == false {
      // Unsupported processing is a capability failure, so JS can release and choose device speech.
      try input.setVoiceProcessingEnabled(true)
      try current.outputNode.setVoiceProcessingEnabled(true)
    }
    let source = input.outputFormat(forBus: 0)
    guard source.sampleRate > 0,
          let mono = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 24000, channels: 1, interleaved: false),
          let converter = AVAudioConverter(from: source, to: mono) else {
      throw captureError("Microphone PCM conversion is unavailable")
    }
    stateLock.lock()
    let token = generation
    stateLock.unlock()
    engine = current
    input.installTap(onBus: 0, bufferSize: AVAudioFrameCount(max(1, source.sampleRate / 10)), format: source) { [weak self] buffer, _ in
      guard let self, let copied = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return }
      copied.frameLength = buffer.frameLength
      let sourceBuffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
      let copiedBuffers = UnsafeMutableAudioBufferListPointer(copied.mutableAudioBufferList)
      for index in 0..<sourceBuffers.count {
        if let from = sourceBuffers[index].mData, let to = copiedBuffers[index].mData {
          memcpy(to, from, Int(sourceBuffers[index].mDataByteSize))
        }
      }
      self.conversionQueue.async { [weak self] in
        guard let self, self.isCurrent(token) else { return }
        let capacity = AVAudioFrameCount(ceil(Double(copied.frameLength) * 24000 / source.sampleRate) + 16)
        guard let output = AVAudioPCMBuffer(pcmFormat: mono, frameCapacity: capacity) else { return }
        var supplied = false
        var error: NSError?
        let status = converter.convert(to: output, error: &error) { _, inputStatus in
          if supplied { inputStatus.pointee = .noDataNow; return nil }
          supplied = true
          inputStatus.pointee = .haveData
          return copied
        }
        if status == .error {
          DispatchQueue.main.async { [weak self] in self?.fail(runId: runId, token: token) }
          return
        }
        guard output.frameLength > 0, let samples = output.floatChannelData?[0] else { return }
        do { try self.backups.append(samples, count: Int(output.frameLength)) }
        catch { DispatchQueue.main.async { [weak self] in self?.fail(runId: runId, token: token) }; return }
        let values = Array(UnsafeBufferPointer(start: samples, count: Int(output.frameLength))).map { Double($0) }
        guard self.isCurrent(token) else { return }
        self.sendEvent("samples", ["runId": runId, "sampleRate": 24000, "samples": values])
      }
    }
    observer = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] notification in
      guard let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            type == AVAudioSession.InterruptionType.began.rawValue else { return }
      self?.fail(runId: runId, token: token, code: "interrupted")
    }
    do {
      current.prepare()
      try current.start()
    } catch {
      stopCapture()
      throw error
    }
  }

  private func fail(runId: Int, token: Int, code: String = "capture_failed") {
    guard isCurrent(token) else { return }
    sendEvent("error", ["runId": runId, "code": code])
    stopCapture()
  }

  private func stopCapture() {
    stateLock.lock()
    generation += 1
    stateLock.unlock()
    if let observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    engine?.inputNode.removeTap(onBus: 0)
    engine?.stop()
    engine = nil
    try? backups.finish()
    // Do not deactivate a shared audio session while the meeting evidence recorder is active.
  }

  private func isCurrent(_ token: Int) -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return generation == token
  }

  private func captureError(_ message: String) -> NSError {
    NSError(domain: "DutyGraphPcmMic", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}
