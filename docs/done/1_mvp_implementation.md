# MVP 구현 문서: IntelliJ Markdown WYSIWYG Editor Plugin

## 1. 프로젝트 초기 셋업

### 1.1 Gradle 프로젝트 구조

```
intellij-plugin-markdown-editor/
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── gradle/
│   └── wrapper/
├── src/
│   ├── main/
│   │   ├── kotlin/
│   │   │   └── com/github/kenshin579/markdowneditor/
│   │   │       ├── editor/
│   │   │       │   ├── MarkdownEditorProvider.kt
│   │   │       │   ├── MarkdownFileEditor.kt
│   │   │       │   └── MarkdownHtmlPanel.kt
│   │   │       ├── controller/
│   │   │       │   ├── PreviewStaticServer.kt
│   │   │       │   ├── MarkdownFileController.kt
│   │   │       │   └── ImageUploadController.kt
│   │   │       ├── model/
│   │   │       │   └── MarkdownResponse.kt
│   │   │       ├── service/
│   │   │       │   └── EditorSettingsService.kt
│   │   │       └── listener/
│   │   │           └── JcefSupportCheck.kt
│   │   └── resources/
│   │       ├── META-INF/
│   │       │   └── plugin.xml
│   │       ├── template/
│   │       │   └── editor.html
│   │       └── vditor/           ← 번들링된 Vditor 라이브러리
│   │           ├── dist/
│   │           └── ...
│   └── test/
│       └── kotlin/
│           └── com/github/kenshin579/markdowneditor/
├── docs/
└── CLAUDE.md
```

### 1.2 build.gradle.kts 핵심 설정

```kotlin
plugins {
    id("java")
    id("org.jetbrains.kotlin.jvm") version "1.9.25"
    id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "com.github.kenshin579"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2024.2")
        bundledPlugin("com.intellij.java")
        pluginVerifier()
        zipSigner()
        instrumentationTools()
    }
}

kotlin {
    jvmToolchain(21)
}

intellijPlatform {
    pluginConfiguration {
        id = "com.github.kenshin579.markdown-editor"
        name = "Markdown WYSIWYG Editor"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "242"    // 2024.2
            untilBuild = provider { null }
        }
    }
}
```

### 1.3 plugin.xml

```xml
<idea-plugin>
    <id>com.github.kenshin579.markdown-editor</id>
    <name>Markdown WYSIWYG Editor</name>
    <vendor>kenshin579</vendor>

    <depends>com.intellij.modules.platform</depends>

    <extensions defaultExtensionNs="com.intellij">
        <!-- 커스텀 에디터 -->
        <fileEditorProvider
            implementation="com.github.kenshin579.markdowneditor.editor.MarkdownEditorProvider"/>

        <!-- 내장 HTTP 서버 핸들러 -->
        <httpRequestHandler
            implementation="com.github.kenshin579.markdowneditor.controller.PreviewStaticServer"/>

        <!-- JCEF 지원 확인 -->
        <postStartupActivity
            implementation="com.github.kenshin579.markdowneditor.listener.JcefSupportCheck"/>

        <!-- 설정 -->
        <applicationService
            serviceImplementation="com.github.kenshin579.markdowneditor.service.EditorSettingsService"/>
    </extensions>
</idea-plugin>
```

## 2. 핵심 컴포넌트 구현

### 2.1 MarkdownEditorProvider

`.md` 파일을 열 때 커스텀 WYSIWYG 에디터 탭을 등록하는 `FileEditorProvider`.

```kotlin
class MarkdownEditorProvider : FileEditorProvider {
    override fun accept(project: Project, file: VirtualFile): Boolean {
        // .md 파일이고 JCEF 지원하는 경우만 활성화
        return file.extension == "md" && JBCefApp.isSupported()
    }

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        return MarkdownFileEditor(project, file)
    }

    override fun getEditorTypeId(): String = "markdown-wysiwyg-editor"
    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.PLACE_AFTER_DEFAULT_EDITOR
}
```

