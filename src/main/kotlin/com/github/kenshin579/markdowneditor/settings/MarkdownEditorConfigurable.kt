package com.github.kenshin579.markdowneditor.settings

import com.github.kenshin579.markdowneditor.service.EditorSettingsService
import com.intellij.openapi.options.Configurable
import javax.swing.*

class MarkdownEditorConfigurable : Configurable {

    private var panel: JPanel? = null
    private var defaultModeCombo: JComboBox<String>? = null
    private var typewriterCheckbox: JCheckBox? = null
    private var lineNumbersCheckbox: JCheckBox? = null
    private var fontSizeSpinner: JSpinner? = null
    private var autoSaveSpinner: JSpinner? = null

    override fun getDisplayName(): String = "Markdown WYSIWYG Editor"

    override fun createComponent(): JComponent {
        val settings = EditorSettingsService.getInstance().state

        panel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = BorderFactory.createEmptyBorder(10, 10, 10, 10)
        }

        // Default Mode
        val modePanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            alignmentX = JComponent.LEFT_ALIGNMENT
            add(JLabel("Default mode: "))
            defaultModeCombo = JComboBox(arrayOf("wysiwyg", "sv")).apply {
                selectedItem = settings.defaultMode
                maximumSize = java.awt.Dimension(200, 30)
            }
            add(defaultModeCombo)
            add(Box.createHorizontalGlue())
        }

        // Typewriter Mode
        typewriterCheckbox = JCheckBox("Typewriter mode (cursor always at center)", settings.typewriterMode).apply {
            alignmentX = JComponent.LEFT_ALIGNMENT
        }

        // Line Numbers
        lineNumbersCheckbox = JCheckBox("Show line numbers in code blocks", settings.showLineNumbers).apply {
            alignmentX = JComponent.LEFT_ALIGNMENT
        }

        // Font Size
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

        // Auto Save Delay
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

        panel!!.add(modePanel)
        panel!!.add(Box.createVerticalStrut(8))
        panel!!.add(typewriterCheckbox)
        panel!!.add(Box.createVerticalStrut(4))
        panel!!.add(lineNumbersCheckbox)
        panel!!.add(Box.createVerticalStrut(8))
        panel!!.add(fontPanel)
        panel!!.add(Box.createVerticalStrut(8))
        panel!!.add(savePanel)
        panel!!.add(Box.createVerticalGlue())

        return panel!!
    }

    override fun isModified(): Boolean {
        val settings = EditorSettingsService.getInstance().state
        return defaultModeCombo?.selectedItem != settings.defaultMode ||
            typewriterCheckbox?.isSelected != settings.typewriterMode ||
            lineNumbersCheckbox?.isSelected != settings.showLineNumbers ||
            (fontSizeSpinner?.value as? Int) != settings.fontSize ||
            (autoSaveSpinner?.value as? Int) != settings.autoSaveDelayMs
    }

    override fun apply() {
        val settings = EditorSettingsService.getInstance()
        val state = settings.state
        state.defaultMode = defaultModeCombo?.selectedItem as? String ?: "wysiwyg"
        state.typewriterMode = typewriterCheckbox?.isSelected ?: false
        state.showLineNumbers = lineNumbersCheckbox?.isSelected ?: true
        state.fontSize = (fontSizeSpinner?.value as? Int) ?: 16
        state.autoSaveDelayMs = (autoSaveSpinner?.value as? Int) ?: 1000
        settings.loadState(state)
    }

    override fun reset() {
        val settings = EditorSettingsService.getInstance().state
        defaultModeCombo?.selectedItem = settings.defaultMode
        typewriterCheckbox?.isSelected = settings.typewriterMode
        lineNumbersCheckbox?.isSelected = settings.showLineNumbers
        fontSizeSpinner?.value = settings.fontSize
        autoSaveSpinner?.value = settings.autoSaveDelayMs
    }

    override fun disposeUIResources() {
        panel = null
        defaultModeCombo = null
        typewriterCheckbox = null
        lineNumbersCheckbox = null
        fontSizeSpinner = null
        autoSaveSpinner = null
    }
}
