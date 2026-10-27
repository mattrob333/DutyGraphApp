import AVFoundation

/** All writes are bounded chunks from the existing capture; an NSLock serializes lifecycle calls. */
final class PcmWavBackups {
  private let lock = NSLock()
  private let directory: URL
  private var group: String?
  private var file: URL?
  private var writer: FileHandle?
  private var dataBytes = 0
  private let maximumBytes = 24000 * 2 * 300

  init() {
    directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("dutygraph-pcm-backups", isDirectory: true)
  }

  func begin(_ id: String) throws {
    lock.lock(); defer { lock.unlock() }
    guard id.range(of: "^[A-Za-z0-9_]{1,80}$", options: .regularExpression) != nil else { throw failure("Invalid backup identifier") }
    try closeFile()
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    var backupValues = URLResourceValues()
    backupValues.isExcludedFromBackup = true
    var protectedDirectory = directory
    try protectedDirectory.setResourceValues(backupValues)
    group = id
    try openNext()
  }

  func append(_ samples: UnsafePointer<Float>, count: Int) throws {
    lock.lock(); defer { lock.unlock() }
    guard writer != nil else { return }
    if dataBytes + count * 2 > maximumBytes { try closeFile(); try openNext() }
    var data = Data(capacity: count * 2)
    for index in 0..<count {
      guard samples[index].isFinite else { throw failure("Invalid PCM sample") }
      let value = max(-1, min(1, samples[index]))
      let scaled = Int16((value * (value < 0 ? 32768 : 32767)).rounded())
      var sample = scaled.littleEndian
      withUnsafeBytes(of: &sample) { data.append(contentsOf: $0) }
    }
    try writer?.write(contentsOf: data)
    dataBytes += data.count
  }

  func finish(_ id: String? = nil) throws {
    lock.lock(); defer { lock.unlock() }
    if let id, group != id { return }
    try closeFile()
    group = nil
  }

  func collect(_ id: String? = nil) throws -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
    return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey]).sorted { $0.lastPathComponent < $1.lastPathComponent }.compactMap { source in
      guard source.pathExtension == "wav", source != file else { return nil }
      let identifier = source.lastPathComponent.components(separatedBy: "--")[0]
      if let group, group == identifier { return nil }
      if let id, id != identifier { return nil }
      let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard size >= 44 else { return nil }
      let length = (size - 44) / 2 * 2
      let output = try FileHandle(forWritingTo: source)
      try output.seek(toOffset: 0)
      try output.write(contentsOf: header(length))
      try output.close()
      return ["id": source.deletingPathExtension().lastPathComponent, "groupId": identifier, "uri": source.absoluteString, "durationMs": length * 1000 / 48000, "bytes": length + 44]
    }
  }

  func clear() throws {
    lock.lock(); defer { lock.unlock() }
    try closeFile()
    group = nil
    if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
  }

  private func openNext() throws {
    guard let group else { return }
    let source = directory.appendingPathComponent("\(group)--\(Int(Date().timeIntervalSince1970 * 1000))--\(UUID().uuidString).wav")
    guard FileManager.default.createFile(atPath: source.path, contents: header(0), attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]) else { throw failure("A recording backup could not be created") }
    writer = try FileHandle(forWritingTo: source)
    try writer?.seekToEnd()
    file = source
    dataBytes = 0
  }

  private func closeFile() throws {
    guard let output = writer else { return }
    defer { try? output.close(); writer = nil; file = nil; dataBytes = 0 }
    try output.seek(toOffset: 0)
    try output.write(contentsOf: header(dataBytes))
    try output.synchronize()
  }

  private func header(_ length: Int) -> Data {
    var result = Data()
    func text(_ value: String) { result.append(value.data(using: .ascii)!) }
    func word(_ value: UInt16) { var little = value.littleEndian; withUnsafeBytes(of: &little) { result.append(contentsOf: $0) } }
    func integer(_ value: UInt32) { var little = value.littleEndian; withUnsafeBytes(of: &little) { result.append(contentsOf: $0) } }
    text("RIFF"); integer(UInt32(length + 36)); text("WAVEfmt "); integer(16); word(1); word(1)
    integer(24000); integer(48000); word(2); word(16); text("data"); integer(UInt32(length))
    return result
  }

  private func failure(_ text: String) -> NSError { NSError(domain: "DutyGraphPcmBackup", code: 1, userInfo: [NSLocalizedDescriptionKey: text]) }
}
