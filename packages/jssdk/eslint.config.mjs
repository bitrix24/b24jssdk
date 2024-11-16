import unjs from "eslint-config-unjs";

export default unjs({
	ignores: [
		'src/pullClient/protobuf/*.js'
	],
	rules: {
		"unicorn/switch-case-braces": "off",
		"no-prototype-builtins": "off",
		"unicorn/prefer-ternary": "off",
		"unicorn/no-typeof-undefined": "off",
		"unicorn/no-zero-fractions": "off",
		"unicorn/no-null": "off",
		"no-null": "off",
		"unicorn/no-useless-promise-resolve-reject": "off",
		"unicorn/numeric-separators-style": [
			"error",
			{
				"onlyIfContainsSeparator": true,
				"number": {
					"minimumDigits": 0,
					"groupLength": 3
				}
			}
		]
	},
	markdown: {
		rules: {
			// markdown rule overrides
		},
	},
});