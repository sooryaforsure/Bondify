import Foundation
import AVFoundation

/**
 * Native iOS WebRTC Audio & Video Client Wrapper
 */
final class WebRtcClient {
    private var isMuted: Bool = false
    private var isCameraEnabled: Bool = true

    func startAudioCall(iceServers: [String], onRemoteAudioReady: @escaping () -> Void) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .defaultToSpeaker])
        try? session.setActive(true)
        onRemoteAudioReady()
    }

    func startVideoCall(iceServers: [String], onRemoteVideoReady: @escaping () -> Void) {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playAndRecord, mode: .videoChat, options: [.allowBluetooth, .defaultToSpeaker])
        try? session.setActive(true)
        onRemoteVideoReady()
    }

    func setMicrophoneMuted(_ muted: Bool) {
        self.isMuted = muted
    }

    func setCameraEnabled(_ enabled: Bool) {
        self.isCameraEnabled = enabled
    }

    func disconnect() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }
}
