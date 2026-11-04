import { useErrorsStore } from '../stores/errors'
// Reserved for the future FastAPI integration. The Demo never calls this client.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
 try {
  const response = await fetch(`${baseURL}${path}`, init)
  if (!response.ok) {
   useErrorsStore().report({ title:'服务请求失败', message:`服务返回 HTTP ${response.status}，本次操作未完成。`, suggestion:'检查服务状态与访问权限后重新操作。', code:`HTTP_${response.status}`, demo:false })
   throw new Error(`API request failed: ${response.status}`)
  }
  try { return await response.json() as T }
  catch(error) {
   useErrorsStore().report({title:'服务数据格式异常',message:'无法解析服务返回的数据。',suggestion:'请联系管理员检查接口响应格式。',code:'INVALID_RESPONSE',demo:false})
   throw error
  }
 } catch(error) {
  if(error instanceof TypeError) useErrorsStore().report({title:'无法连接服务',message:'网络请求失败，本次操作未完成。',suggestion:'检查网络连接及后端服务是否可用，然后重新操作。',code:'NETWORK_ERROR',demo:false})
  throw error
 }
}
