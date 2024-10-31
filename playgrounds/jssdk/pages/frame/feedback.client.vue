<script setup lang="ts">
import B24FormConfig from '../../config.b24form'
import {
	B24Frame,
	useB24Helper,
	LoadDataType,
	LoggerBrowser,
	Type
} from '@bitrix24/b24jssdk'

definePageMeta({
	layout: "slider",
})

useHead({
	bodyAttrs: {
		class: 'bg-white min-h-[700px]',
	}
})

const {
	initB24Helper,
	destroyB24Helper,
	getB24Helper
} = useB24Helper()

const $logger = LoggerBrowser.build(
	'Demo: FeedBack',
	true
)

let $b24: B24Frame
let iframe: null|HTMLIFrameElement = null

onMounted(async () => {
	try
	{
		if(
			!Type.isNumber(B24FormConfig.formId)
			|| B24FormConfig.formId < 1
			|| !Type.isStringFilled(B24FormConfig.secret)
			|| !Type.isStringFilled(B24FormConfig.loaderScript)
		)
		{
			throw new Error('You need to specify the parameters of your form')
		}
		
		iframe = document.getElementById('iframe-b24-form') as HTMLIFrameElement
		
		const { $initializeB24Frame } = useNuxtApp()
		const $b24 = await $initializeB24Frame()
		
		await initB24Helper(
			$b24,
			[
				LoadDataType.Profile,
				LoadDataType.App,
			]
		)
		
		const propertiesForB24Form = getB24Helper().forB24Form
		
		if(!iframe)
		{
			iframe = document.createElement('iframe') as HTMLIFrameElement
			iframe.id = 'iframe-b24-form'
			iframe.classList.add('mt-0', 'w-full', 'min-h-[700px]')
		}
		
		/**
		 * b24_plan - B24 tariff plan identifier (if cloud).
		 * b24_plan_date_to - Expiry date of the B24 tariff plan.
		 * b24_partner_id - ID of the B24 partner assigned to the portal.
		 * c_name - The name of the current user who filled out the form.
		 * c_email - E-mail of the current user who filled out the form.
		 * hosturl - Url of the portal from which the form was filled out.
		 * hostname - The domain of the portal from which the form was filled out.
		 *
		 * Example of working with CRM form code
		 * - @link https://helpdesk.bitrix24.com/open/13905018/?sphrase_id=142406297
		 * - @link https://helpdesk.bitrix24.com/open/8772927/?sphrase_id=142406297
		 *
		 * @link https://xxx.bitrix24.com/bitrix/services/main/ajax.php?action=ui.feedback.loadData
		 * - b24_partner_id: "112233"
		 * - b24_plan: "nfr"
		 * - b24_plan_date_to: "16.12.2024"
		 * - c_email: "email@example.com"
		 * - c_name: "Name"
		 * - hostname: "xxx.bitrix24.com"
		 * - hosturl: "https://xxx.bitrix24.com"
		 */
		
		iframe.srcdoc = `<!doctype html>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
			<body><div class=""><\/div><script data-b24-form="inline\/${B24FormConfig.formId}\/${B24FormConfig.secret}" data-skip-moving="true">
				window.addEventListener('b24:form:init', (event) =>
				{
					const form = event.detail.object;
					
					if(Number(form.identification.id) === Number(${B24FormConfig.formId}))
					{
						form.setProperty('hostname', '${(propertiesForB24Form.hostname)}');
						form.setProperty('app_code', '${(propertiesForB24Form.app_code)}');
						form.setProperty('app_status', '${(propertiesForB24Form.app_status)}');
						form.setProperty('payment_expired', '${(propertiesForB24Form.payment_expired)}');
						form.setProperty('days', '${(propertiesForB24Form.days)}');
						form.setProperty('b24_plan', '${(propertiesForB24Form.b24_plan)}');
					}
					
					form.setValues({
						'name': '${(propertiesForB24Form.c_name)}',
						'last-name': '${(propertiesForB24Form.c_last_name)}',
					});
				});
				
				(function(w,d,u){
					const s=d.createElement('script');s.async=true;s.src=u+'?'+(Date.now()\/180000|0);
					const h=d.getElementsByTagName('script')[0];h.parentNode.insertBefore(s,h);
				})(window,document,'${B24FormConfig.loaderScript}');
			<\/script><\/body>`
		document.body.appendChild(iframe)
	}
	catch(error: any)
	{
		$logger.error(error)
		showError({
			statusCode: 404,
			statusMessage: error?.message || error,
			data: {
				homePageIsHide: true,
			},
			cause: error,
			fatal: true
		})
	}
})

onUnmounted(() => {
	
	$b24?.destroy()
	destroyB24Helper()
	
	if(!!iframe)
	{
		document.body.removeChild(iframe)
		iframe = null
	}
})
</script>

<template></template>