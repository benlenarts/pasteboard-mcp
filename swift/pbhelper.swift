import Foundation
import AppKit

// MARK: - Helpers

func printError(_ message: String) {
    FileHandle.standardError.write(Data((message + "\n").utf8))
}

func exitError(_ message: String, code: Int32 = 1) -> Never {
    printError(message)
    exit(code)
}

func getPasteboard(name: String?) -> NSPasteboard {
    guard let name = name else {
        return .general
    }
    switch name {
    case "general": return .general
    case "find": return NSPasteboard(name: .find)
    case "font": return NSPasteboard(name: .font)
    case "ruler": return NSPasteboard(name: .ruler)
    case "drag": return NSPasteboard(name: .drag)
    default: return NSPasteboard(name: NSPasteboard.Name(name))
    }
}

func readStdin() -> Data {
    var data = Data()
    let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: 65536)
    defer { buf.deallocate() }
    while true {
        let n = fread(buf, 1, 65536, stdin)
        if n == 0 { break }
        data.append(buf, count: n)
    }
    return data
}

// MARK: - Argument Parsing

struct Args {
    var command: String = ""
    var pasteboard: String? = nil
    var type: String? = nil
    var format: String = "png"
    var isBase64: Bool = false
}

func parseArgs() -> Args {
    var args = Args()
    let argv = CommandLine.arguments
    guard argv.count >= 2 else {
        printUsage()
        exit(1)
    }
    args.command = argv[1]

    var i = 2
    while i < argv.count {
        switch argv[i] {
        case "--pasteboard":
            i += 1
            guard i < argv.count else { exitError("Missing value for --pasteboard") }
            args.pasteboard = argv[i]
        case "--type":
            i += 1
            guard i < argv.count else { exitError("Missing value for --type") }
            args.type = argv[i]
        case "--format":
            i += 1
            guard i < argv.count else { exitError("Missing value for --format") }
            args.format = argv[i]
        case "--base64":
            args.isBase64 = true
        default:
            exitError("Unknown argument: \(argv[i])")
        }
        i += 1
    }
    return args
}

func printUsage() {
    printError("""
    Usage: pbhelper <command> [options]

    Commands:
      list-types  [--pasteboard NAME]
      read-text   [--pasteboard NAME]
      write-text  [--pasteboard NAME]
      read-image  [--pasteboard NAME] [--format png|tiff]
      write-image [--pasteboard NAME] [--format png|tiff]
      read        --type UTI [--pasteboard NAME]
      write       --type UTI [--pasteboard NAME] [--base64]
      clear       [--pasteboard NAME]
    """)
}

// MARK: - Commands

func cmdListTypes(_ args: Args) {
    let pb = getPasteboard(name: args.pasteboard)
    let types = pb.types ?? []
    let strings = types.map { $0.rawValue }
    guard let json = try? JSONSerialization.data(withJSONObject: strings),
          let str = String(data: json, encoding: .utf8) else {
        exitError("Failed to serialize types")
    }
    print(str)
}

func cmdReadText(_ args: Args) {
    let pb = getPasteboard(name: args.pasteboard)
    guard let text = pb.string(forType: .string) else {
        exitError("No text on pasteboard")
    }
    // Write without trailing newline
    FileHandle.standardOutput.write(Data(text.utf8))
}

func cmdWriteText(_ args: Args) {
    let data = readStdin()
    guard let text = String(data: data, encoding: .utf8) else {
        exitError("Invalid UTF-8 input")
    }
    let pb = getPasteboard(name: args.pasteboard)
    pb.clearContents()
    pb.setString(text, forType: .string)
}

func cmdReadImage(_ args: Args) {
    let pb = getPasteboard(name: args.pasteboard)

    // Try to get image data from pasteboard
    var imageRep: NSBitmapImageRep? = nil

    // Try TIFF first (native pasteboard format)
    if let tiffData = pb.data(forType: .tiff) {
        imageRep = NSBitmapImageRep(data: tiffData)
    }
    // Try PNG
    if imageRep == nil, let pngData = pb.data(forType: .png) {
        imageRep = NSBitmapImageRep(data: pngData)
    }

    guard let rep = imageRep else {
        exitError("No image on pasteboard")
    }

    let fileType: NSBitmapImageRep.FileType = args.format == "tiff" ? .tiff : .png
    guard let outputData = rep.representation(using: fileType, properties: [:]) else {
        exitError("Failed to convert image to \(args.format)")
    }

    let base64 = outputData.base64EncodedString()
    FileHandle.standardOutput.write(Data(base64.utf8))
}

func cmdWriteImage(_ args: Args) {
    let stdinData = readStdin()
    guard let base64String = String(data: stdinData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
          let imageData = Data(base64Encoded: base64String) else {
        exitError("Invalid base64 image data")
    }

    guard let imageRep = NSBitmapImageRep(data: imageData) else {
        exitError("Failed to decode image data")
    }

    let pb = getPasteboard(name: args.pasteboard)
    pb.clearContents()

    // Write as TIFF (native pasteboard image format) and also the requested format
    if let tiffData = imageRep.representation(using: .tiff, properties: [:]) {
        pb.setData(tiffData, forType: .tiff)
    }

    if args.format == "png" {
        if let pngData = imageRep.representation(using: .png, properties: [:]) {
            pb.setData(pngData, forType: .png)
        }
    }
}

func cmdRead(_ args: Args) {
    guard let typeStr = args.type else {
        exitError("--type is required for read command")
    }
    let pb = getPasteboard(name: args.pasteboard)
    let pasteboardType = NSPasteboard.PasteboardType(typeStr)

    // Try reading as string first for text-like types
    if let str = pb.string(forType: pasteboardType) {
        FileHandle.standardOutput.write(Data(str.utf8))
        return
    }

    // Fall back to binary data, output as base64
    guard let data = pb.data(forType: pasteboardType) else {
        exitError("No data for type \(typeStr) on pasteboard")
    }
    let base64 = data.base64EncodedString()
    FileHandle.standardOutput.write(Data(base64.utf8))
}

func cmdWrite(_ args: Args) {
    guard let typeStr = args.type else {
        exitError("--type is required for write command")
    }
    let stdinData = readStdin()
    let pb = getPasteboard(name: args.pasteboard)
    let pasteboardType = NSPasteboard.PasteboardType(typeStr)

    if args.isBase64 {
        guard let base64String = String(data: stdinData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              let decoded = Data(base64Encoded: base64String) else {
            exitError("Invalid base64 data")
        }
        pb.clearContents()
        pb.setData(decoded, forType: pasteboardType)
    } else {
        guard let text = String(data: stdinData, encoding: .utf8) else {
            exitError("Invalid UTF-8 input")
        }
        pb.clearContents()
        pb.setString(text, forType: pasteboardType)
    }
}

func cmdClear(_ args: Args) {
    let pb = getPasteboard(name: args.pasteboard)
    pb.clearContents()
}

// MARK: - Main

let args = parseArgs()

switch args.command {
case "list-types":  cmdListTypes(args)
case "read-text":   cmdReadText(args)
case "write-text":  cmdWriteText(args)
case "read-image":  cmdReadImage(args)
case "write-image": cmdWriteImage(args)
case "read":        cmdRead(args)
case "write":       cmdWrite(args)
case "clear":       cmdClear(args)
default:
    printUsage()
    exit(1)
}
