package com.github.kenshin579.markdowneditor.editor

import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorColorsScheme
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.ColorUtil
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class MarkdownFileEditor(
    private val project: Project,
    private val file: VirtualFile
) : UserDataHolderBase(), FileEditor {

    private val panel = MarkdownHtmlPanel(project, file)

    init {
        // Listen for IDE theme changes
        val connection = project.messageBus.connect(this)
        connection.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { scheme ->
            if (scheme != null) {
                val isDark = ColorUtil.isDark(scheme.defaultBackground)
                panel.executeJavaScript("switchTheme($isDark)")
            }
        })
    }

    override fun getComponent(): JComponent = panel.component

    override fun getPreferredFocusedComponent(): JComponent = panel.component

    override fun getName(): String = "Markdown Editor"

    override fun getFile(): VirtualFile = file

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun setState(state: FileEditorState) {}

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun dispose() {
        panel.dispose()
    }
}
