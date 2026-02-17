package com.github.kenshin579.markora.service

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@Service(Service.Level.APP)
@State(name = "MarkoraSettings", storages = [Storage("markora.xml")])
class EditorSettingsService : PersistentStateComponent<EditorSettingsService.State> {

    data class State(
        var defaultMode: String = "wysiwyg",
        var typewriterMode: Boolean = false,
        var showLineNumbers: Boolean = true,
        var fontSize: Int = 16,
        var autoSaveDelayMs: Int = 1000
    )

    private var myState = State()

    override fun getState(): State = myState

    override fun loadState(state: State) {
        myState = state
    }

    companion object {
        fun getInstance(): EditorSettingsService {
            return com.intellij.openapi.application.ApplicationManager.getApplication()
                .getService(EditorSettingsService::class.java)
        }
    }
}
