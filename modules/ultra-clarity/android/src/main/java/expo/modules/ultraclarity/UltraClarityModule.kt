package expo.modules.ultraclarity

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UltraClarityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UltraClarity")

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
