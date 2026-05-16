import httpClient from '../http-client'

const BASE = '/api/health'

export const getHealth = () => httpClient({ method: 'GET', url: `${BASE}/` })

export default { getHealth }
