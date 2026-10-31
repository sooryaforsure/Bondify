import Foundation
import AVFoundation

/**
 * Native iOS WebRTC Audio & Video Client Wrapper
 */
final class WebRtcClient {
    private var isMuted: Boolean = false

    func startAudioCall(iceServers: [String], onRemoteAudioReady: @escaping () -> Void) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try? session.setActive(true)
        onRemoteAudioReady()
    }

    func setMicrophoneMuted(_ muted: Bool) {
        self.isMuted = muted
    }

    func disconnect() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }
}
