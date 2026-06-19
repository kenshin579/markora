package com.github.kenshin579.markora.editor

import com.intellij.openapi.editor.colors.EditorColorsListener
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.EditorColorsScheme
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
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
        // panel을 이 에디터의 자식으로 Disposer 트리에 등록한다. 이렇게 해야 에디터가
        // dispose될 때 Disposer가 panel.dispose()를 호출하며 트리에서 함께 제거한다.
        // (등록하지 않으면 panel 내부의 messageBus.connect(panel)가 panel을 ROOT_DISPOSABLE의
        //  자식으로 자동 등록해, 닫힌 에디터의 panel이 IDE 종료까지 누수된다.)
        Disposer.register(this, panel)

        // Listen for IDE theme changes
        val connection = project.messageBus.connect(this)
        connection.subscribe(EditorColorsManager.TOPIC, EditorColorsListener { scheme ->
            if (scheme != null) {
                val isDark = ColorUtil.isDark(scheme.defaultBackground)
                val themeName = if (isDark) "dark" else "light"
                panel.executeJavaScript("if (window.markora) window.markora.applyTheme('$themeName')")
            }
        })
    }

    override fun getComponent(): JComponent = panel.component

    override fun getPreferredFocusedComponent(): JComponent = panel.component

    override fun getName(): String = "Markora"

    override fun getFile(): VirtualFile = file

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun setState(state: FileEditorState) {}

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun dispose() {
        // panel은 Disposer.register(this, panel)로 등록돼 있어, 이 에디터가 dispose되면
        // Disposer가 panel.dispose()를 자동 호출한다. 여기서 직접 부르면 이중 dispose가 된다.
    }
}
