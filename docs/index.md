---
layout: home

hero:
  name: "@bitrix24/jssdk"
  text: "Bitrix24 REST API JS SDK"
  tagline: Bitrix24 REST API JS SDK
  actions:
    - theme: brand
      text: Markdown Examples
      link: /markdown-examples
    - theme: alt
      text: GitHub
      link: https://github.com/bitrix24/b24jssdk

features:
  - title: Feature A
    details: Lorem ipsum dolor sit amet, consectetur adipiscing elit
  - title: Feature B
    details: Lorem ipsum dolor sit amet, consectetur adipiscing elit
  - title: Feature C
    details: Lorem ipsum dolor sit amet, consectetur adipiscing elit
---

---

# B24.Hook
- BX24.callMethod - B24.callMethod | B24.callListMethod | B24.fetchListMethod
- BX24.callBatch - B24.callBatch

# B24.Frame

https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/index.html

Connecting and Using BX24.js

???

---

- B24.setLogger
- B24.getHttpClient

https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/index.html
- B24.auth

---

BX24.getAuth - B24.auth.getAuthData
BX24.refreshAuth - B24.auth.refreshAuth

BX24.init - B24.isInit
BX24.install - B24.isFirstRun || B24.isInstallMode
BX24.installFinish - B24.installFinish

https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/how-to-call-rest-methods/index.html

---

- BX24.callMethod - B24.callMethod | B24.callListMethod | B24.fetchListMethod
- BX24.callBatch - B24.callBatch
- BX24.callBind - ???
- BX24.callUnbind - ???
- Process Files - ???

https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/index.html
- B24.parent
- B24.properties
- B24.slider

---

- BX24.isAdmin - (+)B24.properties.userInfo.isAdmin || B24.auth.isAdmin
- BX24.getLang - (+)B24.getLang
- BX24.resizeWindow - B24.parent.resizeWindow && B24.parent.resizeWindowAuto
- BX24.fitWindow - B24.parent.fitWindow
- BX24.getScrollSize - B24.parent.getScrollSize
- BX24.scrollParentWindow - B24.parent.scrollParentWindow
- BX24.reloadWindow - B24.parent.reloadWindow
- BX24.setTitle - B24.parent.setTitle
- BX24.ready - ?
- BX24.isReady - ?
- BX24.getDomain - (+)B24.properties.hostName || B24.getTargetOrigin || B24.slider.getTargetOrigin || B24.getTargetOriginWithPath || B24.slider.getUrl  && B24.getAppSid
- BX24.im.callTo - (+)B24.parent.imCallTo
- BX24.im.phoneTo - (+)B24.parent.imPhoneTo
- BX24.im.openMessenger - (+)B24.parent.imOpenMessenger
- BX24.im.openHistory - ?? (+)B24.parent.imOpenHistory
- BX24.openPath - (+)B24.slider.openPath
- BX24.openApplication - B24.slider.openSliderAppPage
- BX24.closeApplication - B24.parent.closeApplication

- BX24.proxy - @depricate
- BX24.proxyContext - @depricate
- BX24.bind - @depricate
- BX24.unbind - @depricate
- BX24.loadScript - @depricate

https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-dialogues/index.html
- BX24.selectUser - ??
- BX24.selectUsers - ??
- BX24.selectAccess - ??
- BX24.selectCRM - ??

https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/options/index.html
- B24.options

---

- BX24.userOption.set - B24.options.userSet
- BX24.userOption.get - B24.options.userGet
- BX24.appOption.set - B24.options.appSet
- BX24.appOption.get - B24.options.appGet

## properties
- B24.properties

---

- B24.properties.licenseInfo
- B24.properties.paymentInfo
- B24.properties.appInfo
- B24.properties.hostName
- B24.properties.userInfo
- B24.properties.forB24Form

## placement
- B24.placement - ??