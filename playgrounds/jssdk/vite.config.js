import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

/**
 * @memo Alias need insert at tsconfig.json
 */

export default defineConfig({
	server: {
		port: 3000,
		//https: true
	},
	plugins: [
		vue(),
		basicSsl()
	],
	resolve: {
	}
})