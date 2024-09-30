import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

/**
 * @memo Alias need insert at tsconfig.json
 */

export default defineConfig({
	server: {
		port: 3000
	},
	plugins: [
		vue()
	],
	resolve: {
	}
})