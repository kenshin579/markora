# MVP Todo: IntelliJ Markdown WYSIWYG Editor Plugin

> PRD: `1_mvp_prd.md` | 구현: `1_mvp_implementation.md`

---

## Phase 1: 기초 인프라 (P0)

### 1-1. 프로젝트 셋업
- [x] JDK 21 설치 확인 (`java -version`)
- [x] Gradle + IntelliJ Platform Plugin 2.x 프로젝트 생성
- [x] `build.gradle.kts` 작성 (intellijIdeaCommunity 2024.2, Kotlin, jvmToolchain 21)
- [x] `settings.gradle.kts` 작성
- [x] `gradle.properties` 작성 (플러그인 메타데이터)
- [x] `.gitignore` 작성 (IntelliJ + Gradle 패턴)
- [x] `./gradlew build` 성공 확인

### 1-2. plugin.xml 등록
- [x] `src/main/resources/META-INF/plugin.xml` 작성
- [x] `fileEditorProvider` 확장 등록 (`MarkdownEditorProvider`)
- [ ] `httpRequestHandler` 확장 등록 (`PreviewStaticServer`)
- [x] `postStartupActivity` 확장 등록 (`JcefSupportCheck`)
- [x] `applicationService` 확장 등록 (`EditorSettingsService`)

### 1-3. JCEF 에디터 기본 뼈대
- [x] `MarkdownEditorProvider.kt` 구현 (.md 파일 감지, JCEF 지원 확인)
- [x] `MarkdownFileEditor.kt` 구현 (FileEditor 인터페이스)
- [x] `MarkdownHtmlPanel.kt` 구현 (JCEFHtmlPanel 확장)
- [x] JCEF 패널에 "Hello World" HTML 로드 확인
- [ ] `./gradlew runIde` 로 IDE 실행 → .md 파일 열기 → 커스텀 에디터 탭 표시 확인

### 1-4. Vditor 번들링
- [x] Vditor 라이브러리 다운로드 (dist 폴더)
- [x] `src/main/resources/vditor/` 에 번들링
- [x] `ResourcesController.kt` 구현 (정적 파일 서빙)
- [x] `template/editor.html` 작성 (Vditor 초기화)
- [ ] JCEF에서 Vditor 에디터 로드 확인 (빈 에디터 표시)

### 1-5. 파일 읽기/쓰기 연동
- [x] `PreviewStaticServer.kt` 구현 (HTTP 라우팅)
- [x] `MarkdownFileController.kt` 구현 (GET: 읽기, POST: 쓰기)
- [x] editor.html에서 파일 내용 로드 (`initValue()`)
- [x] 에디터 blur 시 파일 저장 (`saveToFile()`)
- [ ] .md 파일 열기 → Vditor에 내용 표시 → 편집 → 저장 → 소스 확인 워크플로우 동작 확인

### 1-6. IDE 테마 연동
- [x] `EditorColorsManager` 리스너로 Dark/Light 감지
- [x] MarkdownHtmlPanel 초기화 시 현재 테마 반영
- [x] JS `switchTheme()` 함수로 Vditor 테마 전환
- [x] IDE 테마 변경 시 에디터 즉시 반영 확인

---

## Phase 2: 핵심 편집 기능 (P0)

### 2-1. 뷰 모드
- [x] 라이브 렌더링 모드 (Vditor `wysiwyg` 모드) — 기본값
- [x] 소스 모드 구현 (Vditor `sv` 모드 또는 별도 텍스트 패널)
- [x] 에디터 하단 또는 툴바에 모드 전환 버튼 추가
- [x] 모드 전환 시 내용 동기화 확인

### 2-2. 기본 마크다운 요소 렌더링
- [x] 제목 (H1~H6): `#` 입력 즉시 렌더링
- [x] 볼드 (`**text**`), 이탤릭 (`*text*`), 취소선 (`~~text~~`)
- [x] 인라인 코드 (`` `code` ``)
- [x] 링크 (`[text](url)`) — 클릭 시 브라우저 오픈
- [x] 인용 블록 (`> text`)
- [x] 구분선 (`---`)
- [x] 비순서 목록 (`- `)
- [x] 순서 목록 (`1. `)

### 2-3. 체크리스트
- [x] `- [ ]`, `- [x]` 렌더링
- [x] 체크박스 클릭 → 마크다운 소스 자동 토글 (`[ ]` ↔ `[x]`)

