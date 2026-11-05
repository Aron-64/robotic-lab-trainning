import {isIP} from 'node:net'
const normalize=ip=>String(ip??'').replace(/^::ffff:/,'')
export function trustedModelCaller(address,env=process.env){
 const ip=normalize(address)
 if(['127.0.0.1','::1'].includes(ip))return true
 return String(env.MODEL_TRUSTED_PROXY_IPS??'').split(',').map(s=>normalize(s.trim())).filter(s=>isIP(s)).includes(ip)
}
export function modelRequestOriginAllowed(req,env=process.env){
 if(req.headers['content-type']?.split(';')[0]!=='application/json'||!req.headers.origin)return false
 let origin;try{origin=new URL(req.headers.origin);if(!['http:','https:'].includes(origin.protocol))return false}catch{return false}
 if(origin.host===req.headers.host)return true
 // A trusted proxy may rewrite Host. Never trust client-supplied X-Forwarded-*.
 return trustedModelCaller(req.socket?.remoteAddress,env)&&String(env.MODEL_ALLOWED_ORIGINS??'').split(',').map(s=>s.trim()).includes(origin.origin)
}