- `PLACE_AFTER_DEFAULT_EDITOR`: 기본 Markdown 플러그인 에디터 뒤에 탭 추가 (공존)
- JCEF 미지원 IDE에서는 탭 자체가 나타나지 않음

### 2.2 MarkdownFileEditor

`FileEditor` 구현체. JCEF 브라우저 패널을 생성하고 관리한다.

```kotlin
class MarkdownFileEditor(
    private val project: Project,
    private val file: VirtualFile
) : UserDataHolderBase(), FileEditor {

    private val panel: MarkdownHtmlPanel = MarkdownHtmlPanel(project, file)

    override fun getComponent(): JComponent = panel.component
    override fun getPreferredFocusedComponent(): JComponent = panel.component
    override fun getName(): String = "Markdown Editor"

    // 파일 변경 감지 → 에디터 동기화
    override fun isModified(): Boolean = false  // HTTP 기반 저장이므로 IDE 관리 불필요

    override fun dispose() {
        panel.dispose()
    }
}
```

### 2.3 MarkdownHtmlPanel (JCEF 브라우저)

`JCEFHtmlPanel`을 확장하여 Vditor 에디터를 로드하는 핵심 컴포넌트.

**주요 구현 사항:**

1. **HTML 템플릿 로드**: `template/editor.html`을 로드하고 변수 치환
2. **JS ↔ Kotlin 브릿지**: `JBCefJSQuery`로 양방향 통신
3. **IDE 테마 연동**: `EditorColorsManager` 리스너로 Dark/Light 전환 감지
4. **클립보드 통합**: IDE의 Copy/Paste 동작을 JCEF 브라우저와 연결
5. **컨텍스트 메뉴**: 우클릭 메뉴를 IDE 스타일로 오버라이드

```kotlin
class MarkdownHtmlPanel(
    private val project: Project,
    private val file: VirtualFile
) : JCEFHtmlPanel(null) {

    private val jsQuery = JBCefJSQuery.create(this as JBCefBrowser)

    init {
        // JS → Kotlin 콜백 등록
        jsQuery.addHandler { request ->
            handleJsRequest(request)
            null
        }

        // HTML 템플릿 로드
        val html = loadTemplate()
        loadHTML(html)
    }

    private fun loadTemplate(): String {
        val template = ResourceUtil.getResource(
            javaClass.classLoader, "template", "editor.html"
        ).readText()

        val isDark = EditorColorsManager.getInstance().isDarkEditor
        return template
            .replace("{{filePath}}", file.path)
            .replace("{{darcula}}", isDark.toString())
            .replace("{{serverUrl}}", getServerUrl())
    }
}
```

### 2.4 PreviewStaticServer (HTTP 요청 핸들러)

IntelliJ 내장 HTTP 서버(`HttpRequestHandler`)를 확장하여 에디터의 API 엔드포인트를 제공한다.

```kotlin
class PreviewStaticServer : HttpRequestHandler() {

    override fun isAccessible(request: HttpRequest): Boolean {
        return request.uri().startsWith(PREFIX)
    }

    override fun process(
        urlDecoder: QueryStringDecoder,
        request: FullHttpRequest,
        context: ChannelHandlerContext
    ): Boolean {
        val path = urlDecoder.path().removePrefix(PREFIX)
        return when {
            path.startsWith("api/file") -> MarkdownFileController.handle(urlDecoder, request, context)
            path.startsWith("api/upload") -> ImageUploadController.handle(urlDecoder, request, context)
            path.startsWith("resources/") -> ResourcesController.handle(urlDecoder, request, context)
            else -> false
        }
    }

    companion object {
        const val PREFIX = "/markdown-editor/"
    }
}
```

### 2.5 MarkdownFileController

마크다운 파일 읽기/쓰기 API.

