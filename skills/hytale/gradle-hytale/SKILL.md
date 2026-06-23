---
name: gradle-hytale
description: Gradle build system for Hytale plugin development. Covers Gradle 9.2 configuration, build.gradle.kts setup, dependency management, building plugin JARs, running development servers, and common Gradle tasks. Use when configuring builds, troubleshooting Gradle issues, or optimizing build performance.
---

# Gradle for Hytale Plugins

Build system configuration for Hytale plugin development.

## Overview

Hytale plugins use **Gradle 9.2** with Kotlin DSL (`build.gradle.kts`).

## Project Setup

### Recommended Structure

```
MyPlugin/
├── build.gradle.kts       # Main build script
├── settings.gradle.kts    # Project settings
├── gradle.properties      # Build properties
├── gradle/
│   └── wrapper/
│       └── gradle-wrapper.properties
└── src/
    └── main/
        ├── java/          # Source code
        └── resources/     # Resources (plugin.json)
```

### settings.gradle.kts

```kotlin
rootProject.name = "MyPlugin"
```

### gradle.properties

```properties
# Gradle settings
org.gradle.jvmargs=-Xmx2g
org.gradle.parallel=true
org.gradle.caching=true

# Plugin info
plugin.version=1.0.0
plugin.group=com.yourname
```

### build.gradle.kts (Complete)

```kotlin
plugins {
    java
    id("com.hytale.plugin") version "1.0.0"  // Hytale plugin
}

group = property("plugin.group").toString()
version = property("plugin.version").toString()

// Java 25 toolchain
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

repositories {
    mavenCentral()
    maven("https://maven.hytale.com/releases")
}

dependencies {
    // Hytale Server API (compile-only, provided at runtime)
    compileOnly("com.hytale:server-api:1.0.0")
    
    // Optional: Common libraries
    implementation("com.google.code.gson:gson:2.10.1")
    
    // Testing
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}

// Plugin metadata
hytalePlugin {
    pluginId = rootProject.name.lowercase()
    pluginName = rootProject.name
    author = "YourName"
    version = project.version.toString()
    description = "My awesome Hytale plugin"
}

// Test configuration
tasks.test {
    useJUnitPlatform()
}

// JAR configuration
tasks.jar {
    manifest {
        attributes(
            "Plugin-Id" to rootProject.name.lowercase(),
            "Plugin-Version" to project.version
        )
    }
}
```

---

## Common Tasks

### Build

```bash
# Build plugin JAR
gradle build

# Output: build/libs/MyPlugin-1.0.0.jar
```

### Clean Build

```bash
# Remove build artifacts and rebuild
gradle clean build
```

### Run Development Server

```bash
# If using Hytale dev server plugin
gradle runServer
```

### List All Tasks

```bash
gradle tasks
```

### Dependency Tree

```bash
# View all dependencies
gradle dependencies

# Specific configuration
gradle dependencies --configuration compileClasspath
```

---

## Dependency Management

### Adding Dependencies

```kotlin
dependencies {
    // Compile-only (provided by server)
    compileOnly("com.hytale:server-api:1.0.0")
    
    // Bundled in JAR
    implementation("org.yaml:snakeyaml:2.0")
    
    // Runtime only
    runtimeOnly("org.slf4j:slf4j-simple:2.0.9")
    
    // Test dependencies
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.0")
}
```

### Shadow/Fat JAR (Bundle Dependencies)

```kotlin
plugins {
    java
    id("com.github.johnrengelman.shadow") version "8.1.1"
}

tasks.shadowJar {
    archiveClassifier.set("")
    
    // Relocate to avoid conflicts
    relocate("com.google.gson", "com.yourname.libs.gson")
}

// Use shadowJar as default JAR
tasks.build {
    dependsOn(tasks.shadowJar)
}
```

---

## Version Catalogs (Optional)

For larger projects, use version catalogs:

### gradle/libs.versions.toml

```toml
[versions]
hytale = "1.0.0"
gson = "2.10.1"
junit = "5.10.0"

[libraries]
hytale-api = { module = "com.hytale:server-api", version.ref = "hytale" }
gson = { module = "com.google.code.gson:gson", version.ref = "gson" }
junit = { module = "org.junit.jupiter:junit-jupiter", version.ref = "junit" }
```

### Using in build.gradle.kts

```kotlin
dependencies {
    compileOnly(libs.hytale.api)
    implementation(libs.gson)
    testImplementation(libs.junit)
}
```

---

## Multi-Module Projects

For plugins with multiple modules:

### settings.gradle.kts

```kotlin
rootProject.name = "MyPluginSuite"

include("core")
include("addon-pvp")
include("addon-economy")
```

### Structure

```
MyPluginSuite/
├── build.gradle.kts          # Root build
├── settings.gradle.kts
├── core/
│   └── build.gradle.kts
├── addon-pvp/
│   └── build.gradle.kts
└── addon-economy/
    └── build.gradle.kts
```

---

## Performance Tips

### Enable Build Cache

```properties
# gradle.properties
org.gradle.caching=true
```

### Parallel Execution

```properties
# gradle.properties
org.gradle.parallel=true
```

### Daemon (Keep Gradle Running)

```properties
# gradle.properties
org.gradle.daemon=true
```

### Configuration Cache (Experimental)

```properties
# gradle.properties
org.gradle.configuration-cache=true
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Gradle sync fails | Check Java 25 is installed and set |
| Could not resolve dependency | Add correct Maven repository |
| Out of memory | Increase `-Xmx` in gradle.properties |
| Slow builds | Enable caching and parallel execution |
| Wrong JAR location | Check `build/libs/` folder |

### Force Refresh Dependencies

```bash
gradle build --refresh-dependencies
```

### Debug Build Issues

```bash
gradle build --info
gradle build --debug
gradle build --stacktrace
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Build | `gradle build` |
| Clean | `gradle clean` |
| Test | `gradle test` |
| Run server | `gradle runServer` |
| List tasks | `gradle tasks` |
| Dependencies | `gradle dependencies` |
| Refresh deps | `gradle build --refresh-dependencies` |
