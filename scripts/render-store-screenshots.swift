import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let svgDirectory = root.appendingPathComponent("docs/release/screenshots/svg")
let outputDirectory = root.appendingPathComponent("docs/release/screenshots")
let filenames = [
  "01-training-that-fits",
  "02-plan-around-today",
  "03-exercises-your-rules",
  "04-keep-moving",
  "05-progress-made-visible",
  "06-own-your-training",
  "07-stay-focused-set-by-set",
  "08-move-with-confidence",
  "09-progress-made-visible",
  "10-the-work-adds-up",
]

// AppKit renders at the Mac's 2× backing scale, so this logical canvas exports
// the 1284 × 2778 pixels required for the 6.9-inch App Store screenshot slot.
let logicalSize = NSSize(width: 642, height: 1389)

func render(svgURL: URL, outputURL: URL) throws {
  guard let source = NSImage(contentsOf: svgURL) else {
    throw CocoaError(.fileReadCorruptFile)
  }

  let canvas = NSImage(size: logicalSize)
  canvas.lockFocus()
  NSGraphicsContext.current?.imageInterpolation = .high
  source.draw(
    in: NSRect(origin: .zero, size: logicalSize),
    from: NSRect(origin: .zero, size: source.size),
    operation: .sourceOver,
    fraction: 1
  )
  canvas.unlockFocus()

  guard
    let tiff = canvas.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
  else {
    throw CocoaError(.fileWriteUnknown)
  }

  try png.write(to: outputURL)
}

for filename in filenames {
  let svgURL = svgDirectory.appendingPathComponent("\(filename).svg")
  let outputURL = outputDirectory.appendingPathComponent("\(filename).png")
  try render(svgURL: svgURL, outputURL: outputURL)
  print("Rendered \(outputURL.path)")
}
