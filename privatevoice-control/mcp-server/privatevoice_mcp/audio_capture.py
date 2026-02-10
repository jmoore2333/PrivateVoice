"""macOS system audio capture using Core Audio Taps (macOS 14.2+).

Falls back to ScreenCaptureKit if Core Audio Taps are unavailable.
Requires Screen Recording permission in System Preferences.
"""

from __future__ import annotations

import asyncio
import os
import platform
import subprocess
import tempfile


class AudioCapture:
    """Captures system audio output on macOS."""

    SAMPLE_RATE = 44100
    CHANNELS = 1
    SAMPLE_WIDTH = 2  # 16-bit

    async def capture(self, duration_seconds: float, save_path: str) -> dict:
        """Capture system audio for the given duration.

        Tries multiple approaches in order:
        1. Core Audio Taps via the `audiotee` CLI (if installed)
        2. ScreenCaptureKit via a Swift helper script
        3. Returns an error with setup instructions
        """
        # Try audiotee first (cleanest approach)
        result = await self._try_audiotee(duration_seconds, save_path)
        if result.get("success"):
            return result

        # Try ScreenCaptureKit via Swift
        result = await self._try_screencapture_audio(duration_seconds, save_path)
        if result.get("success"):
            return result

        # Nothing worked — return setup instructions
        return {
            "error": "System audio capture is not available.",
            "requirements": [
                "macOS 14.2+ for Core Audio Taps",
                "Screen Recording permission in System Preferences > Privacy & Security",
            ],
            "setup_options": [
                "Install audiotee: cargo install audiotee (Rust CLI for Core Audio Taps)",
                "Or use BlackHole virtual audio driver: brew install blackhole-2ch",
            ],
            "macos_version": platform.mac_ver()[0],
        }

    async def _try_audiotee(self, duration_seconds: float, save_path: str) -> dict:
        """Try capturing audio via the audiotee CLI tool."""
        # Check if audiotee is installed
        try:
            check = subprocess.run(
                ["which", "audiotee"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if check.returncode != 0:
                return {"success": False, "reason": "audiotee not installed"}
        except Exception:
            return {"success": False, "reason": "audiotee check failed"}

        # Record using audiotee
        try:
            proc = await asyncio.create_subprocess_exec(
                "audiotee",
                "--duration", str(int(duration_seconds)),
                "--output", save_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=duration_seconds + 10,
            )

            if proc.returncode != 0:
                return {
                    "success": False,
                    "reason": f"audiotee failed: {stderr.decode().strip()}",
                }

            if os.path.exists(save_path):
                size = os.path.getsize(save_path)
                return {
                    "success": True,
                    "path": save_path,
                    "duration_seconds": duration_seconds,
                    "size_bytes": size,
                    "method": "audiotee",
                    "sample_rate": self.SAMPLE_RATE,
                }

            return {"success": False, "reason": "audiotee produced no output file"}

        except asyncio.TimeoutError:
            return {"success": False, "reason": "audiotee timed out"}
        except Exception as exc:
            return {"success": False, "reason": f"audiotee error: {exc}"}

    async def _try_screencapture_audio(
        self, duration_seconds: float, save_path: str
    ) -> dict:
        """Try capturing audio using ScreenCaptureKit via a Swift subprocess.

        Creates a minimal Swift script that uses ScreenCaptureKit to
        capture system audio.
        """
        swift_script = self._get_swift_script()

        # Write the Swift script to a temp file
        fd, script_path = tempfile.mkstemp(suffix=".swift", prefix="pv_audio_")
        os.close(fd)
        with open(script_path, "w") as f:
            f.write(swift_script)

        try:
            proc = await asyncio.create_subprocess_exec(
                "swift",
                script_path,
                str(duration_seconds),
                save_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=duration_seconds + 30,  # Extra time for Swift compilation
            )

            if proc.returncode != 0:
                error_msg = stderr.decode().strip()
                if "Screen Recording" in error_msg or "permission" in error_msg.lower():
                    return {
                        "success": False,
                        "reason": "Screen Recording permission required. "
                        "Grant it in System Preferences > Privacy & Security > Screen Recording.",
                    }
                return {"success": False, "reason": f"Swift capture failed: {error_msg}"}

            if os.path.exists(save_path):
                size = os.path.getsize(save_path)
                return {
                    "success": True,
                    "path": save_path,
                    "duration_seconds": duration_seconds,
                    "size_bytes": size,
                    "method": "screencapturekit",
                    "sample_rate": self.SAMPLE_RATE,
                }

            return {"success": False, "reason": "Swift capture produced no output file"}

        except asyncio.TimeoutError:
            return {"success": False, "reason": "Swift audio capture timed out"}
        except Exception as exc:
            return {"success": False, "reason": f"Swift capture error: {exc}"}
        finally:
            try:
                os.unlink(script_path)
            except OSError:
                pass

    @staticmethod
    def _get_swift_script() -> str:
        """Return the embedded Swift script for ScreenCaptureKit audio capture."""
        return _SWIFT_AUDIO_CAPTURE


# Embedded Swift script stored as module constant
_SWIFT_AUDIO_CAPTURE = """
import AVFoundation
import Foundation
import ScreenCaptureKit

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: swift capture_audio.swift <duration_seconds> <output_path>\\n", stderr)
    Foundation.exit(1)
}

let duration = Double(CommandLine.arguments[1]) ?? 5.0
let outputPath = CommandLine.arguments[2]

class AudioRecorder: NSObject, SCStreamDelegate, SCStreamOutput {
    var audioFile: AVAudioFile?
    let outputURL: URL
    let semaphore = DispatchSemaphore(value: 0)
    var sampleCount = 0

    init(outputPath: String) {
        self.outputURL = URL(fileURLWithPath: outputPath)
        super.init()
    }

    func start(duration: Double) {
        Task {
            do {
                let content = try await SCShareableContent.current
                guard let display = content.displays.first else {
                    fputs("No display found\\n", stderr)
                    semaphore.signal()
                    return
                }

                let filter = SCContentFilter(display: display, excludingWindows: [])
                let config = SCStreamConfiguration()
                config.capturesAudio = true
                config.excludesCurrentProcessAudio = false
                config.sampleRate = 44100
                config.channelCount = 1
                config.width = 2
                config.height = 2
                config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

                let stream = SCStream(filter: filter, configuration: config, delegate: self)
                try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: .main)
                try await stream.startCapture()
                try await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
                try await stream.stopCapture()
            } catch {
                fputs("Error: \\(error.localizedDescription)\\n", stderr)
            }
            semaphore.signal()
        }
        semaphore.wait()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard let formatDesc = sampleBuffer.formatDescription,
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc) else { return }

        if audioFile == nil {
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
            ]
            do {
                audioFile = try AVAudioFile(forWriting: outputURL, settings: settings)
            } catch {
                fputs("Failed to create audio file: \\(error)\\n", stderr)
                return
            }
        }

        guard let blockBuffer = sampleBuffer.dataBuffer else { return }
        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)
        guard let data = dataPointer else { return }

        let frameCount = AVAudioFrameCount(length) / AVAudioFrameCount(asbd.pointee.mBytesPerFrame)
        let sampleRate = asbd.pointee.mSampleRate
        let channels = AVAudioChannelCount(asbd.pointee.mChannelsPerFrame)
        guard let pcmBuffer = AVAudioPCMBuffer(
            pcmFormat: AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: sampleRate, channels: channels, interleaved: false)!,
            frameCapacity: frameCount
        ) else { return }

        pcmBuffer.frameLength = frameCount
        let floatData = pcmBuffer.floatChannelData![0]
        data.withMemoryRebound(to: Float.self, capacity: Int(frameCount)) { src in
            floatData.assign(from: src, count: Int(frameCount))
        }

        do {
            try audioFile?.write(from: pcmBuffer)
            sampleCount += Int(frameCount)
        } catch {
            fputs("Write error: \\(error)\\n", stderr)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("Stream stopped: \\(error.localizedDescription)\\n", stderr)
        semaphore.signal()
    }
}

let recorder = AudioRecorder(outputPath: outputPath)
recorder.start(duration: duration)

if recorder.sampleCount > 0 {
    print("Captured \\(recorder.sampleCount) samples to \\(outputPath)")
} else {
    fputs("No audio samples captured. Check Screen Recording permission.\\n", stderr)
    Foundation.exit(1)
}
"""
