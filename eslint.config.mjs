// Flat ESLint config: typescript-eslint for all TS, plus the rules n8n's community package scanner
// (npx @n8n/scan-community-package) applies, so CI catches scan failures before a release.
import js from '@eslint/js';
import { n8nCommunityNodesPlugin } from '@n8n/eslint-plugin-community-nodes';
import n8nNodesBase from 'eslint-plugin-n8n-nodes-base';
import tseslint from 'typescript-eslint';

// n8n's standard layout: package.json's dist/<dir>/X.js maps to <dir>/X.ts at the repo root.
const SOURCES = ['credentials/**/*.ts', 'nodes/**/*.ts', 'lib/**/*.ts'];

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
	// Same ruleset the scanner runs, scoped to the package sources.
	{
		...n8nCommunityNodesPlugin.configs.recommended,
		files: SOURCES,
	},
	{
		files: SOURCES,
		rules: { 'no-console': 'error' },
	},
	{
		files: ['nodes/**/*.ts', 'credentials/**/*.ts'],
		plugins: { 'n8n-nodes-base': n8nNodesBase },
		rules: { ...n8nNodesBase.configs.community.rules },
	},
	{
		files: ['credentials/**/*.ts'],
		rules: {
			...n8nNodesBase.configs.credentials.rules,
			// "Only applicable to nodes in the main repository": community credentials link to a full documentation URL.
			'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
			'n8n-nodes-base/cred-class-field-type-options-password-missing': 'off',
		},
	},
	{
		files: ['nodes/**/*.node.ts'],
		rules: {
			...n8nNodesBase.configs.nodes.rules,
			// Superseded by @n8n/community-nodes/node-connection-type-literal (NodeConnectionTypes.Main); the scanner turns these off too.
			'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
			'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
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
