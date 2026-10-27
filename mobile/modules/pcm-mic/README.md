# DutyGraph PCM microphone

Local Expo SDK 57 module, discovered from the app's default `./modules` directory. No extra npm dependency is needed. It requires a new native development or store build; Expo Go and older builds select device speech or typing.

Android uses `AudioRecord` with `VOICE_COMMUNICATION`, mono PCM16 at 24 kHz, 100 ms frames, and hardware echo cancellation/noise suppression when available. iOS uses an `AVAudioEngine` input tap with voice processing and converts hardware input to mono Float32 at 24 kHz. JS normalizes frames and encodes little-endian PCM16 for the transcription socket. Frames, transcript text, and credentials are never logged; credentials are never written to disk.

The microphone opens only from `startAsync`, after microphone permission. Stop, app background, module destruction, capture failure, and iOS interruptions release it. Unique run IDs, serialized native ownership, and fresh socket generations reject stale callbacks. Capture release completes before device-recognizer fallback. Valid ephemeral grants are reused across card restarts until expiry; a failed socket gets one fresh grant.

## Optional same-engine recording backup

The participant hook enables the WAV tee only when its explicitly chosen voice flow has a backup service. `beginBackupAsync` copies the existing input stream to disk; it never opens another microphone. Backup windows exclude app question/nudge playback, and the hook closes the backup before playing any line. Each file is limited to five minutes of 24 kHz mono PCM16 (about 14.4 MB, below the 25 MB transcription limit), then rolls into another file. Only small frame buffers are held in memory.

A per-card context is persisted before the tee begins. It contains request/card identifiers, numeric character offsets, and SHA-256 hashes; it contains no answer text. A normal live segment can discard its backup. Failed/interrupted segments remain queued for the existing recorded-answer transcription and review flow. On restart, the module repairs WAV headers from retained byte lengths, restores files in recording order, and the app reconnects them to their card context. Multiple chunks append in order; changed raw text is preserved instead of overwritten. No recovered audio is silently treated as sent.

Android stores WAVs in `Context.noBackupFilesDir/dutygraph-pcm-backups`. iOS stores them in an Application Support subdirectory with `isExcludedFromBackup` and `completeUntilFirstUserAuthentication` protection. Acknowledged transcription, explicit Remove recording, and logout delete retained files. Logout also invalidates in-flight queue work, capture instances, and context indexes. Native protection behavior requires device validation.

This module is foreground-only. Advisor meeting evidence recording and realtime WebRTC have separate microphone ownership gates; this PCM stream is not opened beside them.

## Verification

SDK 57 autolinking resolves `DutyGraphPcmMicModule` on Apple and Android. Isolated Expo prebuild resolves both native projects. TypeScript, lint, and fake-native tests cover permission cancellation, lifecycle release, frame validation, ownership, stale events, backup tee finalization, queue recovery, multiple chunks/sessions, edit preservation, and logout races. Swift/Kotlin compilation and actual microphone, Bluetooth, echo cancellation, interruptions, file protection, and power behavior have not been verified on native toolchains or a device in this Linux workspace. Native compile CI and the device checklist remain the evidence needed for those claims.