### 2-4. 코드 블록
- [x] ` ``` ` 입력 시 코드 블록 생성
- [x] Syntax Highlighting 동작 확인 (Python, Java, Kotlin, JS, Go 등)
- [x] 언어 선택 드롭다운

### 2-5. 표
- [x] 마크다운 표 렌더링
- [x] 셀 클릭으로 비주얼 편집
- [x] 행/열 추가/삭제 (컨텍스트 메뉴 또는 버튼)

---

## Phase 3: 미디어 & 슬래시 (P0)

### 3-1. 이미지 삽입
- [x] `ImageUploadController.kt` 구현
- [x] Vditor upload 옵션 설정 (API 엔드포인트 연결)
- [x] 드래그 & 드롭으로 이미지 삽입
- [x] 클립보드 붙여넣기 (Ctrl+V / Cmd+V)로 이미지 삽입
- [x] `/image` Slash 커맨드로 파일 선택 다이얼로그
- [x] 이미지 상대 경로 저장 확인
- [x] 인라인 이미지 프리뷰 렌더링

### 3-2. Slash 커맨드 팝업 UI
- [x] `/` 입력 감지 → 드롭다운 팝업 표시
- [x] 카테고리별 그룹화 (Basic Blocks, Media)
- [x] 타이핑으로 필터링 (예: `/h` → 제목 관련만)
- [x] 키보드 `↑↓` 탐색, `Enter` 선택, `Esc` 취소
- [x] 아이콘 + 커맨드명 + 설명 표시

### 3-3. Basic Blocks 커맨드
- [x] `/text` 또는 `/plain` → 일반 텍스트 블록
- [x] `/h1` 또는 `/#` → H1 제목
- [x] `/h2` 또는 `/##` → H2 제목
- [x] `/h3` 또는 `/###` → H3 제목
- [x] `/bullet` → 비순서 목록
- [x] `/num` → 순서 목록
- [x] `/todo` → 체크리스트
- [x] `/quote` → 인용 블록
- [x] `/div` → 구분선

### 3-4. Media 커맨드
- [x] `/image` → 이미지 삽입
- [x] `/code` → 코드 블록 (언어 선택)
- [x] `/table` → 표 삽입 (행/열 지정)

---

## Phase 4: 고급 렌더링 (P1)

### 4-1. LaTeX 수식
- [ ] KaTeX 번들링 (Vditor 내장 활용)
- [ ] 인라인 수식 (`$...$`) 렌더링
- [ ] 블록 수식 (`$$...$$`) 렌더링
- [ ] `/equation` Slash 커맨드 (인라인)
- [ ] `/math` 또는 `/latex` Slash 커맨드 (블록)

### 4-2. Mermaid 다이어그램
- [ ] Mermaid.js 번들링 (Vditor 내장 활용)
- [ ] ` ```mermaid ` 코드 블록 → 다이어그램 렌더링
- [ ] `/mermaid` Slash 커맨드
- [ ] Flowchart, Sequence, Gantt 등 주요 다이어그램 동작 확인

### 4-3. 추가 커맨드
- [ ] `/toc` → 목차 자동 생성
- [ ] `/toggle` → 토글 리스트 (접기/펼치기)

---

## Phase 5: 완성도 (P2)

### 5-1. Turn Into 커맨드
- [ ] `/turntext` → 일반 텍스트로 변환
- [ ] `/turnh1` ~ `/turnh3` → 제목으로 변환
- [ ] `/turnbullet` → 비순서 목록으로 변환
- [ ] `/turnnum` → 순서 목록으로 변환
- [ ] `/turntodo` → 체크리스트로 변환
- [ ] `/turnquote` → 인용으로 변환
- [ ] `/turncode` → 코드 블록으로 변환

### 5-2. 추가 기능
- [ ] `/duplicate` → 현재 블록 복제
- [ ] `/delete` → 현재 블록 삭제
- [ ] `/emoji` → 이모지 선택 팝업

### 5-3. 설정 & UI
- [ ] 에디터 설정 UI (Settings → Tools → Markdown WYSIWYG Editor)
- [ ] 아웃라인 패널 (목차 기반 네비게이션)

### 5-4. Export
- [ ] HTML Export
- [ ] PDF Export

### 5-5. 고급 UX
- [ ] Focus 모드 (현재 블록 외 흐리게)
- [ ] Typewriter 모드 (커서 항상 화면 중앙)

### 5-6. 배포
- [ ] JetBrains Marketplace 플러그인 등록
- [ ] GitHub Actions CI/CD 파이프라인 구성
- [ ] CHANGELOG.md 작성
