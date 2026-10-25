// Flat ESLint config: typescript-eslint for all TS, n8n community/node/credential rules for node sources.
import js from '@eslint/js';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.tgz'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
		},
	},
	{
		files: ['src/nodes/**/*.ts', 'src/credentials/**/*.ts'],
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: { ...n8nNodesBase.configs.community.rules },
	},
	{
		files: ['src/credentials/**/*.ts'],
		rules: {
			...n8nNodesBase.configs.credentials.rules,
			// "Only applicable to nodes in the main repository": community credentials link to a full documentation URL.
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
		},
	},
	{
		files: ['src/nodes/**/*.node.ts'],
		rules: {
			...n8nNodesBase.configs.nodes.rules,
		},
	},
	{
		files: ['**/*.mjs', '**/*.cjs'],
		languageOptions: {
			globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', structuredClone: 'readonly', AbortSignal: 'readonly', fetch: 'readonly', Response: 'readonly', __dirname: 'readonly', require: 'readonly', module: 'writable' },
		},
		rules: { '@typescript-eslint/no-require-imports': 'off' },
	},
);
