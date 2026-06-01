package expo.modules.ultraclarity

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import android.media.MediaFormat
import android.os.Handler
import android.os.Looper
import androidx.media3.common.Format
import androidx.media3.common.C
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.mediacodec.MediaCodecSelector
import androidx.media3.exoplayer.video.MediaCodecVideoRenderer
import androidx.media3.exoplayer.video.VideoRendererEventListener
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import expo.modules.kotlin.viewevent.EventDispatcher
import androidx.media3.common.Player

class UltraClarityView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val playerView = PlayerView(context)
  private var player: ExoPlayer? = null
  private var isEnhancementActive = false
  private var videoUrl: String? = null

  private val onProgress by EventDispatcher()
  private val onStatusChange by EventDispatcher()

  private val progressHandler = Handler(Looper.getMainLooper())
  private val progressRunnable = object : Runnable {
    override fun run() {
      player?.let {
        onProgress(mapOf(
          "currentTime" to (it.currentPosition / 1000.0),
          "duration" to (if (it.duration > 0) it.duration / 1000.0 else 0.0),
          "bufferedPosition" to (it.bufferedPosition / 1000.0)
        ))
      }
      progressHandler.postDelayed(this, 500)
    }
  }

  init {
    playerView.layoutParams = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    playerView.setBackgroundColor(Color.BLACK)
    playerView.useController = false
    playerView.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
    addView(playerView)
    
    initializePlayer()
  }

  private fun initializePlayer() {
    if (player == null) {
      // 1. Dynamic Range Safeguard (Aggressive buffering for 4K video)
      val loadControl = DefaultLoadControl.Builder()
        .setBufferDurationsMs(
          50000,   // minBufferMs (50 seconds)
          120000,  // maxBufferMs (120 seconds)
          2500,    // bufferForPlaybackMs (2.5 seconds)
          5000     // bufferForPlaybackAfterRebufferMs (5 seconds)
        )
        .setPrioritizeTimeOverSizeThresholds(true)
        .build()

      // 2. Color Space Dynamics (HDR10/HLG forcing) & Noise Reduction filter configuration
      val renderersFactory = object : DefaultRenderersFactory(context) {
        override fun buildVideoRenderers(
          context: Context,
          extensionRendererMode: Int,
          mediaCodecSelector: MediaCodecSelector,
          enableDecoderFallback: Boolean,
          eventHandler: Handler,
          eventListener: VideoRendererEventListener,
          allowedVideoJoiningTimeMs: Long,
          out: ArrayList<Renderer>
        ) {
          val renderer = object : MediaCodecVideoRenderer(
            context,
            mediaCodecSelector,
            allowedVideoJoiningTimeMs,
            enableDecoderFallback,
            eventHandler,
            eventListener,
            50 // maxDroppedFramesToNotify
          ) {
            override fun getMediaFormat(
              format: Format,
              codecMimeType: String,
              codecMaxValues: CodecMaxValues,
              codecOperatingRate: Float,
              deviceNeedsNoPostProcessWorkaround: Boolean,
              tunnelingAudioSessionId: Int
            ): MediaFormat {
              val mediaFormat = super.getMediaFormat(
                format,
                codecMimeType,
                codecMaxValues,
                codecOperatingRate,
                deviceNeedsNoPostProcessWorkaround,
                tunnelingAudioSessionId
              )
              
              // Feature 1: Force BT.2020 / HDR10 / HLG dynamics if video stream has HDR information
              try {
                format.colorInfo?.let { colorInfo ->
                  if (colorInfo.colorTransfer == C.COLOR_TRANSFER_ST2084 || colorInfo.colorTransfer == C.COLOR_TRANSFER_HLG) {
                    mediaFormat.setInteger(MediaFormat.KEY_COLOR_STANDARD, MediaFormat.COLOR_STANDARD_BT2020)
                    mediaFormat.setInteger(MediaFormat.KEY_COLOR_TRANSFER, colorInfo.colorTransfer)
                  }
                }
              } catch (e: Exception) {}

              // Feature 4: Enable hardware-level noise reduction and temporal noise filtering in MediaCodec
              try {
                mediaFormat.setInteger("noise-reduction-mode", 1)
                mediaFormat.setInteger("temporal-noise-reduction", 1)
              } catch (e: Exception) {}
              
              return mediaFormat
            }
          }
          out.add(renderer)
          
          super.buildVideoRenderers(
            context,
            extensionRendererMode,
            mediaCodecSelector,
            enableDecoderFallback,
            eventHandler,
            eventListener,
            allowedVideoJoiningTimeMs,
            out
          )
        }
      }.apply {
        setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
      }

      val trackSelector = DefaultTrackSelector(context).apply {
        setParameters(
          buildUponParameters()
            .setMaxVideoSize(Int.MAX_VALUE, Int.MAX_VALUE)
            .setMaxVideoBitrate(Int.MAX_VALUE)
            .setForceHighestSupportedBitrate(true)
        )
      }

      player = ExoPlayer.Builder(context, renderersFactory)
        .setLoadControl(loadControl)
        .setTrackSelector(trackSelector)
        .build().apply {
          playerView.player = this
          repeatMode = ExoPlayer.REPEAT_MODE_ALL
          
          // Feature 3: Smart frame rate matching & refresh rate synchronization
          videoScalingMode = C.VIDEO_SCALING_MODE_SCALE_TO_FIT
          videoChangeFrameRateStrategy = C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS
          
          addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
              onStatusChange(mapOf("isPlaying" to isPlaying))
              if (isPlaying) {
                progressHandler.post(progressRunnable)
              } else {
                progressHandler.removeCallbacks(progressRunnable)
              }
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
              onStatusChange(mapOf(
                "isBuffering" to (playbackState == Player.STATE_BUFFERING),
                "isEnded" to (playbackState == Player.STATE_ENDED)
              ))
            }
          })
        }
    }
  }

  private fun getRefererForUrl(url: String): String {
    if (url.contains("optraco.top")) {
      try {
        val parts = url.split("/plateau/")
        if (parts.size > 1) {
          val remaining = parts[1].split("/")
          val id1 = remaining[0]
          var id2 = if (remaining.size > 1) remaining[1].replace(".m3u8", "").split("?")[0] else ""
          if (id2.length > 40) {
            id2 = id2.substring(0, 40)
          }
          return "https://optraco.top/explorer/$id1/$id2"
        }
      } catch (e: Exception) {
        // Fallback
      }
    }
    return "https://optraco.top/"
  }

  fun setUrl(url: String?) {
    videoUrl = url
    if (url != null) {
      val uri = Uri.parse(url)
      val referer = getRefererForUrl(url)
      
      val dataSourceFactory = DefaultHttpDataSource.Factory()
        .setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .setDefaultRequestProperties(mapOf(
          "Referer" to referer,
          "Origin" to "https://optraco.top"
        ))
      
      val mediaSource = DefaultMediaSourceFactory(context)
        .setDataSourceFactory(dataSourceFactory)
        .createMediaSource(MediaItem.fromUri(uri))

      player?.setMediaSource(mediaSource)
      player?.prepare()
      player?.play()
    } else {
      player?.stop()
    }
  }

  fun setEnhancementActive(active: Boolean) {
    if (isEnhancementActive != active) {
      isEnhancementActive = active
      // TODO: Re-initialize ExoPlayer with a custom DefaultVideoFrameProcessor.Factory
      // to inject the Contrast-Adaptive Sharpening (CAS) GlShaderProgram
    }
  }

  fun play() {
    player?.play()
  }

  fun pause() {
    player?.pause()
  }

  fun seekTo(positionMs: Long) {
    player?.seekTo(positionMs)
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    progressHandler.removeCallbacks(progressRunnable)
    player?.release()
    player = null
  }
}