```kotlin
object MarkdownFileController {
    // GET: 파일 내용 읽기
    fun readFile(file: VirtualFile): String {
        return ReadAction.compute<String, Throwable> {
            FileDocumentManager.getInstance()
                .getDocument(file)?.text ?: ""
        }
    }

    // POST: 파일 내용 저장
    fun writeFile(file: VirtualFile, content: String) {
        ApplicationManager.getApplication().invokeLaterOnWriteThread {
            WriteCommandAction.runWriteCommandAction(project) {
                val document = FileDocumentManager.getInstance().getDocument(file)
                document?.setText(content)
            }
        }
    }
}
```

**스레딩 규칙:**
- 읽기: `ReadAction.compute` (read lock)
- 쓰기: `invokeLaterOnWriteThread` + `WriteCommandAction` (write lock + undo 지원)

## 3. Vditor 통합

### 3.1 번들링

Vditor JS/CSS 파일을 플러그인 리소스에 포함하여 오프라인 동작을 보장한다.

```
src/main/resources/vditor/
├── dist/
│   ├── index.min.js
│   ├── index.css
│   └── js/
│       ├── highlight.js/
│       ├── katex/
│       ├── mermaid/
│       └── ...
```

`ResourcesController`가 `/resources/vditor/**` 경로로 정적 파일을 서빙한다.

### 3.2 editor.html 템플릿

JCEF에 로드되는 메인 HTML. Vditor 초기화와 IDE 연동 로직을 포함한다.

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="{{serverUrl}}/resources/vditor/dist/index.css"/>
    <style>
        /* IDE 테마 연동 스타일 */
        body { background: {{bgColor}}; color: {{fgColor}}; }
    </style>
</head>
<body>
    <div id="vditor"></div>

    <script src="{{serverUrl}}/resources/vditor/dist/index.min.js"></script>
    <script>
        const vditor = new Vditor('vditor', {
            mode: 'wysiwyg',        // 라이브 렌더링 모드
            value: '',               // initValue()에서 로드
            cache: { enable: false },
            toolbar: [...],

            input(value) {
                // 내용 변경 시 저장 트리거
                markDirty();
            },
            blur(value) {
                // 포커스 아웃 시 자동 저장
                saveToFile(value);
            },
            after() {
                // 초기화 완료 → 파일 내용 로드
                initValue();
            }
        });

        // IDE에서 파일 내용 로드
        async function initValue() {
            const resp = await fetch('{{serverUrl}}/api/file/read?path={{filePath}}');
            const data = await resp.json();
            vditor.setValue(data.content);
        }

        // 파일 저장
        async function saveToFile(content) {
            await fetch('{{serverUrl}}/api/file/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: '{{filePath}}', content: content })
            });
        }
    </script>
</body>
</html>
```

### 3.3 Vditor 모드 전환

| Vditor 모드 | PRD 뷰 모드 | 설정값 |
|-------------|-------------|--------|
| `wysiwyg` | 라이브 렌더링 (기본) | `mode: 'wysiwyg'` |
| `ir` (Instant Rendering) | - (미사용) | - |
| `sv` (Split View) | 소스 모드 | `mode: 'sv'` 에서 프리뷰 숨김 처리 |

소스 모드 전환은 `vditor.switchMode('sv')` 호출 후 프리뷰 패널을 CSS로 숨겨 순수 소스 편집만 노출한다.
또는 Vditor API의 `getValue()`로 소스를 추출하여 별도 텍스트 에디터 패널에 표시하는 방식도 가능하다.

## 4. Slash 커맨드 구현

### 4.1 Vditor 힌트 시스템 활용

Vditor에는 `hint` 옵션이 내장되어 있어, `/` 입력 시 커스텀 팝업을 표시할 수 있다.

```javascript
const vditor = new Vditor('vditor', {
    hint: {
        // '/' 입력 시 커맨드 목록 반환
        extend: [
            {
                key: '/',
                hint(key) {
                    // key = '/' 이후 입력 문자열 (필터용)
                    return filterCommands(key);
                }
            }
        ]
    }
});

