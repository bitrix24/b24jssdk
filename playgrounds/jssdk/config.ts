interface B24HookConfig {
	b24Url: string,
	userId: number,
	secret: string
}

const b24HookConfig: B24HookConfig = {
	b24Url: import.meta.env.VITE_B24_HOOK_URL || '',
	userId: Number(import.meta.env.VITE_B24_HOOK_USER_ID) || 0,
	secret: import.meta.env.VITE_B24_HOOK_SECRET || '',
};

export default b24HookConfig;