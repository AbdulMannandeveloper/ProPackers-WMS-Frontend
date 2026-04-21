import { defineConfig } from 'orval'

const baseApiUrl = 'http://localhost:8000'
const schemaTarget = `${baseApiUrl}/schema/`

export default defineConfig({
  api: {
    input: {
      target: schemaTarget,
    },
    output: {
      target: './src/api/endpoints/client.ts',
      mode: 'tags' as const,
      clean: true,
      prettier: false,
      tsconfig: './tsconfig.app.json',
      override: {
        mutator: {
          path: './src/api/http-client.ts',
          name: 'httpClient',
          default: true,
        },
        requestOptions: false,
      },
    },
  },
})
