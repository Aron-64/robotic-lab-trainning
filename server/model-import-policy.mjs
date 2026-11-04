export function validateImport(input) {
 const name=String(input.name??'').trim()
 if(!name||name.length>80)throw new Error('请输入 1～80 字的模型名称。')
 function url(value){const u=new URL(String(value));if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)throw new Error('请使用不含凭据、查询参数和片段的 HTTPS 仓库首页地址。');return u}
 const github=url(input.github)
 const parts=github.pathname.replace(/\/$/,'').split('/').filter(Boolean)
 if(github.hostname!=='github.com'||parts.length!==2||parts.some(p=>!/^[-\w.]+$/.test(p)))throw new Error('GitHub 地址格式应为 https://github.com/组织/仓库。')
 const weights=url(input.weights)
 const segments=weights.pathname.replace(/\/$/,'').split('/').filter(Boolean)
 let provider
 if(weights.hostname==='huggingface.co'){provider='huggingface';if(segments.length!==2)throw new Error('请填写 Hugging Face 模型仓库首页，不是文件或 tree 地址。')}
 else if(['modelscope.cn','www.modelscope.cn'].includes(weights.hostname)){provider='modelscope';if(segments[0]==='models')segments.shift();if(segments.length!==2)throw new Error('请填写 ModelScope 模型仓库首页。')}
 else throw new Error('权重地址只支持 Hugging Face 或 ModelScope。')
 if(segments.some(p=>!/^[-\w.]+$/.test(p)||p==='.'||p==='..'))throw new Error('权重仓库 ID 无效。')
 const revision=String(input.revision??'').trim()
 if(revision&&!/^[\w./-]{1,120}$/.test(revision))throw new Error('权重版本仅支持分支、标签或 commit ID。')
 if(!['python3','python3.10','python3.11','python3.12','python3.13'].includes(input.python??'python3'))throw new Error('请选择支持的 Python 可执行文件。')
 return {name,github:`https://github.com/${parts.join('/').replace(/\.git$/,'')}.git`,weights:weights.href,provider,repoId:segments.join('/'),revision,python:input.python??'python3'}
}
// Only exact, local pip installation commands are automated. README is never executed as a shell script.
export function readmePlan(readme, pythonVersion) {
 const blocks=[...readme.matchAll(/```(?:bash|sh|shell|console|text)?[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1])
 const lines=blocks.flatMap(b=>b.replace(/\\\r?\n/g,' ').split(/\r?\n/)).map(l=>l.trim().replace(/^\$\s*/,''))
 const installs=[],unsupported=[]
 for(const line of lines) {
  if(!line||line.startsWith('#'))continue
  const pip=line.match(/^(?:python(?:3(?:\.\d+)?)?\s+-m\s+)?pip(?:3)?\s+install\s+(.+?)(?:\s+#.*)?$/)
  if(pip){const args=pip[1].trim();let m
   if((m=args.match(/^-r\s+([\w./-]+\.txt)$/))&&!m[1].startsWith('/')&&!m[1].split('/').includes('..'))installs.push({args:['-r',m[1]],label:line,file:m[1]})
   else if(/^(?:-e\s+)?\.(?:\[[\w,-]+\])?$/.test(args))installs.push({args:args.split(/\s+/),label:line,file:'.'})
   else unsupported.push(line)
  } else if(/(?:^|\s)(?:sudo|apt|apt-get|conda|mamba|uv|bash|sh|make|cmake|curl|wget|npm|docker|chmod|export)\s/.test(line)||/^git\s+(?:submodule|lfs)\s/.test(line)||/^cd\s/.test(line)&&!/^cd\s+[\w-]+\s*$/.test(line))unsupported.push(line)
 }
 const expected=readme.match(/(?:python\s*[=~]\s*|python==|python-version\s*[:=]\s*['"]?)(3\.\d+)/i)?.[1]
 if(expected&&!pythonVersion.startsWith(expected+'.'))unsupported.push(`README 要求 Python ${expected}，当前选择 ${pythonVersion}`)
 const unique=installs.filter((p,i,all)=>all.findIndex(x=>x.label===p.label)===i)
 return {commands:unique,unsupported:[...new Set(unsupported)].slice(0,30),automatic:unique.length>0&&unsupported.length===0,expectedPython:expected??null}
}