function filterCommands(query) {
    const commands = [
        // Basic Blocks
        { value: '#',       html: '<b>H1</b> Heading 1' },
        { value: '##',      html: '<b>H2</b> Heading 2' },
        { value: '###',     html: '<b>H3</b> Heading 3' },
        { value: '- ',      html: '<b>Bullet</b> Bulleted list' },
        { value: '1. ',     html: '<b>Num</b> Numbered list' },
        { value: '- [ ] ',  html: '<b>Todo</b> Checklist' },
        { value: '> ',      html: '<b>Quote</b> Quote block' },
        { value: '---\n',   html: '<b>Div</b> Divider' },
        // Media
        { value: '```\n',   html: '<b>Code</b> Code block' },
        // ... 기타 커맨드
    ];

    return commands.filter(cmd =>
        cmd.html.toLowerCase().includes(query.toLowerCase())
    );
}
```

### 4.2 커스텀 Slash 커맨드 (Vditor 힌트 한계 시)

Vditor 힌트로 카테고리 그룹핑이 부족하면, `/` 키 입력을 인터셉트하여 커스텀 HTML 팝업을 직접 구현한다.

```javascript
// 커스텀 슬래시 메뉴
document.addEventListener('keydown', (e) => {
    if (e.key === '/' && isLineStart()) {
        e.preventDefault();
        showSlashMenu(getCursorPosition());
    }
});

function showSlashMenu(position) {
    const menu = document.getElementById('slash-menu');
    menu.style.left = position.x + 'px';
    menu.style.top = position.y + 'px';
    menu.style.display = 'block';
    // 카테고리별 렌더링, 키보드 네비게이션 등
}
```

## 5. 이미지 삽입

### 5.1 ImageUploadController

```kotlin
object ImageUploadController {
    fun handle(request: FullHttpRequest, project: Project, basePath: String): UploadResponse {
        // 1. 멀티파트 요청에서 이미지 데이터 추출
        // 2. 프로젝트 기준 상대 경로에 파일 저장
        // 3. 마크다운 이미지 경로 반환 (상대 경로)
        val relativePath = saveImage(imageData, project, basePath)
        return UploadResponse(
            succMap = mapOf(fileName to relativePath)
        )
    }
}
```

### 5.2 Vditor 업로드 설정

```javascript
const vditor = new Vditor('vditor', {
    upload: {
        url: '{{serverUrl}}/api/upload?project={{projectPath}}&filePath={{filePath}}',
        accept: 'image/*',
        handler(files) {
            // 파일 업로드 후 마크다운 이미지 삽입
        }
    }
});
```

## 6. IDE 테마 연동

### 6.1 Dark/Light 모드 감지

```kotlin
// MarkdownFileEditor 초기화 시
EditorColorsManager.getInstance().addEditorColorsListener({ scheme ->
    val isDark = ColorUtil.isDark(scheme.defaultBackground)
    // JS 함수 호출로 Vditor 테마 전환
    panel.executeJavaScript("switchTheme($isDark)")
}, this)
```

### 6.2 JS 테마 전환

```javascript
function switchTheme(isDark) {
    vditor.setTheme(
        isDark ? 'dark' : 'classic',        // 에디터 테마
        isDark ? 'dark' : 'light',           // 콘텐츠 테마
        isDark ? 'native' : 'github'         // 코드 하이라이트 테마
    );
}
```

## 7. JCEF 지원 확인

```kotlin
class JcefSupportCheck : StartupActivity {
    override fun runActivity(project: Project) {
        if (!JBCefApp.isSupported()) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("Markdown Editor")
                .createNotification(
                    "Markdown WYSIWYG Editor requires JCEF support.",
                    NotificationType.WARNING
                )
                .notify(project)
        }
    }
}
```
