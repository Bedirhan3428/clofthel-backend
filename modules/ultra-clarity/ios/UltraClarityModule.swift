import ExpoModulesCore

public class UltraClarityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("UltraClarity")

    View(UltraClarityView.self) {
      Prop("url") { (view: UltraClarityView, url: String?) in
        view.url = url
      }
      Prop("isEnhancementActive") { (view: UltraClarityView, active: Bool) in
        view.isEnhancementActive = active
      }
    }
  }
}
