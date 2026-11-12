import js from '@eslint/js'

export default [
  { ignores: ['coverage/'] },
  js.configs.recommended,
  {
    files: ['scripts/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        $request: 'readonly',
        $response: 'readonly',
        $done: 'readonly',
      },
    },
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
]
