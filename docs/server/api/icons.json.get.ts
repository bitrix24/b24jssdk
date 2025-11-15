export default eventHandler(async () => {
  const list = await import('@bitrix24/b24icons-vue/metadata.json', { with: { type: 'json' } })

  return list?.default?.list || []
})
