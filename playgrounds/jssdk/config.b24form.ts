interface B24FormConfig {
	formId: number,
	secret: string,
	loaderScript: string
}

const b24FormConfig: B24FormConfig = {
	formId: Number(import.meta.env.VITE_B24_FORM_ID) || 0,
	secret: import.meta.env.VITE_B24_FORM_SECRET || 0,
	loaderScript: import.meta.env.VITE_B24_FORM_LOADER_SCRIPT || '',
};

export default b24FormConfig;