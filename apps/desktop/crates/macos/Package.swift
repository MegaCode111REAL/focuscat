// swift-tools-version: 6.1
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "focuscat-macos",
    platforms: [
        .macOS(.v10_15)
    ],
    products: [
        // Products define the executables and libraries a package produces, making them visible to other packages.
        .library(
            name: "focuscat-macos",
            type: .static,
            targets: ["focuscat-macos"]
        )
    ],
    dependencies: [
        // Dependencies declare other packages that this package depends on.
        .package(
            url: "https://github.com/brendonovich/swift-rs",
            from: "1.0.9"
        )
    ],
    targets: [
        // Targets are the basic building blocks of a package, defining a module or a test suite.
        // Targets can depend on other targets in this package and products from dependencies.
        .target(
            name: "focuscat-macos",
            dependencies: [
                .product(name: "SwiftRs", package: "swift-rs")
            ],
            path: "src-swift"
        )
    ]
)
