package com.github.kenshin579.markdowneditor.listener

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import com.intellij.ui.jcef.JBCefApp

class JcefSupportCheck : ProjectActivity {

    override suspend fun execute(project: Project) {
        if (!JBCefApp.isSupported()) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("Markdown Editor Notifications")
                .createNotification(
                    "Markdown WYSIWYG Editor",
                    "This plugin requires JCEF support. Please use a JetBrains IDE with bundled JCEF.",
                    NotificationType.WARNING
                )
                .notify(project)
        }
    }
}
