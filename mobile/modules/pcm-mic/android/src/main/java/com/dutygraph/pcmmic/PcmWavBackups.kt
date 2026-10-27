package com.dutygraph.pcmmic

import android.net.Uri
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/** Bounded disk tee from the capture frames: no second recorder and no whole-file buffer. */
internal class PcmWavBackups(private val directory: File) {
  private var group: String? = null
  private var file: File? = null
  private var writer: RandomAccessFile? = null
  private var dataBytes = 0
  private val maximumBytes = 24000 * 2 * 300

  @Synchronized fun begin(id: String) {
    require(id.matches(Regex("[A-Za-z0-9_]{1,80}"))) { "Invalid backup identifier" }
    finish()
    directory.mkdirs()
    group = id
    openNext()
  }

  @Synchronized fun append(samples: ShortArray, count: Int) {
    if (writer == null) return
    if (dataBytes + count * 2 > maximumBytes) { closeFile(); openNext() }
    val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (index in 0 until count) bytes.putShort(samples[index])
    writer!!.write(bytes.array())
    dataBytes += count * 2
  }

  @Synchronized fun finish(id: String? = null) {
    if (id != null && group != id) return
    closeFile()
    group = null
  }

  @Synchronized fun collect(id: String? = null): List<Map<String, Any>> {
    return directory.listFiles()?.filter { it.extension == "wav" && it != file }
      ?.sortedBy { it.name }?.mapNotNull { source ->
        val identifier = source.name.substringBefore("--")
        if (group != null && identifier == group) return@mapNotNull null
        if (id != null && identifier != id) return@mapNotNull null
        if (source.length() < 44) return@mapNotNull null
        // A killed process may leave an old header; file length is the retained PCM evidence.
        val length = ((source.length() - 44) / 2 * 2).toInt()
        RandomAccessFile(source, "rw").use { output -> output.seek(0); output.write(header(length)) }
        mapOf("id" to source.nameWithoutExtension, "groupId" to identifier, "uri" to Uri.fromFile(source).toString(), "durationMs" to length * 1000L / 48000, "bytes" to length + 44)
      } ?: emptyList()
  }

  @Synchronized fun clear() {
    finish()
    directory.listFiles()?.forEach { check(it.delete() || !it.exists()) { "A recording backup could not be removed" } }
  }

  private fun openNext() {
    val id = group ?: return
    val source = File(directory, "$id--${System.currentTimeMillis()}--${UUID.randomUUID()}.wav")
    writer = RandomAccessFile(source, "rw").apply { write(header(0)) }
    file = source
    dataBytes = 0
  }

  private fun closeFile() {
    val output = writer ?: return
    try { output.seek(0); output.write(header(dataBytes)); output.fd.sync() }
    finally { output.close(); writer = null; file = null; dataBytes = 0 }
  }

  private fun header(length: Int): ByteArray {
    return ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
      .put("RIFF".toByteArray(Charsets.US_ASCII)).putInt(length + 36)
      .put("WAVEfmt ".toByteArray(Charsets.US_ASCII)).putInt(16).putShort(1).putShort(1)
      .putInt(24000).putInt(48000).putShort(2).putShort(16)
      .put("data".toByteArray(Charsets.US_ASCII)).putInt(length).array()
  }
}
