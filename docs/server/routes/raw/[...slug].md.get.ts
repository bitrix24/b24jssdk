import { queryCollection } from '@nuxt/content/server'
import { stringify } from 'minimark/stringify'
import { withLeadingSlash } from 'ufo'

function convertHtmlTableToMarkdown(input: string): string {
  // Регулярные выражения для парсинга HTML таблицы
  const tableRegex = /<table>(.*?)<\/table>/s;
  const rowRegex = /<tr>(.*?)<\/tr>/gs;
  const cellRegex = /<(?:th|td)>(.*?)<\/(?:th|td)>/gs;

  const tableMatch = input.match(tableRegex);

  if (!tableMatch) {
    return input; // Если нет таблицы, возвращаем как есть
  }

  const tableContent = tableMatch[1];
  const rows: string[] = [];
  let rowMatch: RegExpExecArray | null;

  // Извлекаем все строки
  while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
    rows.push(rowMatch[1]);
  }

  if (rows.length === 0) {
    return input;
  }

  // Преобразуем в markdown
  const markdownRows: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const cells: string[] = [];
    const rowContent = rows[i];
    let cellMatch: RegExpExecArray | null;

    // Сбрасываем lastIndex для регулярного выражения
    cellRegex.lastIndex = 0;

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].trim());
    }

    if (cells.length > 0) {
      markdownRows.push(`| ${cells.join(' | ')} |`);

      // Добавляем разделитель после заголовка
      if (i === 0) {
        const separator = cells.map(() => '---').join(' | ');
        markdownRows.push(`| ${separator} |`);
      }
    }
  }

  // Заменяем таблицу в исходном тексте
  const markdownTable = markdownRows.join('\n');
  return input.replace(tableRegex, markdownTable);
}

function convertAllHtmlTablesToMarkdown(input: string): string {
  let result = input;

  // Находим и заменяем все таблицы
  const tableRegex = /<table>(.*?)<\/table>/gs;

  return result.replace(tableRegex, (tableHtml: string) => {
    // Извлекаем содержимое между тегами table
    const contentMatch = tableHtml.match(/<table>(.*?)<\/table>/s);
    if (!contentMatch) return tableHtml;

    const tableContent = contentMatch[1];
    const rowRegex = /<tr>(.*?)<\/tr>/gs;
    const rows: string[] = [];
    let rowMatch: RegExpExecArray | null;

    // Извлекаем все строки
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      rows.push(rowMatch[1]);
    }

    if (rows.length === 0) return tableHtml;

    // Преобразуем в markdown
    const markdownRows: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const cellRegex = /<(?:th|td)>(.*?)<\/(?:th|td)>/gs;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      cellRegex.lastIndex = 0;
      while ((cellMatch = cellRegex.exec(rows[i])) !== null) {
        cells.push(cellMatch[1].trim());
      }

      if (cells.length > 0) {
        markdownRows.push(`| ${cells.join(' | ')} |`);

        if (i === 0) {
          const separator = cells.map(() => '---').join(' | ');
          markdownRows.push(`| ${separator} |`);
        }
      }
    }

    return markdownRows.join('\n');
  });
}

export default eventHandler(async (event) => {
  const slug = getRouterParams(event)['slug.md']
  if (!slug?.endsWith('.md')) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
  }

  const path = withLeadingSlash(slug.replace('.md', ''))
  const page = await queryCollection(event, 'docs').path(path).first()
  if (!page) {
    throw createError({ statusCode: 404, statusMessage: `Page (${path}) not found`, fatal: true })
  }

  // Add title and description to the top of the page if missing
  if (page.body.value[0]?.[0] !== 'h1') {
    page.body.value.unshift(['blockquote', {}, page.description])
    page.body.value.unshift(['h1', {}, page.title])
  }

  const transformedPage = await transformMDC(event, {
    title: page.title,
    body: page.body
  })

  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')

  /**
   * @see docs/server/utils/transformMDC.ts
   * @see docs/server/plugins/llms.ts
   * @see docs/server/routes/raw/[...slug].md.get.ts
   */
  return convertHtmlTableToMarkdown(stringify({ ...transformedPage.body, type: 'minimark' }, { format: 'markdown/html' }))
    .replaceAll('%br%', '\n')
    .replaceAll('%br>%', '\n> ')
    .replaceAll('> \n', '')
    .replaceAll('> \n', '')
    .replaceAll('\n\n\n', '\n\n')
    .replaceAll('\n\n\n', '\n\n')
    .replaceAll('\n\n\n', '\n\n')
})
