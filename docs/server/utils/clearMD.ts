/**
 * @see docs/server/utils/transformMDC.ts
 * @see docs/server/plugins/llms.ts
 * @see docs/server/routes/raw/[...slug].md.get.ts
 */

function fixBr(content: string): string {
  return content
    .replaceAll('%br%', '\n')
    .replaceAll('%br>%', '\n> ')
}

function cleanSpacesPreserveCode(text: string): string {
  const codeBlocks: string[] = []
  let blockIndex = 0

  const textWithoutCode = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `__CODE_BLOCK_${blockIndex++}__`
  })

  const cleanedText = textWithoutCode.replace(/ {2,}/g, ' ')

  return cleanedText.replace(/__CODE_BLOCK_(\d+)__/g, (_, index) => {
    return codeBlocks[Number.parseInt(index)] || ''
  })
}

function clearTags(content: string): string {
  return content
    .replace(/<card-group[^>]*>/g, '').replace(/<\/card-group>/g, '')
    .replace(/<accordion[^>]*>/g, '').replace(/<\/accordion>/g, '')
    .replace(/<steps[^>]*>/g, '').replace(/<\/steps>/g, '')
    .replace(/<code-group[^>]*>/g, '').replace(/<\/code-group>/g, '')

    .replace(/:{2,}card-group[^}]*\}/g, '')
    .replace(/:{2,}accordion[^}]*\}/g, '')
    .replace(/:{2,}steps[^}]*\}/g, '')
    .replace(/:{2,}code-group[^}]*\}/g, '')

    .replace(/:{2,}\n/g, '')
}

function clearNewLine(content: string): string {
  return content
    .replace(/> \n/g, '')
    .replace(/\n{3,}/g, '\n\n')
}

function clearLangTsType(content: string): string {
  return content.replace(/\{[^}]*?lang="ts-type"[^}]*\}/g, '').trim()
}

function convertHtmlTablesToMarkdown(input: string): string {
  return input.replace(/<table>[\s\S]*?<\/table>/g, (tableHtml: string) => {
    // Упрощаем HTML
    const cleanHtml = tableHtml
      .replace(/\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()

    // Находим все строки (учитывая thead/tbody)
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g
    const rows: string[] = []
    let rowMatch: RegExpExecArray | null

    while ((rowMatch = rowRegex.exec(cleanHtml ?? '')) !== null) {
      rows.push(rowMatch[1] ?? '')
    }

    if (rows.length === 0) return tableHtml

    const markdownRows: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const cells: string[] = []
      const cellRegex = /<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g
      let cellMatch: RegExpExecArray | null

      cellRegex.lastIndex = 0
      while ((cellMatch = cellRegex.exec(rows[i] ?? '')) !== null) {
        let cellContent = cellMatch[1] ?? ''

        // Извлекаем текст из вложенных тегов
        cellContent = extractTextFromHtml(cellContent)
        cells.push(cellContent.trim())
      }

      if (cells.length > 0) {
        markdownRows.push(`| ${cells.join(' | ')} |`)

        if (i === 0) {
          const separator = cells.map(() => '---').join(' | ')
          markdownRows.push(`| ${separator} |`)
        }
      }
    }

    return markdownRows.join('\n')
      .replace(/\| -{4,} /g, '| --- ')
  })
}

function extractTextFromHtml(html: string): string {
  // Сначала обрабатываем теги code с учетом внутренних пробелов
  html = html.replace(/<code[^>]*>([\s\S]*?)<\/code>/g, (match, content) => {
    // Удаляем все пробелы в начале и конце содержимого code
    return '`' + content.trim().replace(/\s+/g, '') + '`'
  })

  // Обрабатываем теги strong с учетом внутренних пробелов
  html = html.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/g, (match, content) => {
    // Удаляем все пробелы в начале и конце содержимого strong
    return '**' + content.trim().replace(/\s+/g, ' ') + '**'
  })

  // Убираем все остальные теги и лишние пробелы
  html = html
    .replace(/<[^>]+>/g, '') // Удаляем оставшиеся теги
    .replace(/\s+/g, ' ') // Заменяем множественные пробелы на один
    .trim()

  // Очищаем от лишних пробелов вокруг markdown форматирования
  html = html
    // Убираем пробелы между ** и ` (для случаев ** `method` **)
    .replace(/\*\*\s*`/g, '**`') // Между ** и `
    .replace(/`\s*\*\*/g, '`**') // Между ` и **
    // Убираем пробелы между markdown форматированием и текстом внутри
    .replace(/\*\*(\S+)\*\*/g, '**$1**') // ** text ** → **text**
    .replace(/`(\S+)`/g, '`$1`') // ` text ` → `text`

  return html.trim()
}

export function clearMD(content: string): string {
  let result = content

  result = fixBr(result)
  result = clearLangTsType(result)
  result = convertHtmlTablesToMarkdown(result)
  result = clearTags(result)
  result = clearNewLine(result)
  result = cleanSpacesPreserveCode(result)

  return result
}
