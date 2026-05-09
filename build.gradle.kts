plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform")
    id("com.github.node-gradle.node") version "7.0.2"
}

group = "com.github.kenshin579"
version = providers.gradleProperty("pluginVersion").get()

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        create("IC", "2024.2")
        pluginVerifier()
        zipSigner()
    }
}

kotlin {
    jvmToolchain(21)
}

configurations {
    // Exclude Kotlin stdlib bundled by the IntelliJ Platform
    all {
        exclude(group = "org.jetbrains.kotlin", module = "kotlin-stdlib-jdk8")
    }
}

intellijPlatform {
    pluginConfiguration {
        id = "com.github.kenshin579.markora"
        name = "Markora"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "242"
            untilBuild = provider { null }
        }
    }
}

node {
    version.set("20.18.0")
    npmVersion.set("10.8.2")
    download.set(true)
    workDir.set(file("${project.projectDir}/.gradle/nodejs"))
    nodeProjectDir.set(file("${project.projectDir}/frontend"))
}

tasks.register<com.github.gradle.node.npm.task.NpmTask>("buildFrontend") {
    group = "build"
    description = "Bundle BlockNote editor with Vite"
    dependsOn("npmInstall")
    args.set(listOf("run", "build"))
    inputs.dir("frontend/src")
    inputs.file("frontend/package.json")
    inputs.file("frontend/package-lock.json")
    inputs.file("frontend/vite.config.ts")
    inputs.file("frontend/tsconfig.json")
    inputs.file("frontend/tsconfig.node.json")
    inputs.file("frontend/index.html")
    outputs.dir("src/main/resources/blocknote/dist")
}

tasks.named("processResources") {
    dependsOn("buildFrontend")
}

tasks.named("clean") {
    doLast {
        delete("src/main/resources/blocknote/dist")
    }
}
