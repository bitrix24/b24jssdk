export function useRestApiVersions() {
  const restApiVersion = useCookie(
    'bitrix24-jssdk-rest-api-version',
    { default: () => 'rest-api-ver2' }
  )
  const { track } = useAnalytics()

  function setRestapiVersion(value: 'rest-api-ver2' | 'rest-api-ver3') {
    restApiVersion.value = value
    track('RestApiVersion Switched', { restapiVersion: value })
  }

  const restApiVersions = computed(() => [{
    label: 'restApi:v2',
    value: 'rest-api-ver2',
    onSelect: () => setRestapiVersion('rest-api-ver2')
  }, {
    label: 'restApi:v3',
    value: 'rest-api-ver3',
    onSelect: () => setRestapiVersion('rest-api-ver3')
  }].map(f => ({ ...f, active: restApiVersion.value === f.value })))

  return {
    restApiVersion,
    restApiVersions
  }
}
