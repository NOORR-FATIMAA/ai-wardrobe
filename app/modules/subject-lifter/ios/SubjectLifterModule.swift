import CoreImage
import ExpoModulesCore
import Vision

internal final class ImageLoadException: Exception {
  override var reason: String {
    "Could not read the image"
  }
}

internal final class ImageEncodeException: Exception {
  override var reason: String {
    "Could not encode the cut-out image"
  }
}

public class SubjectLifterModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SubjectLifter")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      if #available(iOS 17.0, *) {
        return true
      }
      return false
    }

    AsyncFunction("liftSubjectAsync") { (uri: URL) throws -> String? in
      guard #available(iOS 17.0, *) else {
        return nil
      }
      return try Self.lift(uri)
    }
  }

  /// Uses Vision's foreground instance mask (the same model as "lift subject from background" in Photos).
  @available(iOS 17.0, *)
  private static func lift(_ url: URL) throws -> String? {
    guard let input = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
      throw ImageLoadException()
    }

    let handler = VNImageRequestHandler(ciImage: input)
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])

    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      return nil
    }

    let masked = try observation.generateMaskedImage(
      ofInstances: observation.allInstances,
      from: handler,
      croppedToInstancesExtent: true
    )

    let output = CIImage(cvPixelBuffer: masked)
    guard
      let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
      let png = CIContext().pngRepresentation(of: output, format: .RGBA8, colorSpace: colorSpace)
    else {
      throw ImageEncodeException()
    }

    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("lifted-\(UUID().uuidString).png")
    try png.write(to: file)
    return file.absoluteString
  }
}
