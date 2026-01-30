export default defineNuxtPlugin({
  enforce: 'post',
  setup() {
    const { restApiVersion } = useRestApiVersions()

    if (import.meta.client) {
      useHead({
        htmlAttrs: {
          'data-restapiver': restApiVersion
        }
      })
    }

    if (import.meta.server) {
      useHead({
        script: [{
          innerHTML: `
          function getCookie(name) {
            var value = '; ' + window.document.cookie;
            var parts = value.split('; ' + name + '=');
            if (parts.length === 2) {
              return parts.pop()?.split(';').shift();
            }
          }

          var f = getCookie('bitrix24-jssdk-rest-api-version');
          document.documentElement.setAttribute('data-restapiver', f || ''rest-api-ver2');
          `.replace(/\s+/g, ' '),
          type: 'text/javascript',
          tagPriority: -1
        }]
      })
    }
  }
})
