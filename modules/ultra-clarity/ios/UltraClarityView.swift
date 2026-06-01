import ExpoModulesCore
import AVFoundation
import UIKit

class UltraClarityView: ExpoView {
  private let playerLayer = AVPlayerLayer()
  private var player: AVPlayer?
  
  var url: String? {
    didSet {
      setupPlayer()
    }
  }
  
  var isEnhancementActive: Bool = false {
    didSet {
      updateVideoComposition()
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    playerLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(playerLayer)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    playerLayer.frame = bounds
  }

  private func setupPlayer() {
    guard let urlString = url, let videoURL = URL(string: urlString) else {
      player?.pause()
      playerLayer.player = nil
      player = nil
      return
    }

    let playerItem = AVPlayerItem(url: videoURL)
    player = AVPlayer(playerItem: playerItem)
    playerLayer.player = player
    player?.play()
    
    updateVideoComposition()
  }

  private func updateVideoComposition() {
    guard let playerItem = player?.currentItem else { return }
    
    if isEnhancementActive {
      // TODO: Implement custom AVVideoComposition with CIFilter for Metal CAS Shader
    } else {
      playerItem.videoComposition = nil
    }
  }
}
