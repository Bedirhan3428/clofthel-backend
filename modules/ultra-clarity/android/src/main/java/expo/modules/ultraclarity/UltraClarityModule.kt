package expo.modules.ultraclarity

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UltraClarityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UltraClarity")

    Function("simulateTouch") { reactTag: Int, x: Float, y: Float ->
      val activity = appContext.currentActivity ?: return@Function false
      val view = activity.findViewById<android.view.View>(reactTag) ?: return@Function false
      
      activity.runOnUiThread {
        val downTime = android.os.SystemClock.uptimeMillis()
        val downEvent = android.view.MotionEvent.obtain(
          downTime, downTime, android.view.MotionEvent.ACTION_DOWN, x, y, 0
        )
        view.dispatchTouchEvent(downEvent)
        
        val upEvent = android.view.MotionEvent.obtain(
          downTime, downTime + 50, android.view.MotionEvent.ACTION_UP, x, y, 0
        )
        view.dispatchTouchEvent(upEvent)
        
        downEvent.recycle()
        upEvent.recycle()
      }
      true
    }

    View(UltraClarityView::class) {
      Events("onProgress", "onStatusChange")

      Prop("url") { view: UltraClarityView, url: String? ->
        view.setUrl(url)
      }
      Prop("isEnhancementActive") { view: UltraClarityView, active: Boolean ->
        view.setEnhancementActive(active)
      }

      AsyncFunction("play") { view: UltraClarityView ->
        view.play()
      }

      AsyncFunction("pause") { view: UltraClarityView ->
        view.pause()
      }

      AsyncFunction("seekTo") { view: UltraClarityView, positionMs: Double ->
        view.seekTo(positionMs.toLong())
      }
    }
  }
}
