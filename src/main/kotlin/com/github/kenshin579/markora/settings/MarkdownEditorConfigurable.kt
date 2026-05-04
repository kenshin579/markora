package com.github.kenshin579.markora.settings

import com.github.kenshin579.markora.service.EditorSettingsService
import com.intellij.openapi.options.Configurable
import javax.swing.*

class MarkdownEditorConfigurable : Configurable {

    private var panel: JPanel? = null
    private var fontSizeSpinner: JSpinner? = null
    private var autoSaveSpinner: JSpinner? = null

    override fun getDisplayName(): String = "Markora"

    override fun createComponent(): JComponent {
        val settings = EditorSettingsService.getInstance().state

        panel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = BorderFactory.createEmptyBorder(10, 10, 10, 10)
        }

        val fontPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            alignmentX = JComponent.LEFT_ALIGNMENT
            add(JLabel("Font size: "))
            fontSizeSpinner = JSpinner(SpinnerNumberModel(settings.fontSize, 10, 32, 1)).apply {
                maximumSize = java.awt.Dimension(80, 30)
            }
            add(fontSizeSpinner)
            add(JLabel(" px"))
            add(Box.createHorizontalGlue())
        }

        val savePanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            alignmentX = JComponent.LEFT_ALIGNMENT
            add(JLabel("Auto-save delay: "))
            autoSaveSpinner = JSpinner(SpinnerNumberModel(settings.autoSaveDelayMs, 500, 10000, 100)).apply {
                maximumSize = java.awt.Dimension(100, 30)
            }
            add(autoSaveSpinner)
            add(JLabel(" ms"))
            add(Box.createHorizontalGlue())
        }

        panel!!.add(fontPanel)
        panel!!.add(Box.createVerticalStrut(8))
        panel!!.add(savePanel)
        panel!!.add(Box.createVerticalGlue())

        return panel!!
    }

    override fun isModified(): Boolean {
        val settings = EditorSettingsService.getInstance().state
        return (fontSizeSpinner?.value as? Int) != settings.fontSize ||
            (autoSaveSpinner?.value as? Int) != settings.autoSaveDelayMs
    }

    override fun apply() {
        val settings = EditorSettingsService.getInstance()
        val state = settings.state
        state.fontSize = (fontSizeSpinner?.value as? Int) ?: 16
        state.autoSaveDelayMs = (autoSaveSpinner?.value as? Int) ?: 1000
        settings.loadState(state)
    }

    override fun reset() {
        val settings = EditorSettingsService.getInstance().state
        fontSizeSpinner?.value = settings.fontSize
        autoSaveSpinner?.value = settings.autoSaveDelayMs
    }

    override fun disposeUIResources() {
        panel = null
        fontSizeSpinner = null
        autoSaveSpinner = null
    }
}
