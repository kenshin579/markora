# Markora 에디터 비교 샘플

## 1. 텍스트 서식

**굵게**, *기울임*, ~~취소선~~, `inline code`, [링크](https://example.com)

## 2. 목록

- 항목 A
- 항목 B
  - 중첩 항목 B-1
  - 중첩 항목 B-2
- 항목 C

1. 첫 번째
2. 두 번째
3. 세 번째

## 3. 체크리스트

- [x] 완료된 작업
- [ ] 진행 중인 작업
- [ ] 예정된 작업

## 4. 인용

> Markdown WYSIWYG 에디터를 비교하기 위한 샘플 문서입니다.
> 여러 줄에 걸친 인용도 잘 보이는지 확인합니다.

## 5. 코드 블록

```javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
console.log(fibonacci(10));
```

```kotlin
fun greet(name: String): String {
    return "Hello, $name!"
}
```

## 6. 표

| 라이브러리 | 모드 | 저장 포맷 |
|-----------|------|----------|
| Toast UI  | 듀얼 | Markdown |
| Milkdown  | 인라인 WYSIWYG | Markdown |
| Tiptap    | WYSIWYG | HTML |

## 7. 수식 (KaTeX)

인라인 수식: $E = mc^2$

블록 수식:

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

## 8. 구분선

---

## 9. 이미지

![placeholder](https://via.placeholder.com/300x150)
